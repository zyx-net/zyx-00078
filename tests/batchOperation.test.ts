import { db, initDatabase } from '../api/db/index.js';
import {
  BatchExecuteResponse,
  BatchPreviewResponse,
  ERROR_CODES
} from '../shared/types.js';
import { previewBatch, executeBatch, getBatchDetail } from '../api/services/batchService.js';

function resetDatabase() {
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
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  const user = stmt.get(username) as { id: number; username: string; name: string; role: 'cs' | 'merchant' | 'leader'; passwordHash: string } | undefined;
  
  if (!user) {
    throw new Error('用户不存在');
  }

  return {
    token: 'test-token',
    user: {
      id: user.id,
      name: user.name,
      role: user.role
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
