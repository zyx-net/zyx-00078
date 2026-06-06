import bcrypt from 'bcryptjs';
import { db, initDatabase } from '../api/db/index.js';
import {
  CompensationCommitment,
  CompensationCommitmentStatus,
  CompensationCommitmentType,
  COMPENSATION_ERROR_CODES,
  CreateCompensationCommitmentRequest,
  UpdateCompensationCommitmentRequest,
  CancelCompensationCommitmentRequest,
  FulfillCompensationCommitmentRequest,
  CompensationImportResult
} from '../shared/types.js';
import {
  createCommitment,
  updateCommitment,
  getCommitmentDetail,
  getCommitmentList,
  fulfillCommitment,
  cancelCommitment,
  generateCommitmentCSV,
  importCommitmentsCSV,
  getCommitmentLogs
} from '../api/services/compensationService.js';
import {
  logOperation,
  getOperationLogs
} from '../api/repositories/compensationRepository.js';
import { login as authLogin } from '../api/services/authService.js';

function resetDatabase() {
  db.exec('DELETE FROM compensation_commitment_operation_logs');
  db.exec('DELETE FROM compensation_commitments');
  db.exec('DELETE FROM quality_inspection_operation_logs');
  db.exec('DELETE FROM quality_inspection_reviews');
  db.exec('DELETE FROM quality_inspection_items');
  db.exec('DELETE FROM quality_inspections');
  db.exec('DELETE FROM export_records');
  db.exec('DELETE FROM batch_revoke_items');
  db.exec('DELETE FROM batch_revoke_audits');
  db.exec('DELETE FROM rule_audit_logs');
  db.exec('DELETE FROM rule_hit_records');
  db.exec('DELETE FROM arbitration_rules');
  db.exec('DELETE FROM evidences');
  db.exec('DELETE FROM case_versions');
  db.exec('DELETE FROM batch_items');
  db.exec('DELETE FROM batch_operations');
  db.exec('DELETE FROM cases');
}

function createTestUsers() {
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, name, role, passwordHash)
    VALUES (?, ?, ?, ?)
  `);
  const defaultHash = '$2a$10$test';
  
  insertUser.run('leader1', '李团长', 'leader', defaultHash);
  insertUser.run('merchant1', '张商家', 'merchant', defaultHash);
  insertUser.run('cs1', '王客服', 'cs', defaultHash);
  insertUser.run('leader2', '赵团长', 'leader', defaultHash);
  insertUser.run('merchant2', '王商家', 'merchant', defaultHash);
  
  return {
    leader1: db.prepare('SELECT id FROM users WHERE username = ?').get('leader1').id,
    leader2: db.prepare('SELECT id FROM users WHERE username = ?').get('leader2').id,
    merchant1: db.prepare('SELECT id FROM users WHERE username = ?').get('merchant1').id,
    merchant2: db.prepare('SELECT id FROM users WHERE username = ?').get('merchant2').id,
    cs1: db.prepare('SELECT id FROM users WHERE username = ?').get('cs1').id
  };
}

function createTestCases(): number[] {
  const userIds = createTestUsers();
  
  const insertCase = db.prepare(`
    INSERT INTO cases (
      orderNo, caseType, productName, quantity, refundAmount,
      responsibleParty, merchantId, merchantName, createdBy, createdByName,
      description, status, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertVersion = db.prepare(`
    INSERT INTO case_versions (
      caseId, version, fromStatus, toStatus, action,
      operatorId, operatorName, operatorRole, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const cases = [
    { merchantId: userIds.merchant1, merchantName: '张商家', leaderId: userIds.leader1, leaderName: '李团长' },
    { merchantId: userIds.merchant2, merchantName: '王商家', leaderId: userIds.leader1, leaderName: '李团长' },
    { merchantId: userIds.merchant1, merchantName: '张商家', leaderId: userIds.leader2, leaderName: '赵团长' }
  ];

  const caseIds: number[] = [];
  cases.forEach((c, index) => {
    const result = insertCase.run(
      `DD2026060100${index + 1}`,
      'damaged',
      `测试商品${index + 1}`,
      index + 1,
      58.00 * (index + 1),
      'merchant',
      c.merchantId,
      c.merchantName,
      c.leaderId,
      c.leaderName,
      '测试售后申请',
      'csArbitration',
      3
    );
    const caseId = result.lastInsertRowid as number;
    caseIds.push(caseId);

    for (let v = 1; v <= 3; v++) {
      insertVersion.run(
        caseId,
        v,
        v === 1 ? null : v === 2 ? 'pendingEvidence' : 'merchantProcessing',
        v === 1 ? 'pendingEvidence' : v === 2 ? 'merchantProcessing' : 'csArbitration',
        v === 1 ? 'create' : v === 2 ? 'submitEvidence' : 'merchantRespond',
        v === 1 ? c.leaderId : v === 2 ? c.leaderId : c.merchantId,
        v === 1 ? c.leaderName : v === 2 ? c.leaderName : c.merchantName,
        v === 1 ? 'leader' : v === 2 ? 'leader' : 'merchant',
        `版本${v}操作`
      );
    }
  });

  return caseIds;
}

function login(username: string, password: string): { token: string; user: { id: number; name: string; role: 'cs' | 'merchant' | 'leader' } } {
  const result = authLogin(username, password);
  
  if (!result) {
    throw new Error(`登录失败: 用户名 ${username} 或密码错误`);
  }

  return {
    token: result.token,
    user: {
      id: result.user.id,
      name: result.user.name,
      role: result.user.role as 'cs' | 'merchant' | 'leader'
    }
  };
}

function runTest(name: string, testFn: () => void) {
  console.log(`\n=== 测试: ${name} ===`);
  try {
    testFn();
    console.log(`✅ ${name} - 通过`);
    return true;
  } catch (error) {
    console.log(`❌ ${name} - 失败`);
    console.log(`   错误: ${(error as Error).message}`);
    return false;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

initDatabase();

// 确保外键约束开启
db.pragma('foreign_keys = ON');

console.log('\n========================================');
console.log('  赔付承诺跟踪模块 - 回归测试');
console.log('========================================');

const csUser = login('cs1', '123456');
const merchantUser = login('merchant1', '123456');
const leaderUser = login('leader1', '123456');

let passed = 0;
let failed = 0;

if (runTest('1. 权限测试 - 客服创建赔付承诺（现金）', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const request: CreateCompensationCommitmentRequest = {
    caseId: caseIds[0],
    type: 'cash',
    amount: 50.00,
    dueDate: '2026-06-15',
    remark: '测试现金赔付',
    attachment: 'https://example.com/proof.jpg'
  };

  const result = createCommitment(
    request,
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === true, '创建应该成功');
  assert(result.data !== undefined, '应该返回数据');
  assert(result.data!.commitmentNo.startsWith('COMP-'), '承诺编号格式正确');
  assert(result.data!.status === 'pendingFulfillment', '状态应该是待履约');
  assert(result.data!.amount === 50.00, '金额应该正确');
  assert(result.data!.createdBy === csUser.user.id, '创建人ID正确');
  assert(result.data!.version === 1, '初始版本号为1');
})) { passed++; } else { failed++; }

if (runTest('2. 权限测试 - 团长尝试创建赔付承诺（应该拒绝）', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const request: CreateCompensationCommitmentRequest = {
    caseId: caseIds[0],
    type: 'cash',
    amount: 50.00,
    dueDate: '2026-06-15',
    remark: '团长尝试创建'
  };

  const result = createCommitment(
    request,
    leaderUser.user.id,
    leaderUser.user.name,
    leaderUser.user.role
  );

  assert(result.success === false, '创建应该失败');
  assert(result.error?.code === COMPENSATION_ERROR_CODES.NO_PERMISSION, '应该返回权限拒绝错误');
})) { passed++; } else { failed++; }

if (runTest('3. 权限测试 - 商家尝试创建赔付承诺（应该拒绝）', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const request: CreateCompensationCommitmentRequest = {
    caseId: caseIds[0],
    type: 'cash',
    amount: 50.00,
    dueDate: '2026-06-15',
    remark: '商家尝试创建'
  };

  const result = createCommitment(
    request,
    merchantUser.user.id,
    merchantUser.user.name,
    merchantUser.user.role
  );

  assert(result.success === false, '创建应该失败');
  assert(result.error?.code === COMPENSATION_ERROR_CODES.NO_PERMISSION, '应该返回权限拒绝错误');
})) { passed++; } else { failed++; }

if (runTest('4. 权限测试 - 团长查看承诺摘要（只能看到自己的）', () => {
  resetDatabase();
  const caseIds = createTestCases();

  for (let i = 0; i < 3; i++) {
    const request: CreateCompensationCommitmentRequest = {
      caseId: caseIds[i],
      type: 'cash',
      amount: 50.00 * (i + 1),
      dueDate: '2026-06-15',
      remark: `测试${i + 1}`
    };
    createCommitment(request, csUser.user.id, csUser.user.name, csUser.user.role);
  }

  const result = getCommitmentList(
    {},
    leaderUser.user.role,
    leaderUser.user.id
  );

  assert(result.success === true, '查询应该成功');
  assert(Array.isArray(result.data), '应该返回数组');
  assert(result.data!.length === 2, '李团长应该只能看到2条（案件1和2）');
  
  const case3Found = result.data!.some((c: any) => c.caseId === caseIds[2]);
  assert(case3Found === false, '李团长不应该看到赵团长的案件3');
})) { passed++; } else { failed++; }

if (runTest('5. 权限测试 - 商家查看承诺摘要（只能看到自己的）', () => {
  resetDatabase();
  const caseIds = createTestCases();

  for (let i = 0; i < 3; i++) {
    const request: CreateCompensationCommitmentRequest = {
      caseId: caseIds[i],
      type: 'cash',
      amount: 50.00 * (i + 1),
      dueDate: '2026-06-15',
      remark: `测试${i + 1}`
    };
    createCommitment(request, csUser.user.id, csUser.user.name, csUser.user.role);
  }

  const result = getCommitmentList(
    {},
    merchantUser.user.role,
    merchantUser.user.id
  );

  assert(result.success === true, '查询应该成功');
  assert(Array.isArray(result.data), '应该返回数组');
  assert(result.data!.length === 2, '张商家应该只能看到2条（案件1和3）');
  
  const case2Found = result.data!.some((c: any) => c.caseId === caseIds[1]);
  assert(case2Found === false, '张商家不应该看到王商家的案件2');
})) { passed++; } else { failed++; }

if (runTest('6. 并发冲突测试 - 版本号校验（不能静默覆盖）', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const createResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'cash',
      amount: 50.00,
      dueDate: '2026-06-15',
      remark: '原始备注'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const commitmentId = createResult.data!.id;
  const originalVersion = createResult.data!.version;
  assert(originalVersion === 1, '初始版本为1');

  const updateRequest: UpdateCompensationCommitmentRequest = {
    caseId: caseIds[0],
    type: 'cash',
    amount: 60.00,
    dueDate: '2026-06-15',
    remark: '修改备注1',
    version: originalVersion
  };

  const update1Result = updateCommitment(
    commitmentId,
    updateRequest,
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(update1Result.success === true, '第一次更新应该成功');
  assert(update1Result.data!.version === 2, '版本应该递增到2');

  const conflictRequest: UpdateCompensationCommitmentRequest = {
    caseId: caseIds[0],
    type: 'cash',
    amount: 70.00,
    dueDate: '2026-06-15',
    remark: '修改备注2',
    version: originalVersion
  };

  const update2Result = updateCommitment(
    commitmentId,
    conflictRequest,
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(update2Result.success === false, '使用旧版本号更新应该失败');
  assert(update2Result.error?.code === COMPENSATION_ERROR_CODES.VERSION_CONFLICT, '应该返回版本冲突错误');

  const finalResult = getCommitmentDetail(commitmentId, csUser.user.role, csUser.user.id);
  assert(finalResult.data!.amount === 60.00, '金额应该是第一次更新的60，不应该被静默覆盖');
  assert(finalResult.data!.remark === '修改备注1', '备注应该是第一次更新的内容');
  assert(finalResult.data!.version === 2, '版本应该保持为2');
})) { passed++; } else { failed++; }

if (runTest('7. 并发冲突测试 - 标记履约版本冲突', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const createResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'cash',
      amount: 50.00,
      dueDate: '2026-06-15'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const commitmentId = createResult.data!.id;
  const originalVersion = createResult.data!.version;

  db.prepare('UPDATE compensation_commitments SET version = 2 WHERE id = ?').run(commitmentId);

  const fulfillRequest: FulfillCompensationCommitmentRequest = {
    version: originalVersion,
    remark: '尝试履约'
  };

  const result = fulfillCommitment(
    commitmentId,
    fulfillRequest,
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === false, '标记履约应该失败');
  assert(result.error?.code === COMPENSATION_ERROR_CODES.VERSION_CONFLICT, '应该返回版本冲突错误');
})) { passed++; } else { failed++; }

if (runTest('8. 状态流转测试 - 标记履约', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const createResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'cash',
      amount: 50.00,
      dueDate: '2026-06-15'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const commitmentId = createResult.data!.id;

  const fulfillRequest: FulfillCompensationCommitmentRequest = {
    version: createResult.data!.version,
    remark: '已完成赔付'
  };

  const result = fulfillCommitment(
    commitmentId,
    fulfillRequest,
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === true, '标记履约应该成功');
  assert(result.data!.status === 'fulfilled', '状态应该变为已履约');
  assert(result.data!.fulfilledAt !== null, '应该有履约时间');
  assert(result.data!.fulfilledBy === csUser.user.id, '履约人正确');
  assert(result.data!.version === 2, '版本应该递增');
})) { passed++; } else { failed++; }

if (runTest('9. 状态流转测试 - 取消承诺', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const createResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'cash',
      amount: 50.00,
      dueDate: '2026-06-15'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const commitmentId = createResult.data!.id;

  const cancelRequest: CancelCompensationCommitmentRequest = {
    version: createResult.data!.version,
    cancelReason: '用户放弃赔付'
  };

  const result = cancelCommitment(
    commitmentId,
    cancelRequest,
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === true, '取消承诺应该成功');
  assert(result.data!.status === 'cancelled', '状态应该变为已取消');
  assert(result.data!.cancelledAt !== null, '应该有取消时间');
  assert(result.data!.cancelledBy === csUser.user.id, '取消人正确');
  assert(result.data!.cancelReason === '用户放弃赔付', '取消原因正确');
  assert(result.data!.version === 2, '版本应该递增');
})) { passed++; } else { failed++; }

if (runTest('10. 状态流转测试 - 已履约的承诺不能取消', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const createResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'cash',
      amount: 50.00,
      dueDate: '2026-06-15'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const commitmentId = createResult.data!.id;

  fulfillCommitment(
    commitmentId,
    { version: createResult.data!.version },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const afterFulfill = getCommitmentDetail(commitmentId, csUser.user.role, csUser.user.id);

  const cancelRequest: CancelCompensationCommitmentRequest = {
    version: afterFulfill.data!.version,
    cancelReason: '尝试取消已履约的'
  };

  const result = cancelCommitment(
    commitmentId,
    cancelRequest,
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === false, '取消应该失败');
  assert(result.error?.code === COMPENSATION_ERROR_CODES.INVALID_STATUS_TRANSITION, '应该返回状态流转错误');
})) { passed++; } else { failed++; }

if (runTest('11. 重启持久化测试 - 数据写入SQLite后重启仍存在', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const createResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'coupon',
      amount: 0,
      couponName: '满100减20优惠券',
      couponValue: 20.00,
      dueDate: '2026-06-15',
      remark: '优惠券赔付',
      attachment: 'https://example.com/coupon.jpg'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const commitmentId = createResult.data!.id;

  const row = db.prepare('SELECT * FROM compensation_commitments WHERE id = ?').get(commitmentId) as any;
  assert(row !== undefined, '数据库中应该存在记录');
  assert(row.commitmentNo === createResult.data!.commitmentNo, '承诺编号一致');
  assert(row.type === 'coupon', '类型一致');
  assert(row.status === 'pendingFulfillment', '状态一致');
  assert(row.couponName === '满100减20优惠券', '优惠券名称一致');
  assert(row.couponValue === 20.00, '优惠券面值一致');
  assert(row.remark === '优惠券赔付', '备注一致');
  assert(row.attachment === 'https://example.com/coupon.jpg', '附件一致');
  assert(row.createdBy === csUser.user.id, '创建人一致');
  assert(row.version === 1, '版本一致');

  const resultAfter = getCommitmentDetail(commitmentId, csUser.user.role, csUser.user.id);
  assert(resultAfter.success === true, '应该能查询到数据');
  assert(resultAfter.data!.id === commitmentId, 'ID一致');
  assert(resultAfter.data!.status === 'pendingFulfillment', '状态持久化正确');
})) { passed++; } else { failed++; }

if (runTest('12. 重启持久化测试 - 取消原因持久化', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const createResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'cash',
      amount: 100.00,
      dueDate: '2026-06-15'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const commitmentId = createResult.data!.id;

  cancelCommitment(
    commitmentId,
    { version: createResult.data!.version, cancelReason: '双方协商一致取消' },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const row = db.prepare('SELECT * FROM compensation_commitments WHERE id = ?').get(commitmentId) as any;
  assert(row.status === 'cancelled', '状态持久化正确');
  assert(row.cancelReason === '双方协商一致取消', '取消原因持久化正确');
  assert(row.cancelledBy === csUser.user.id, '取消人持久化正确');
  assert(row.cancelledAt !== null, '取消时间持久化正确');
})) { passed++; } else { failed++; }

if (runTest('13. 操作日志测试 - 创建承诺记录日志', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const createResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'cash',
      amount: 50.00,
      dueDate: '2026-06-15',
      remark: '日志测试'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const commitmentId = createResult.data!.id;
  const logsResult = getCommitmentLogs(commitmentId, csUser.user.role, csUser.user.id);

  assert(logsResult.success === true, '应该能查询到操作日志');
  assert(Array.isArray(logsResult.data), '日志应该是数组');
  assert(logsResult.data!.length >= 1, '至少有一条日志');

  const createLog = logsResult.data!.find(l => l.operationType === 'create');
  assert(createLog !== undefined, '应该有创建操作日志');
  assert(createLog.operatorId === csUser.user.id, '操作人正确');
  assert(createLog.operatorName === csUser.user.name, '操作人名称正确');
  assert(createLog.operatorRole === csUser.user.role, '操作人角色正确');
  assert(createLog.afterChange !== null, '应该有变更后快照');
})) { passed++; } else { failed++; }

if (runTest('14. 操作日志测试 - 编辑承诺记录前后快照', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const createResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'cash',
      amount: 50.00,
      dueDate: '2026-06-15',
      remark: '原始'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const commitmentId = createResult.data!.id;

  updateCommitment(
    commitmentId,
    {
      caseId: caseIds[0],
      type: 'cash',
      amount: 60.00,
      dueDate: '2026-06-15',
      remark: '修改后',
      version: createResult.data!.version
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const logsResult = getCommitmentLogs(commitmentId, csUser.user.role, csUser.user.id);
  const updateLog = logsResult.data!.find(l => l.operationType === 'update');

  assert(updateLog !== undefined, '应该有更新操作日志');
  assert(updateLog.beforeChange !== null, '应该有变更前快照');
  assert(updateLog.afterChange !== null, '应该有变更后快照');
  
  const before = JSON.parse(updateLog.beforeChange || '{}');
  const after = JSON.parse(updateLog.afterChange || '{}');
  
  assert(before.amount === 50.00, '变更前金额正确');
  assert(before.remark === '原始', '变更前备注正确');
  assert(after.amount === 60.00, '变更后金额正确');
  assert(after.remark === '修改后', '变更后备注正确');
})) { passed++; } else { failed++; }

if (runTest('15. 操作日志测试 - 履约和取消操作记录日志', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const createResult1 = createCommitment(
    { caseId: caseIds[0], type: 'cash', amount: 50.00, dueDate: '2026-06-15' },
    csUser.user.id, csUser.user.name, csUser.user.role
  );
  const createResult2 = createCommitment(
    { caseId: caseIds[1], type: 'cash', amount: 100.00, dueDate: '2026-06-15' },
    csUser.user.id, csUser.user.name, csUser.user.role
  );

  fulfillCommitment(
    createResult1.data!.id,
    { version: createResult1.data!.version, remark: '履约完成' },
    csUser.user.id, csUser.user.name, csUser.user.role
  );

  cancelCommitment(
    createResult2.data!.id,
    { version: createResult2.data!.version, cancelReason: '取消测试' },
    csUser.user.id, csUser.user.name, csUser.user.role
  );

  const logs1 = getCommitmentLogs(createResult1.data!.id, csUser.user.role, csUser.user.id);
  const logs2 = getCommitmentLogs(createResult2.data!.id, csUser.user.role, csUser.user.id);

  const fulfillLog = logs1.data!.find(l => l.operationType === 'fulfill');
  const cancelLog = logs2.data!.find(l => l.operationType === 'cancel');

  assert(fulfillLog !== undefined, '应该有履约操作日志');
  assert(fulfillLog.remark === '履约完成', '履约备注正确');
  
  assert(cancelLog !== undefined, '应该有取消操作日志');
  assert(cancelLog.remark === '取消测试', '取消备注正确');
})) { passed++; } else { failed++; }

if (runTest('16. 导入导出一致性测试 - 导出CSV后再导入', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const commitments = [
    { type: 'cash' as CompensationCommitmentType, amount: 50.00, remark: '现金赔付' },
    { type: 'coupon' as CompensationCommitmentType, amount: 0, couponName: '满减券', couponValue: 20.00, remark: '优惠券' },
    { type: 'reship' as CompensationCommitmentType, amount: 0, productName: '测试商品', productQuantity: 2, remark: '补寄' }
  ];

  for (let i = 0; i < commitments.length; i++) {
    createCommitment(
      { caseId: caseIds[i], dueDate: '2026-06-15', ...commitments[i] } as CreateCompensationCommitmentRequest,
      csUser.user.id, csUser.user.name, csUser.user.role
    );
  }

  const listResult = getCommitmentList({}, csUser.user.role, csUser.user.id);
  const originalCount = listResult.data!.length;

  const csvData = generateCommitmentCSV({}, csUser.user.role, csUser.user.id);
  assert(csvData.startsWith('\uFEFF'), '应该有UTF-8 BOM');
  assert(csvData.includes('承诺单号'), 'CSV应该包含表头');

  db.exec('DELETE FROM compensation_commitment_operation_logs');
  db.exec('DELETE FROM compensation_commitments');

  const parseResult = importCommitmentsCSV(csvData, csUser.user.id, csUser.user.name, csUser.user.role);
  assert(parseResult.success === true, '导入解析应该成功');
  assert(parseResult.data!.successCount === 3, '应该成功导入3条');
  assert(parseResult.data!.failedCount === 0, '应该没有失败');

  const afterImportResult = getCommitmentList({}, csUser.user.role, csUser.user.id);
  assert(afterImportResult.data!.length === originalCount, '导入后数量应该一致');

  const imported = afterImportResult.data!;
  assert(imported.some(c => c.type === 'cash' && c.amount === 50.00), '现金赔付导入正确');
  assert(imported.some(c => c.type === 'coupon' && c.couponName === '满减券'), '优惠券导入正确');
  assert(imported.some(c => c.type === 'reship' && c.productName === '测试商品'), '补寄商品导入正确');
})) { passed++; } else { failed++; }

if (runTest('17. 导入导出一致性测试 - 部分失败的导入', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const csvContent = '\uFEFF承诺单号,案件ID,承诺类型,赔付金额(元),履约截止日期,备注,优惠券名称,优惠券面值,补寄商品,补寄数量,线下承诺描述\n' +
    `COMP-TEST-001,${caseIds[0]},现金补偿,50.00,2026-06-15,有效行,,,,'\n` +
    `COMP-TEST-002,99999,现金补偿,50.00,2026-06-15,无效案件ID,,,,'\n` +
    `COMP-TEST-003,${caseIds[1]},优惠券,0,2026-06-15,缺少优惠券面值,,,,'\n`;

  const parseResult = importCommitmentsCSV(csvContent, csUser.user.id, csUser.user.name, csUser.user.role);

  assert(parseResult.success === true, '导入应该返回成功（即使有部分失败）');
  assert(parseResult.data!.successCount === 1, '应该成功导入1条');
  assert(parseResult.data!.failedCount === 2, '应该失败2条');
  assert(parseResult.data!.errors.length === 2, '应该有2条错误信息');
})) { passed++; } else { failed++; }

if (runTest('18. 不同承诺类型验证', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const couponResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'coupon',
      couponName: '',
      couponValue: 0,
      dueDate: '2026-06-15'
    } as CreateCompensationCommitmentRequest,
    csUser.user.id, csUser.user.name, csUser.user.role
  );
  assert(couponResult.success === false, '缺少优惠券信息应该失败');
  assert(couponResult.error?.code === COMPENSATION_ERROR_CODES.INVALID_PARAMS, '应该返回类型数据错误');

  const reshipResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'reship',
      productName: '',
      productQuantity: 0,
      dueDate: '2026-06-15'
    } as CreateCompensationCommitmentRequest,
    csUser.user.id, csUser.user.name, csUser.user.role
  );
  assert(reshipResult.success === false, '缺少商品信息应该失败');

  const offlineResult = createCommitment(
    {
      caseId: caseIds[0],
      type: 'offline',
      offlineDetails: '',
      dueDate: '2026-06-15'
    } as CreateCompensationCommitmentRequest,
    csUser.user.id, csUser.user.name, csUser.user.role
  );
  assert(offlineResult.success === false, '缺少线下详情应该失败');
})) { passed++; } else { failed++; }

if (runTest('19. 金额验证 - 负数金额应该拒绝', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const result = createCommitment(
    {
      caseId: caseIds[0],
      type: 'cash',
      amount: -10.00,
      dueDate: '2026-06-15'
    },
    csUser.user.id, csUser.user.name, csUser.user.role
  );

  assert(result.success === false, '负数金额应该失败');
  assert(result.error?.code === COMPENSATION_ERROR_CODES.INVALID_PARAMS, '应该返回金额错误');
})) { passed++; } else { failed++; }

if (runTest('20. 越权访问测试 - 团长查看其他团长的承诺详情', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const createResult = createCommitment(
    {
      caseId: caseIds[2],
      type: 'cash',
      amount: 50.00,
      dueDate: '2026-06-15'
    },
    csUser.user.id, csUser.user.name, csUser.user.role
  );

  const commitmentId = createResult.data!.id;

  const result = getCommitmentDetail(commitmentId, leaderUser.user.role, leaderUser.user.id);

  assert(result.success === false, '李团长查看赵团长的案件应该失败');
  assert(result.error?.code === COMPENSATION_ERROR_CODES.NOT_OWNED, '应该返回权限拒绝');
})) { passed++; } else { failed++; }

console.log('\n========================================');
console.log(`  测试完成: ${passed} 通过, ${failed} 失败`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
