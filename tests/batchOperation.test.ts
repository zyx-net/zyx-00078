import bcrypt from 'bcryptjs';
import { db, initDatabase } from '../api/db/index.js';
import {
  BatchExecuteResponse,
  BatchPreviewResponse,
  ERROR_CODES,
  BatchRevokeExecuteResponse
} from '../shared/types.js';
import {
  previewBatch,
  executeBatch,
  getBatchDetail,
  previewRevokeBatch,
  executeRevokeBatch,
  exportBatchCSV,
  exportRevokeBatchCSV
} from '../api/services/batchService.js';
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

function createTestCases() {
  const insertCase = db.prepare(`
    INSERT INTO cases (
      orderNo, caseType, productName, quantity, refundAmount,
      responsibleParty, merchantId, merchantName, description,
      status, version, createdBy, createdByName
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertVersion = db.prepare(`
    INSERT INTO case_versions (
      caseId, version, fromStatus, toStatus, action,
      operatorId, operatorName, operatorRole, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const cases = [
    {
      orderNo: 'DD20260601001',
      status: 'csArbitration',
      version: 3,
      refundAmount: 58.00
    },
    {
      orderNo: 'DD20260601002',
      status: 'csArbitration',
      version: 3,
      refundAmount: 128.50
    },
    {
      orderNo: 'DD20260601003',
      status: 'csArbitration',
      version: 3,
      refundAmount: 89.90
    },
    {
      orderNo: 'DD20260601004',
      status: 'merchantProcessing',
      version: 2,
      refundAmount: 45.00
    },
    {
      orderNo: 'DD20260601005',
      status: 'refundCompleted',
      version: 4,
      refundAmount: 200.00
    }
  ];

  const caseIds: number[] = [];
  cases.forEach((c, index) => {
    const result = insertCase.run(
      c.orderNo,
      'damaged',
      `测试商品${index + 1}`,
      index + 1,
      c.refundAmount,
      'merchant',
      2,
      '张商家',
      '测试售后申请',
      c.status,
      c.version,
      1,
      '李团长'
    );
    const caseId = result.lastInsertRowid as number;
    caseIds.push(caseId);

    for (let v = 1; v <= c.version; v++) {
      insertVersion.run(
        caseId,
        v,
        v === 1 ? null : v === 2 ? 'pendingEvidence' : 'merchantProcessing',
        v === 1 ? 'pendingEvidence' : v === 2 ? 'merchantProcessing' : c.status,
        v === 1 ? 'create' : v === 2 ? 'submitEvidence' : 'merchantRespond',
        v === 1 ? 1 : v === 2 ? 1 : 2,
        v === 1 ? '李团长' : v === 2 ? '李团长' : '张商家',
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

console.log('\n========================================');
console.log('  批量退款确认功能 - 自动化测试');
console.log('========================================');

const csUser = login('cs1', '123456');
const merchantUser = login('merchant1', '123456');
const leaderUser = login('leader1', '123456');

let passed = 0;
let failed = 0;

if (runTest('1. 成功批量退款（全部可处理）', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 3);

  const previewResult = previewBatch({
    caseIds: csArbitrationIds,
    action: 'csRefund'
  });

  assert(previewResult.success === true, '预览应该成功');
  assert(previewResult.data!.totalCount === 3, '应该有3个案件');
  assert(previewResult.data!.processableCount === 3, '应该全部可处理');
  assert(previewResult.data!.unprocessableCount === 0, '应该没有不可处理的');
  assert(Math.abs(previewResult.data!.totalRefundAmount - 276.40) < 0.01, '总金额应该正确');

  const versions: Record<number, number> = {};
  previewResult.data!.items.forEach(item => {
    versions[item.caseId] = item.currentVersion;
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '批量退款测试',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(executeResult.success === true, '执行应该成功');
  assert(executeResult.data!.totalCount === 3, '应该处理3个案件');
  assert(executeResult.data!.successCount === 3, '应该全部成功');
  assert(executeResult.data!.failedCount === 0, '应该没有失败');
  assert(executeResult.data!.skippedCount === 0, '应该没有跳过');
  assert(Math.abs(executeResult.data!.successRefundAmount - 276.40) < 0.01, '成功金额应该正确');
  assert(executeResult.data!.batchNo.startsWith('BATCH'), '批次号应该正确生成');

  executeResult.data!.items.forEach(item => {
    assert(item.status === 'success', `案件 ${item.orderNo} 应该成功`);
    assert(item.currentVersion === 4, `案件 ${item.orderNo} 版本应该递增`);
  });

  const batchDetail = getBatchDetail(executeResult.data!.batchNo);
  assert(batchDetail.success === true, '应该能查询到批次详情');
  assert(batchDetail.data!.items.length === 3, '批次应该有3个明细');
  assert(batchDetail.data!.remark === '批量退款测试', '备注应该正确');
})) { passed++; } else { failed++; }

if (runTest('2. 混入旧版本冲突（部分失败）', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 3);

  const previewResult = previewBatch({
    caseIds: csArbitrationIds,
    action: 'csRefund'
  });

  const versions: Record<number, number> = {};
  previewResult.data!.items.forEach((item, index) => {
    if (index === 1) {
      versions[item.caseId] = item.currentVersion - 1;
    } else {
      versions[item.caseId] = item.currentVersion;
    }
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '版本冲突测试',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(executeResult.success === true, '执行应该成功（部分失败）');
  assert(executeResult.data!.totalCount === 3, '应该处理3个案件');
  assert(executeResult.data!.successCount === 2, '应该成功2个');
  assert(executeResult.data!.failedCount === 1, '应该失败1个');
  assert(executeResult.data!.skippedCount === 0, '应该没有跳过');

  const failedItem = executeResult.data!.items.find(i => i.status === 'failed');
  assert(failedItem !== undefined, '应该有失败的案件');
  assert(failedItem!.errorCode === ERROR_CODES.VERSION_CONFLICT, '错误码应该是版本冲突');
  assert(failedItem!.errorMessage!.includes('版本不匹配'), '错误信息应该包含版本不匹配');

  const successItems = executeResult.data!.items.filter(i => i.status === 'success');
  assert(successItems.length === 2, '应该有2个成功的案件');
  successItems.forEach(item => {
    assert(item.currentVersion === 4, '成功案件版本应该递增');
  });

  const batchDetail = getBatchDetail(executeResult.data!.batchNo);
  assert(batchDetail.data!.successCount === 2, '批次成功数应该正确');
  assert(batchDetail.data!.failedCount === 1, '批次失败数应该正确');
})) { passed++; } else { failed++; }

if (runTest('3. 混入非客服仲裁状态（部分跳过）', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const mixedIds = [caseIds[0], caseIds[3], caseIds[4]];

  const previewResult = previewBatch({
    caseIds: mixedIds,
    action: 'csRefund'
  });

  assert(previewResult.success === true, '预览应该成功');
  assert(previewResult.data!.totalCount === 3, '应该有3个案件');
  assert(previewResult.data!.processableCount === 1, '应该只有1个可处理');
  assert(previewResult.data!.unprocessableCount === 2, '应该有2个不可处理');

  const unprocessableItems = previewResult.data!.items.filter(i => !i.canProcess);
  assert(unprocessableItems.length === 2, '应该有2个不可处理');
  unprocessableItems.forEach(item => {
    assert(item.reason!.includes('仅「客服仲裁」状态可批量处理'), '原因应该说明状态问题');
  });

  const versions: Record<number, number> = {};
  previewResult.data!.items.forEach(item => {
    versions[item.caseId] = item.currentVersion;
  });

  const executeResult = executeBatch(
    {
      caseIds: mixedIds,
      action: 'csRefund',
      remark: '状态混合测试',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(executeResult.success === true, '执行应该成功');
  assert(executeResult.data!.totalCount === 3, '应该处理3个案件');
  assert(executeResult.data!.successCount === 1, '应该成功1个');
  assert(executeResult.data!.skippedCount === 2, '应该跳过2个');

  const skippedItems = executeResult.data!.items.filter(i => i.status === 'skipped');
  assert(skippedItems.length === 2, '应该有2个跳过的案件');
  skippedItems.forEach(item => {
    assert(item.errorCode === ERROR_CODES.INVALID_STATUS_TRANSITION, '错误码应该是状态流转错误');
  });

  const successItem = executeResult.data!.items.find(i => i.status === 'success');
  assert(successItem !== undefined, '应该有1个成功的案件');
  assert(successItem!.orderNo === 'DD20260601001', '应该是客服仲裁状态的案件');
})) { passed++; } else { failed++; }

if (runTest('4. 越权调用（商家/团长调用批量接口）', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 2);

  const versions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    versions[id] = 3;
  });

  const merchantResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '商家越权测试',
      versions
    },
    merchantUser.user.id,
    merchantUser.user.name,
    merchantUser.user.role
  );

  assert(merchantResult.success === false, '商家调用应该被拒绝');
  assert(merchantResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码应该是权限拒绝');
  assert(merchantResult.error!.message.includes('仅客服可执行此操作'), '错误信息应该说明仅客服可执行');

  const leaderResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csReject',
      remark: '团长越权测试',
      versions
    },
    leaderUser.user.id,
    leaderUser.user.name,
    leaderUser.user.role
  );

  assert(leaderResult.success === false, '团长调用应该被拒绝');
  assert(leaderResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码应该是权限拒绝');
  assert(leaderResult.error!.message.includes('仅客服可执行此操作'), '错误信息应该说明仅客服可执行');
})) { passed++; } else { failed++; }

if (runTest('5. 批量驳回功能', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 2);

  const previewResult = previewBatch({
    caseIds: csArbitrationIds,
    action: 'csReject'
  });

  assert(previewResult.success === true, '预览应该成功');
  assert(previewResult.data!.processableCount === 2, '应该全部可处理');

  const versions: Record<number, number> = {};
  previewResult.data!.items.forEach(item => {
    versions[item.caseId] = item.currentVersion;
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csReject',
      remark: '批量驳回测试',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(executeResult.success === true, '执行应该成功');
  assert(executeResult.data!.successCount === 2, '应该全部成功驳回');

  executeResult.data!.items.forEach(item => {
    assert(item.status === 'success', `案件 ${item.orderNo} 应该驳回成功`);
  });

  const batchDetail = getBatchDetail(executeResult.data!.batchNo);
  assert(batchDetail.data!.action === 'csReject', '操作类型应该是批量驳回');
  assert(batchDetail.data!.items[0].newStatus === 'rejected', '新状态应该是驳回');
})) { passed++; } else { failed++; }

if (runTest('6. 数据持久化验证（重启后数据一致）', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 2);

  const versions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    versions[id] = 3;
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '持久化测试',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const batchNo = executeResult.data!.batchNo;
  const batchId = getBatchDetail(batchNo).data!.id;

  const batchBefore = db.prepare('SELECT * FROM batch_operations WHERE id = ?').get(batchId) as any;
  const itemsBefore = db.prepare('SELECT * FROM batch_items WHERE batchId = ? ORDER BY id').all(batchId) as any[];
  const casesBefore = db.prepare('SELECT id, status, version FROM cases WHERE id IN (?, ?) ORDER BY id').all(csArbitrationIds[0], csArbitrationIds[1]) as any[];

  assert(batchBefore.batchNo === batchNo, '批次号应该正确');
  assert(batchBefore.successCount === 2, '成功数量应该正确');
  assert(batchBefore.totalRefundAmount === 186.5, '总金额应该正确');
  assert(itemsBefore.length === 2, '明细数量应该正确');

  for (let i = 0; i < itemsBefore.length; i++) {
    assert(itemsBefore[i].caseId === csArbitrationIds[i], `案件ID应该正确 ${i}`);
    assert(itemsBefore[i].status === 'success', `状态应该是成功 ${i}`);
    assert(itemsBefore[i].newStatus === 'refundCompleted', `新状态应该是退款完成 ${i}`);
    assert(itemsBefore[i].newVersion === 4, `新版本应该是4 ${i}`);
  }

  for (let i = 0; i < casesBefore.length; i++) {
    assert(casesBefore[i].status === 'refundCompleted', `案件状态应该是退款完成 ${i}`);
    assert(casesBefore[i].version === 4, `案件版本应该是4 ${i}`);
  }

  const batchDetail = getBatchDetail(batchNo);
  assert(batchDetail.success === true, '应该能查询到批次详情');
  assert(batchDetail.data!.items.length === 2, '批次详情应该包含2个明细');
  assert(batchDetail.data!.operatorName === csUser.user.name, '操作人应该正确');
  assert(batchDetail.data!.remark === '持久化测试', '备注应该正确');

  const caseDetail1 = db.prepare('SELECT * FROM case_versions WHERE caseId = ? ORDER BY version DESC').get(csArbitrationIds[0]) as any;
  assert(caseDetail1.version === 4, '版本历史应该包含新版本');
  assert(caseDetail1.action === 'csRefund', '操作类型应该正确');
  assert(caseDetail1.toStatus === 'refundCompleted', '目标状态应该正确');
})) { passed++; } else { failed++; }

if (runTest('7. 空批量处理验证', () => {
  const previewResult = previewBatch({
    caseIds: [],
    action: 'csRefund'
  });

  assert(previewResult.success === false, '空批量应该失败');
  assert(previewResult.error!.code === ERROR_CODES.BATCH_EMPTY, '错误码应该正确');
  assert(previewResult.error!.message === '请选择要处理的案件', '错误信息应该正确');
})) { passed++; } else { failed++; }

if (runTest('8. 无效操作类型验证', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const previewResult = previewBatch({
    caseIds: [caseIds[0]],
    action: 'invalidAction' as any
  });

  assert(previewResult.success === false, '无效操作类型应该失败');
  assert(previewResult.error!.code === ERROR_CODES.INVALID_PARAMS, '错误码应该正确');
})) { passed++; } else { failed++; }

if (runTest('9. 缺少版本号信息验证', () => {
  resetDatabase();
  const caseIds = createTestCases();

  const executeResult = executeBatch(
    {
      caseIds: [caseIds[0]],
      action: 'csRefund',
      remark: '测试',
      versions: undefined as any
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(executeResult.success === false, '缺少版本号应该失败');
  assert(executeResult.error!.code === ERROR_CODES.INVALID_PARAMS, '错误码应该正确');
  assert(executeResult.error!.message === '缺少版本号信息', '错误信息应该正确');
})) { passed++; } else { failed++; }

if (runTest('10. 并发修改版本冲突验证（双重校验）', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const targetCaseId = caseIds[0];

  const caseInfoBefore = db.prepare('SELECT * FROM cases WHERE id = ?').get(targetCaseId) as any;
  assert(caseInfoBefore.version === 3, '初始版本应该是3');

  const versions: Record<number, number> = {};
  versions[targetCaseId] = caseInfoBefore.version;

  db.prepare('UPDATE cases SET version = ? WHERE id = ?').run(caseInfoBefore.version + 1, targetCaseId);

  const executeResult = executeBatch(
    {
      caseIds: [targetCaseId],
      action: 'csRefund',
      remark: '并发修改测试',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(executeResult.success === true, '执行应该返回结果');
  assert(executeResult.data!.failedCount === 1, '应该失败1个');
  assert(executeResult.data!.items[0].errorCode === ERROR_CODES.VERSION_CONFLICT, '错误码应该是版本冲突');

  const caseInfoAfter = db.prepare('SELECT * FROM cases WHERE id = ?').get(targetCaseId) as any;
  assert(caseInfoAfter.version === 4, '版本应该保持为4');
  assert(caseInfoAfter.status === 'csArbitration', '状态不应该改变');
})) { passed++; } else { failed++; }

if (runTest('11. 成功撤销批次（全部可撤销）', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 3);

  const versions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    versions[id] = 3;
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '撤销测试批次',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(executeResult.success === true, '批量操作应该成功');
  assert(executeResult.data!.successCount === 3, '应该成功3个');

  const batchNo = executeResult.data!.batchNo;
  const batchDetail = getBatchDetail(batchNo);
  const batchId = batchDetail.data!.id;

  const previewResult = previewRevokeBatch(
    { batchId },
    csUser.user.id,
    csUser.user.role
  );

  assert(previewResult.success === true, '撤销预览应该成功');
  assert(previewResult.data!.totalCount === 3, '应该有3个案件');
  assert(previewResult.data!.revocableCount === 3, '应该全部可撤销');
  assert(previewResult.data!.canRevokeBatch === true, '应该可以撤销批次');

  const revokeVersions: Record<number, number> = {};
  previewResult.data!.items.forEach(item => {
    revokeVersions[item.caseId] = item.currentVersion;
  });

  const revokeResult = executeRevokeBatch(
    {
      batchId,
      remark: '撤销测试',
      versions: revokeVersions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(revokeResult.success === true, '撤销执行应该成功');
  assert(revokeResult.data!.totalCount === 3, '应该处理3个案件');
  assert(revokeResult.data!.successCount === 3, '应该全部撤销成功');
  assert(revokeResult.data!.failedCount === 0, '应该没有失败');
  assert(revokeResult.data!.skippedCount === 0, '应该没有跳过');

  revokeResult.data!.items.forEach(item => {
    assert(item.status === 'success', `案件 ${item.orderNo} 应该撤销成功`);
    assert(item.currentVersion === 5, `案件 ${item.orderNo} 版本应该递增到5`);
  });

  const batchAfter = getBatchDetail(batchNo);
  assert(batchAfter.data!.isRevoked === true, '批次应该标记为已撤销');
  assert(batchAfter.data!.revokedBy === csUser.user.id, '撤销人应该正确');
  assert(batchAfter.data!.revokedByName === csUser.user.name, '撤销人姓名应该正确');
  assert(batchAfter.data!.revokeRemark === '撤销测试', '撤销备注应该正确');

  csArbitrationIds.forEach(caseId => {
    const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
    assert(caseInfo.status === 'csArbitration', `案件 ${caseId} 状态应该回滚到客服仲裁`);
    assert(caseInfo.version === 5, `案件 ${caseId} 版本应该是5`);
  });
})) { passed++; } else { failed++; }

if (runTest('12. 撤销预览-混入版本冲突（部分不可撤销）', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 3);

  const versions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    versions[id] = 3;
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '撤销测试批次',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const batchNo = executeResult.data!.batchNo;
  const batchDetail = getBatchDetail(batchNo);
  const batchId = batchDetail.data!.id;

  db.prepare('UPDATE cases SET version = 5, status = ? WHERE id = ?').run('refundCompleted', csArbitrationIds[1]);

  const previewResult = previewRevokeBatch(
    { batchId },
    csUser.user.id,
    csUser.user.role
  );

  assert(previewResult.success === true, '撤销预览应该成功');
  assert(previewResult.data!.totalCount === 3, '应该有3个案件');
  assert(previewResult.data!.revocableCount === 2, '应该有2个可撤销');
  assert(previewResult.data!.unrevocableCount === 1, '应该有1个不可撤销');

  const unrevocableItem = previewResult.data!.items.find(i => !i.canRevoke);
  assert(unrevocableItem !== undefined, '应该有不可撤销的案件');
  assert(unrevocableItem!.revokeReason!.includes('已被后续处理'), '原因应该说明已被处理');
})) { passed++; } else { failed++; }

if (runTest('13. 撤销执行-混入版本冲突（部分失败）', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 3);

  const versions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    versions[id] = 3;
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '撤销测试批次',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const batchNo = executeResult.data!.batchNo;
  const batchDetail = getBatchDetail(batchNo);
  const batchId = batchDetail.data!.id;

  const previewResult = previewRevokeBatch(
    { batchId },
    csUser.user.id,
    csUser.user.role
  );

  const revokeVersions: Record<number, number> = {};
  previewResult.data!.items.forEach((item, index) => {
    if (index === 1) {
      revokeVersions[item.caseId] = item.currentVersion - 1;
    } else {
      revokeVersions[item.caseId] = item.currentVersion;
    }
  });

  const revokeResult = executeRevokeBatch(
    {
      batchId,
      remark: '版本冲突撤销测试',
      versions: revokeVersions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(revokeResult.success === true, '撤销执行应该成功（部分失败）');
  assert(revokeResult.data!.totalCount === 3, '应该处理3个案件');
  assert(revokeResult.data!.successCount === 2, '应该成功2个');
  assert(revokeResult.data!.failedCount === 1, '应该失败1个');
  assert(revokeResult.data!.skippedCount === 0, '应该没有跳过');

  const failedItem = revokeResult.data!.items.find(i => i.status === 'failed');
  assert(failedItem !== undefined, '应该有失败的案件');
  assert(failedItem!.errorCode === ERROR_CODES.VERSION_CONFLICT, '错误码应该是版本冲突');

  const successItems = revokeResult.data!.items.filter(i => i.status === 'success');
  assert(successItems.length === 2, '应该有2个成功的案件');
})) { passed++; } else { failed++; }

if (runTest('14. 越权撤销（商家/团长调用撤销接口）', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 2);

  const versions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    versions[id] = 3;
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '越权测试批次',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const batchNo = executeResult.data!.batchNo;
  const batchDetail = getBatchDetail(batchNo);
  const batchId = batchDetail.data!.id;

  const merchantResult = previewRevokeBatch(
    { batchId },
    merchantUser.user.id,
    merchantUser.user.role
  );

  assert(merchantResult.success === false, '商家预览撤销应该被拒绝');
  assert(merchantResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码应该是权限拒绝');

  const leaderResult = previewRevokeBatch(
    { batchId },
    leaderUser.user.id,
    leaderUser.user.role
  );

  assert(leaderResult.success === false, '团长预览撤销应该被拒绝');
  assert(leaderResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码应该是权限拒绝');

  const revokeVersions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    revokeVersions[id] = 4;
  });

  const merchantExecuteResult = executeRevokeBatch(
    {
      batchId,
      remark: '商家越权撤销',
      versions: revokeVersions
    },
    merchantUser.user.id,
    merchantUser.user.name,
    merchantUser.user.role
  );

  assert(merchantExecuteResult.success === false, '商家执行撤销应该被拒绝');
  assert(merchantExecuteResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码应该是权限拒绝');

  const leaderExecuteResult = executeRevokeBatch(
    {
      batchId,
      remark: '团长越权撤销',
      versions: revokeVersions
    },
    leaderUser.user.id,
    leaderUser.user.name,
    leaderUser.user.role
  );

  assert(leaderExecuteResult.success === false, '团长执行撤销应该被拒绝');
  assert(leaderExecuteResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码应该是权限拒绝');
})) { passed++; } else { failed++; }

if (runTest('15. 撤销他人批次（跨客服）', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 2);

  const versions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    versions[id] = 3;
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '他人批次测试',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const batchNo = executeResult.data!.batchNo;
  const batchDetail = getBatchDetail(batchNo);
  const batchId = batchDetail.data!.id;

  const otherCsUserId = csUser.user.id + 100;

  const previewResult = previewRevokeBatch(
    { batchId },
    otherCsUserId,
    'cs'
  );

  assert(previewResult.success === false, '预览撤销他人批次应该被拒绝');
  assert(previewResult.error!.code === ERROR_CODES.BATCH_NOT_OWNED, '错误码应该是不是自己的批次');

  const revokeVersions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    revokeVersions[id] = 4;
  });

  const executeResult2 = executeRevokeBatch(
    {
      batchId,
      remark: '撤销他人批次',
      versions: revokeVersions
    },
    otherCsUserId,
    '其他客服',
    'cs'
  );

  assert(executeResult2.success === false, '执行撤销他人批次应该被拒绝');
  assert(executeResult2.error!.code === ERROR_CODES.BATCH_NOT_OWNED, '错误码应该是不是自己的批次');
})) { passed++; } else { failed++; }

if (runTest('16. 撤销已撤销的批次', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 2);

  const versions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    versions[id] = 3;
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '重复撤销测试',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const batchNo = executeResult.data!.batchNo;
  const batchDetail = getBatchDetail(batchNo);
  const batchId = batchDetail.data!.id;

  const previewResult1 = previewRevokeBatch(
    { batchId },
    csUser.user.id,
    csUser.user.role
  );

  const revokeVersions: Record<number, number> = {};
  previewResult1.data!.items.forEach(item => {
    revokeVersions[item.caseId] = item.currentVersion;
  });

  const revokeResult1 = executeRevokeBatch(
    {
      batchId,
      remark: '第一次撤销',
      versions: revokeVersions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(revokeResult1.success === true, '第一次撤销应该成功');

  const previewResult2 = previewRevokeBatch(
    { batchId },
    csUser.user.id,
    csUser.user.role
  );

  assert(previewResult2.success === false, '第二次预览撤销应该失败');
  assert(previewResult2.error!.code === ERROR_CODES.BATCH_ALREADY_REVOKED, '错误码应该是已撤销');

  const executeResult2 = executeRevokeBatch(
    {
      batchId,
      remark: '第二次撤销',
      versions: revokeVersions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(executeResult2.success === false, '第二次执行撤销应该失败');
  assert(executeResult2.error!.code === ERROR_CODES.BATCH_ALREADY_REVOKED, '错误码应该是已撤销');
})) { passed++; } else { failed++; }

if (runTest('17. 撤销-案件已被其他批次处理', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const targetCaseId = caseIds[0];

  const versions1: Record<number, number> = {};
  versions1[targetCaseId] = 3;

  const executeResult1 = executeBatch(
    {
      caseIds: [targetCaseId],
      action: 'csReject',
      remark: '第一个批次',
      versions: versions1
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(executeResult1.success === true, '第一个批次应该成功');
  const batch1No = executeResult1.data!.batchNo;
  const batch1Detail = getBatchDetail(batch1No);
  const batch1Id = batch1Detail.data!.id;

  db.prepare('UPDATE cases SET status = ?, version = ? WHERE id = ?').run('csArbitration', 5, targetCaseId);
  db.prepare(`
    INSERT INTO case_versions (caseId, version, fromStatus, toStatus, action, operatorId, operatorName, operatorRole, remark)
    VALUES (?, 5, 'rejected', 'csArbitration', 'csRefund', ?, ?, 'cs', '手动调整')
  `).run(targetCaseId, csUser.user.id, csUser.user.name);

  const versions2: Record<number, number> = {};
  versions2[targetCaseId] = 5;

  const executeResult2 = executeBatch(
    {
      caseIds: [targetCaseId],
      action: 'csRefund',
      remark: '第二个批次',
      versions: versions2
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(executeResult2.success === true, '第二个批次应该成功');

  const previewResult = previewRevokeBatch(
    { batchId: batch1Id },
    csUser.user.id,
    csUser.user.role
  );

  assert(previewResult.success === true, '撤销预览应该成功');
  assert(previewResult.data!.revocableCount === 0, '应该没有可撤销的案件');
  assert(previewResult.data!.canRevokeBatch === false, '应该不能撤销批次');

  const unrevocableItem = previewResult.data!.items[0];
  assert(unrevocableItem.canRevoke === false, '案件应该不可撤销');
  assert(unrevocableItem.revokeReason!.includes('已被其他批次处理'), '原因应该说明已被其他批次处理');
})) { passed++; } else { failed++; }

if (runTest('18. 数据持久化验证-撤销后重启一致性', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 2);

  const versions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    versions[id] = 3;
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '持久化测试批次',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const batchNo = executeResult.data!.batchNo;
  const batchDetail = getBatchDetail(batchNo);
  const batchId = batchDetail.data!.id;

  const previewResult = previewRevokeBatch(
    { batchId },
    csUser.user.id,
    csUser.user.role
  );

  const revokeVersions: Record<number, number> = {};
  previewResult.data!.items.forEach(item => {
    revokeVersions[item.caseId] = item.currentVersion;
  });

  const revokeResult = executeRevokeBatch(
    {
      batchId,
      remark: '撤销持久化测试',
      versions: revokeVersions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(revokeResult.success === true, '撤销应该成功');
  const revokeId = revokeResult.data!.revokeId;

  const batchBefore = db.prepare('SELECT * FROM batch_operations WHERE id = ?').get(batchId) as any;
  const itemsBefore = db.prepare('SELECT * FROM batch_items WHERE batchId = ? ORDER BY id').all(batchId) as any[];
  const casesBefore = db.prepare('SELECT id, status, version FROM cases WHERE id IN (?, ?) ORDER BY id').all(csArbitrationIds[0], csArbitrationIds[1]) as any[];
  const revokeAuditBefore = db.prepare('SELECT * FROM batch_revoke_audits WHERE id = ?').get(revokeId) as any;
  const revokeItemsBefore = db.prepare('SELECT * FROM batch_revoke_items WHERE revokeAuditId = ? ORDER BY id').all(revokeId) as any[];

  assert(batchBefore.isRevoked === 1, '批次应该标记为已撤销');
  assert(batchBefore.revokedBy === csUser.user.id, '撤销人应该正确');
  assert(batchBefore.revokedByName === csUser.user.name, '撤销人姓名应该正确');
  assert(batchBefore.revokeRemark === '撤销持久化测试', '撤销备注应该正确');
  assert(itemsBefore.length === 2, '明细数量应该正确');

  for (let i = 0; i < itemsBefore.length; i++) {
    assert(itemsBefore[i].revokeStatus === 'success', `撤销状态应该是成功 ${i}`);
    assert(itemsBefore[i].revokeNewStatus === 'csArbitration', `撤销后状态应该正确 ${i}`);
    assert(itemsBefore[i].revokeNewVersion === 5, `撤销后版本应该正确 ${i}`);
  }

  for (let i = 0; i < casesBefore.length; i++) {
    assert(casesBefore[i].status === 'csArbitration', `案件状态应该是客服仲裁 ${i}`);
    assert(casesBefore[i].version === 5, `案件版本应该是5 ${i}`);
  }

  assert(revokeAuditBefore.batchId === batchId, '撤销审计批次ID应该正确');
  assert(revokeAuditBefore.successCount === 2, '撤销成功数应该正确');
  assert(revokeItemsBefore.length === 2, '撤销明细数量应该正确');

  const exportResult = exportBatchCSV(batchId);
  assert(exportResult.success === true, '批次导出应该成功');
  assert(exportResult.data!.includes('已撤销'), '导出内容应该包含已撤销信息');
  assert(exportResult.data!.includes('撤销持久化测试'), '导出内容应该包含撤销备注');

  const exportRevokeResult = exportRevokeBatchCSV(revokeId);
  assert(exportRevokeResult.success === true, '撤销记录导出应该成功');
  assert(exportRevokeResult.data!.includes('撤销批次'), '导出内容应该包含撤销批次');

  const batchDetailAfter = getBatchDetail(batchNo);
  assert(batchDetailAfter.success === true, '应该能查询到批次详情');
  assert(batchDetailAfter.data!.isRevoked === true, '批次详情应该显示已撤销');
  assert(batchDetailAfter.data!.items.length === 2, '批次详情应该包含2个明细');

  const caseVersions = db.prepare('SELECT * FROM case_versions WHERE caseId = ? ORDER BY version DESC').all(csArbitrationIds[0]) as any[];
  assert(caseVersions.length >= 5, '版本历史应该包含新版本');
  assert(caseVersions[0].version === 5, '最新版本应该是5');
  assert(caseVersions[0].action === 'csRefund', '操作类型应该正确');
  assert(caseVersions[0].toStatus === 'csArbitration', '目标状态应该正确');
  assert(caseVersions[0].remark.includes('撤销批次'), '备注应该包含撤销批次');
})) { passed++; } else { failed++; }

if (runTest('19. 撤销-没有成功案件的批次', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const mixedIds = [caseIds[0], caseIds[3], caseIds[4]];

  const versions: Record<number, number> = {};
  mixedIds.forEach((id, index) => {
    versions[id] = index === 0 ? 3 : index === 1 ? 2 : 4;
  });

  const executeResult = executeBatch(
    {
      caseIds: mixedIds,
      action: 'csRefund',
      remark: '无成功案件批次',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(executeResult.success === true, '批量执行应该成功');
  assert(executeResult.data!.successCount === 1, '应该成功1个');
  assert(executeResult.data!.skippedCount === 2, '应该跳过2个');

  const batchNo = executeResult.data!.batchNo;
  const batchDetail = getBatchDetail(batchNo);
  const batchId = batchDetail.data!.id;

  db.prepare('UPDATE cases SET status = ?, version = ? WHERE id = ?').run('csArbitration', 5, caseIds[0]);

  const previewResult = previewRevokeBatch(
    { batchId },
    csUser.user.id,
    csUser.user.role
  );

  assert(previewResult.success === true, '撤销预览应该成功');
  assert(previewResult.data!.canRevokeBatch === false, '应该不能撤销批次');
  assert(previewResult.data!.batchNotRevocableReason === '该批次没有可撤销的案件', '原因应该正确');
})) { passed++; } else { failed++; }

if (runTest('20. 撤销CSV导出内容验证', () => {
  resetDatabase();
  const caseIds = createTestCases();
  const csArbitrationIds = caseIds.slice(0, 2);

  const versions: Record<number, number> = {};
  csArbitrationIds.forEach(id => {
    versions[id] = 3;
  });

  const executeResult = executeBatch(
    {
      caseIds: csArbitrationIds,
      action: 'csRefund',
      remark: '导出测试批次',
      versions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const batchNo = executeResult.data!.batchNo;
  const batchDetail = getBatchDetail(batchNo);
  const batchId = batchDetail.data!.id;

  const previewResult = previewRevokeBatch(
    { batchId },
    csUser.user.id,
    csUser.user.role
  );

  const revokeVersions: Record<number, number> = {};
  previewResult.data!.items.forEach(item => {
    revokeVersions[item.caseId] = item.currentVersion;
  });

  const revokeResult = executeRevokeBatch(
    {
      batchId,
      remark: '撤销导出测试',
      versions: revokeVersions
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const revokeId = revokeResult.data!.revokeId;

  const exportResult = exportRevokeBatchCSV(revokeId);
  assert(exportResult.success === true, '撤销记录导出应该成功');

  const csvContent = exportResult.data!;
  assert(csvContent.includes('撤销记录ID'), '导出应该包含撤销记录ID');
  assert(csvContent.includes('批次号'), '导出应该包含批次号');
  assert(csvContent.includes('撤销前状态'), '导出应该包含撤销前状态');
  assert(csvContent.includes('撤销后状态'), '导出应该包含撤销后状态');
  assert(csvContent.includes('撤销目标状态'), '导出应该包含撤销目标状态');
  assert(csvContent.includes(batchNo), '导出应该包含批次号');
  assert(csvContent.includes('撤销导出测试'), '导出应该包含撤销备注');
  assert(csvContent.includes('客服仲裁'), '导出应该包含状态');
  assert(csvContent.includes('撤销成功'), '导出应该包含撤销成功状态');
})) { passed++; } else { failed++; }

console.log('\n========================================');
console.log('  测试结果汇总');
console.log('========================================');
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📊 总计: ${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ 有测试失败，请检查代码');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过！');
  process.exit(0);
}
