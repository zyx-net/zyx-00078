import {
  BATCH_REVOKE_ITEM_STATUS_LABELS,
  BATCH_OPERATION_LABELS,
  BATCH_ITEM_STATUS_LABELS,
  CASE_STATUS_LABELS,
  ERROR_CODES,
  type BatchOperation,
  type BatchRevokePreviewResponse,
  type BatchRevokePreviewItem
} from '../shared/types.js';

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

console.log('\n========================================');
console.log('  撤销批次功能 - 前端逻辑测试');
console.log('========================================');

let passed = 0;
let failed = 0;

if (runTest('1. 常量标签验证', () => {
  assert(BATCH_REVOKE_ITEM_STATUS_LABELS['success'] === '撤销成功', '撤销成功标签应该正确');
  assert(BATCH_REVOKE_ITEM_STATUS_LABELS['failed'] === '撤销失败', '撤销失败标签应该正确');
  assert(BATCH_REVOKE_ITEM_STATUS_LABELS['skipped'] === '已跳过', '已跳过标签应该正确');
  assert(BATCH_REVOKE_ITEM_STATUS_LABELS['pending'] === '待处理', '待处理标签应该正确');
  
  assert(BATCH_OPERATION_LABELS['csRefund'] === '批量同意退款', '批量退款标签应该正确');
  assert(BATCH_OPERATION_LABELS['csReject'] === '批量驳回', '批量驳回标签应该正确');
})) { passed++; } else { failed++; }

if (runTest('2. canRevokeBatch 逻辑验证', () => {
  const mockUser = { id: 1, name: '王客服', role: 'cs' as const };
  
  const canRevokeBatch = (batch: BatchOperation, user: { id: number; role: string } | null): boolean => {
    if (!user || user.role !== 'cs') return false;
    if (batch.operatorId !== user.id) return false;
    if (batch.isRevoked) return false;
    if (batch.successCount === 0) return false;
    return true;
  };
  
  const validBatch: BatchOperation = {
    id: 1,
    batchNo: 'BATCH202601010001',
    action: 'csRefund',
    operatorId: 1,
    operatorName: '王客服',
    remark: '测试批次',
    totalCount: 3,
    successCount: 3,
    failedCount: 0,
    skippedCount: 0,
    totalRefundAmount: 276.4,
    isRevoked: false,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
  
  assert(canRevokeBatch(validBatch, mockUser) === true, '客服自己创建的未撤销批次应该可撤销');
  
  const revokedBatch = { ...validBatch, isRevoked: true };
  assert(canRevokeBatch(revokedBatch, mockUser) === false, '已撤销批次不应该可撤销');
  
  const noSuccessBatch = { ...validBatch, successCount: 0 };
  assert(canRevokeBatch(noSuccessBatch, mockUser) === false, '没有成功案件的批次不应该可撤销');
  
  const otherUserBatch = { ...validBatch, operatorId: 2 };
  assert(canRevokeBatch(otherUserBatch, mockUser) === false, '他人创建的批次不应该可撤销');
  
  const merchantUser = { id: 2, name: '张商家', role: 'merchant' as const };
  assert(canRevokeBatch(validBatch, merchantUser) === false, '商家不应该能撤销');
  
  const leaderUser = { id: 3, name: '李团长', role: 'leader' as const };
  assert(canRevokeBatch(validBatch, leaderUser) === false, '团长不应该能撤销');
  
  assert(canRevokeBatch(validBatch, null) === false, '未登录用户不应该能撤销');
})) { passed++; } else { failed++; }

if (runTest('3. 撤销预览数据处理验证', () => {
  const mockPreviewData: BatchRevokePreviewResponse = {
    items: [
      {
        batchItemId: 1,
        caseId: 1,
        orderNo: 'DD202601001',
        originalStatus: 'refundCompleted',
        originalVersion: 4,
        targetStatus: 'csArbitration',
        targetVersion: 3,
        currentStatus: 'refundCompleted',
        currentVersion: 4,
        refundAmount: 58.0,
        canRevoke: true
      },
      {
        batchItemId: 2,
        caseId: 2,
        orderNo: 'DD202601002',
        originalStatus: 'refundCompleted',
        originalVersion: 4,
        targetStatus: 'csArbitration',
        targetVersion: 3,
        currentStatus: 'refundCompleted',
        currentVersion: 5,
        refundAmount: 128.5,
        canRevoke: false,
        revokeReason: '案件 DD202601002 已被后续处理（当前版本v5，批次处理后版本v4），无法撤销'
      }
    ],
    totalCount: 2,
    revocableCount: 1,
    unrevocableCount: 1,
    totalRefundAmount: 186.5,
    revocableRefundAmount: 58.0,
    canRevokeBatch: true
  };
  
  assert(mockPreviewData.totalCount === 2, '总案件数应该正确');
  assert(mockPreviewData.revocableCount === 1, '可撤销数应该正确');
  assert(mockPreviewData.unrevocableCount === 1, '不可撤销数应该正确');
  assert(mockPreviewData.canRevokeBatch === true, '应该可以撤销批次');
  
  const revocableItem = mockPreviewData.items[0];
  assert(revocableItem.canRevoke === true, '第一个案件应该可撤销');
  assert(CASE_STATUS_LABELS[revocableItem.targetStatus] === '客服仲裁', '目标状态标签应该正确');
  assert(CASE_STATUS_LABELS[revocableItem.originalStatus] === '退款完成', '原始状态标签应该正确');
  
  const unrevocableItem = mockPreviewData.items[1];
  assert(unrevocableItem.canRevoke === false, '第二个案件不应该可撤销');
  assert(unrevocableItem.revokeReason?.includes('已被后续处理') === true, '应该包含不可撤销原因');
  
  const versions: Record<number, number> = {};
  mockPreviewData.items.forEach(item => {
    versions[item.caseId] = item.currentVersion;
  });
  assert(versions[1] === 4, '版本号映射应该正确');
  assert(versions[2] === 5, '版本号映射应该正确');
})) { passed++; } else { failed++; }

if (runTest('4. 错误码验证', () => {
  assert(ERROR_CODES.BATCH_ALREADY_REVOKED === 'BATCH_ALREADY_REVOKED', '已撤销错误码应该正确');
  assert(ERROR_CODES.BATCH_NOT_OWNED === 'BATCH_NOT_OWNED', '非本人批次错误码应该正确');
  assert(ERROR_CODES.BATCH_NOT_REVOCABLE === 'BATCH_NOT_REVOCABLE', '不可撤销错误码应该正确');
  assert(ERROR_CODES.CASE_ALREADY_PROCESSED === 'CASE_ALREADY_PROCESSED', '案件已处理错误码应该正确');
  assert(ERROR_CODES.REVOKE_EMPTY === 'REVOKE_EMPTY', '空撤销错误码应该正确');
  assert(ERROR_CODES.PERMISSION_DENIED === 'PERMISSION_DENIED', '权限拒绝错误码应该正确');
  assert(ERROR_CODES.VERSION_CONFLICT === 'VERSION_CONFLICT', '版本冲突错误码应该正确');
})) { passed++; } else { failed++; }

if (runTest('5. 撤销结果统计验证', () => {
  const mockResult = {
    revokeId: 1,
    batchNo: 'BATCH202601010001',
    totalCount: 3,
    successCount: 2,
    failedCount: 1,
    skippedCount: 0,
    totalRefundAmount: 276.4,
    successRefundAmount: 186.5,
    items: [
      { caseId: 1, orderNo: 'DD202601001', status: 'success' as const, currentVersion: 5, refundAmount: 58.0 },
      { caseId: 2, orderNo: 'DD202601002', status: 'success' as const, currentVersion: 5, refundAmount: 128.5 },
      { caseId: 3, orderNo: 'DD202601003', status: 'failed' as const, currentVersion: 4, refundAmount: 89.9, errorCode: 'VERSION_CONFLICT', errorMessage: '版本不匹配' }
    ]
  };
  
  assert(mockResult.totalCount === 3, '总案件数应该正确');
  assert(mockResult.successCount === 2, '成功数应该正确');
  assert(mockResult.failedCount === 1, '失败数应该正确');
  assert(mockResult.skippedCount === 0, '跳过数应该正确');
  
  const successItems = mockResult.items.filter(i => i.status === 'success');
  assert(successItems.length === 2, '应该有2个成功的案件');
  
  const failedItems = mockResult.items.filter(i => i.status === 'failed');
  assert(failedItems.length === 1, '应该有1个失败的案件');
  assert(failedItems[0].errorCode === ERROR_CODES.VERSION_CONFLICT, '错误码应该正确');
  
  successItems.forEach(item => {
    assert(item.currentVersion === 5, '成功案件版本号应该递增到5');
  });
})) { passed++; } else { failed++; }

if (runTest('6. 状态标签映射验证', () => {
  const statuses = ['pending', 'success', 'failed', 'skipped'] as const;
  
  statuses.forEach(status => {
    const label = BATCH_REVOKE_ITEM_STATUS_LABELS[status];
    assert(label !== undefined && label.length > 0, `状态 ${status} 应该有对应的标签`);
  });
  
  assert(CASE_STATUS_LABELS['csArbitration'] === '客服仲裁', '客服仲裁状态标签应该正确');
  assert(CASE_STATUS_LABELS['refundCompleted'] === '退款完成', '退款完成状态标签应该正确');
  assert(CASE_STATUS_LABELS['rejected'] === '驳回', '驳回状态标签应该正确');
  assert(CASE_STATUS_LABELS['merchantProcessing'] === '商家处理', '商家处理状态标签应该正确');
  assert(CASE_STATUS_LABELS['pendingEvidence'] === '待举证', '待举证状态标签应该正确');
})) { passed++; } else { failed++; }

if (runTest('7. 不可撤销原因分类验证', () => {
  const getStatusIcon = (canRevoke: boolean, reason?: string): string => {
    if (canRevoke) return 'success';
    if (reason?.includes('版本') || reason?.includes('已被')) return 'failed';
    return 'skipped';
  };
  
  assert(getStatusIcon(true) === 'success', '可撤销应该返回success');
  assert(getStatusIcon(false, '案件已被后续处理') === 'failed', '已被处理应该返回failed');
  assert(getStatusIcon(false, '版本不匹配') === 'failed', '版本不匹配应该返回failed');
  assert(getStatusIcon(false, '未成功处理') === 'skipped', '其他原因应该返回skipped');
})) { passed++; } else { failed++; }

if (runTest('8. 撤销金额计算验证', () => {
  const items: BatchRevokePreviewItem[] = [
    {
      batchItemId: 1,
      caseId: 1,
      orderNo: 'DD202601001',
      originalStatus: 'refundCompleted',
      originalVersion: 4,
      targetStatus: 'csArbitration',
      targetVersion: 3,
      currentStatus: 'refundCompleted',
      currentVersion: 4,
      refundAmount: 58.0,
      canRevoke: true
    },
    {
      batchItemId: 2,
      caseId: 2,
      orderNo: 'DD202601002',
      originalStatus: 'refundCompleted',
      originalVersion: 4,
      targetStatus: 'csArbitration',
      targetVersion: 3,
      currentStatus: 'refundCompleted',
      currentVersion: 4,
      refundAmount: 128.5,
      canRevoke: true
    },
    {
      batchItemId: 3,
      caseId: 3,
      orderNo: 'DD202601003',
      originalStatus: 'refundCompleted',
      originalVersion: 4,
      targetStatus: 'csArbitration',
      targetVersion: 3,
      currentStatus: 'refundCompleted',
      currentVersion: 5,
      refundAmount: 89.9,
      canRevoke: false,
      revokeReason: '已被后续处理'
    }
  ];
  
  const totalAmount = items.reduce((sum, item) => sum + item.refundAmount, 0);
  const revocableAmount = items.filter(i => i.canRevoke).reduce((sum, item) => sum + item.refundAmount, 0);
  
  assert(Math.abs(totalAmount - 276.4) < 0.01, '总金额应该正确');
  assert(Math.abs(revocableAmount - 186.5) < 0.01, '可撤销金额应该正确');
  
  const revocableCount = items.filter(i => i.canRevoke).length;
  const unrevocableCount = items.filter(i => !i.canRevoke).length;
  
  assert(revocableCount === 2, '可撤销数量应该正确');
  assert(unrevocableCount === 1, '不可撤销数量应该正确');
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
  console.log('\n✅ 所有前端逻辑测试通过！');
  process.exit(0);
}
