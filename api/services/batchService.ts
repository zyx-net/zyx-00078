import {
  BatchOperationAction,
  BatchPreviewRequest,
  BatchPreviewResponse,
  BatchPreviewItem,
  BatchExecuteRequest,
  BatchExecuteResponse,
  BatchItemResult,
  BatchListFilter,
  BatchDetail,
  ERROR_CODES,
  CaseAction,
  CaseStatus,
  CaseActionRequest,
  UserRole,
  BATCH_OPERATION_LABELS,
  CASE_STATUS_LABELS,
  BatchRevokePreviewRequest,
  BatchRevokePreviewResponse,
  BatchRevokePreviewItem,
  BatchRevokeExecuteRequest,
  BatchRevokeExecuteResponse,
  BATCH_REVOKE_ITEM_STATUS_LABELS,
  BatchItemStatus
} from '../../shared/types.js';
import {
  createBatchOperation,
  updateBatchStats,
  addBatchItem,
  updateBatchItemStatus,
  findBatchDetailById,
  findBatchDetailByNo,
  findBatches,
  findBatchItemsForExport,
  updateBatchRevoked,
  updateBatchItemRevokeStatus,
  createBatchRevokeAudit,
  updateBatchRevokeAuditStats,
  addBatchRevokeItem,
  updateBatchRevokeItemStatus,
  findLatestSuccessfulBatchByCaseId,
  findBatchRevokeItemsForExport
} from '../repositories/batchRepository.js';
import {
  findCaseById,
  updateCaseStatus
} from '../repositories/caseRepository.js';

interface StateTransition {
  action: CaseAction;
  role: 'cs';
  targetStatus: CaseStatus;
  requireEvidence: boolean;
}

const stateTransitions: Record<CaseStatus, StateTransition[]> = {
  pendingEvidence: [],
  merchantProcessing: [],
  csArbitration: [
    {
      action: 'csRefund',
      role: 'cs',
      targetStatus: 'refundCompleted',
      requireEvidence: false
    },
    {
      action: 'csReject',
      role: 'cs',
      targetStatus: 'rejected',
      requireEvidence: false
    }
  ],
  refundCompleted: [],
  rejected: []
};

function validateCaseForBatch(
  caseInfo: ReturnType<typeof findCaseById>,
  action: BatchOperationAction,
  caseId: number
): { canProcess: boolean; reason?: string } {
  if (!caseInfo) {
    return {
      canProcess: false,
      reason: `案件ID ${caseId} 不存在`
    };
  }

  if (caseInfo.status !== 'csArbitration') {
    return {
      canProcess: false,
      reason: `案件 ${caseInfo.orderNo} 当前状态为「${CASE_STATUS_LABELS[caseInfo.status]}」，仅「客服仲裁」状态可批量处理`
    };
  }

  const transitions = stateTransitions[caseInfo.status];
  const transition = transitions.find(t => t.action === action);

  if (!transition) {
    return {
      canProcess: false,
      reason: `案件 ${caseInfo.orderNo} 当前状态不支持 ${BATCH_OPERATION_LABELS[action]}`
    };
  }

  return { canProcess: true };
}

export function previewBatch(
  request: BatchPreviewRequest
): { success: boolean; data?: BatchPreviewResponse; error?: { code: string; message: string } } {
  const { caseIds, action } = request;

  if (!caseIds || caseIds.length === 0) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.BATCH_EMPTY,
        message: '请选择要处理的案件'
      }
    };
  }

  if (!action || !['csRefund', 'csReject'].includes(action)) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_PARAMS,
        message: '无效的批量操作类型'
      }
    };
  }

  const uniqueCaseIds = [...new Set(caseIds)];
  const items: BatchPreviewItem[] = [];
  let totalRefundAmount = 0;
  let processableRefundAmount = 0;
  let processableCount = 0;
  let unprocessableCount = 0;

  for (const caseId of uniqueCaseIds) {
    const caseInfo = findCaseById(caseId);
    const validation = validateCaseForBatch(caseInfo, action, caseId);

    const item: BatchPreviewItem = {
      caseId,
      orderNo: caseInfo?.orderNo || `未知(${caseId})`,
      currentStatus: caseInfo?.status || 'pendingEvidence',
      currentVersion: caseInfo?.version || 0,
      refundAmount: caseInfo?.refundAmount || 0,
      canProcess: validation.canProcess,
      reason: validation.reason
    };

    items.push(item);
    totalRefundAmount += item.refundAmount;

    if (validation.canProcess) {
      processableCount++;
      processableRefundAmount += item.refundAmount;
    } else {
      unprocessableCount++;
    }
  }

  return {
    success: true,
    data: {
      items,
      totalCount: uniqueCaseIds.length,
      processableCount,
      unprocessableCount,
      totalRefundAmount: Number(totalRefundAmount.toFixed(2)),
      processableRefundAmount: Number(processableRefundAmount.toFixed(2))
    }
  };
}

export function executeBatch(
  request: BatchExecuteRequest,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): { success: boolean; data?: BatchExecuteResponse; error?: { code: string; message: string } } {
  const { caseIds, action, remark, versions } = request;

  if (!caseIds || caseIds.length === 0) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.BATCH_EMPTY,
        message: '请选择要处理的案件'
      }
    };
  }

  if (!action || !['csRefund', 'csReject'].includes(action)) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_PARAMS,
        message: '无效的批量操作类型'
      }
    };
  }

  if (!versions || typeof versions !== 'object') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_PARAMS,
        message: '缺少版本号信息'
      }
    };
  }

  if (operatorRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限执行批量操作，仅客服可执行此操作'
      }
    };
  }

  const uniqueCaseIds = [...new Set(caseIds)];
  
  const preValidation = previewBatch({ caseIds: uniqueCaseIds, action });
  if (!preValidation.success || !preValidation.data) {
    return {
      success: false,
      error: preValidation.error
    };
  }

  const totalRefundAmount = preValidation.data.items.reduce((sum, item) => sum + item.refundAmount, 0);

  const batchOperation = createBatchOperation(
    action,
    operatorId,
    operatorName,
    remark || '',
    uniqueCaseIds.length,
    Number(totalRefundAmount.toFixed(2))
  );

  const batchId = batchOperation.id;
  const results: BatchItemResult[] = [];
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let successRefundAmount = 0;

  for (const caseId of uniqueCaseIds) {
    const caseInfo = findCaseById(caseId);
    const expectedVersion = versions[caseId];

    const batchItem = addBatchItem(
      batchId,
      caseId,
      caseInfo?.orderNo || `未知(${caseId})`,
      caseInfo?.status || 'pendingEvidence',
      caseInfo?.version || 0,
      caseInfo?.refundAmount || 0
    );

    const result: BatchItemResult = {
      caseId,
      orderNo: caseInfo?.orderNo || `未知(${caseId})`,
      status: 'failed',
      currentVersion: caseInfo?.version || 0,
      refundAmount: caseInfo?.refundAmount || 0
    };

    if (!caseInfo) {
      result.errorCode = ERROR_CODES.CASE_NOT_FOUND;
      result.errorMessage = `案件ID ${caseId} 不存在`;
      skippedCount++;
      result.status = 'skipped';
      updateBatchItemStatus(batchItem.id, 'skipped', result.errorCode, result.errorMessage);
      results.push(result);
      continue;
    }

    const validation = validateCaseForBatch(caseInfo, action, caseId);
    if (!validation.canProcess) {
      result.errorCode = ERROR_CODES.INVALID_STATUS_TRANSITION;
      result.errorMessage = validation.reason;
      skippedCount++;
      result.status = 'skipped';
      updateBatchItemStatus(batchItem.id, 'skipped', result.errorCode, result.errorMessage);
      results.push(result);
      continue;
    }

    if (caseInfo.version !== expectedVersion) {
      result.errorCode = ERROR_CODES.VERSION_CONFLICT;
      result.errorMessage = `案件 ${caseInfo.orderNo} 版本不匹配，当前版本v${caseInfo.version}，预期版本v${expectedVersion}，请刷新后重试`;
      failedCount++;
      result.status = 'failed';
      updateBatchItemStatus(batchItem.id, 'failed', result.errorCode, result.errorMessage);
      results.push(result);
      continue;
    }

    const transition = stateTransitions[caseInfo.status].find(t => t.action === action)!;
    const actionData: CaseActionRequest = {
      action: action as CaseAction,
      version: expectedVersion,
      remark: remark || ''
    };

    const updateResult = updateCaseStatus(
      caseId,
      expectedVersion,
      transition.targetStatus,
      actionData,
      operatorId,
      operatorName,
      'cs'
    );

    if (!updateResult.success) {
      if (updateResult.error === 'VERSION_CONFLICT') {
        result.errorCode = ERROR_CODES.VERSION_CONFLICT;
        result.errorMessage = `案件 ${caseInfo.orderNo} 版本不匹配，可能已被其他人处理，请刷新后重试`;
      } else {
        result.errorCode = ERROR_CODES.CASE_NOT_FOUND;
        result.errorMessage = `案件 ${caseInfo.orderNo} 处理失败`;
      }
      failedCount++;
      result.status = 'failed';
      updateBatchItemStatus(batchItem.id, 'failed', result.errorCode, result.errorMessage);
      results.push(result);
      continue;
    }

    successCount++;
    successRefundAmount += caseInfo.refundAmount;
    result.status = 'success';
    result.currentVersion = updateResult.case!.version;
    updateBatchItemStatus(
      batchItem.id,
      'success',
      undefined,
      undefined,
      updateResult.case!.version,
      transition.targetStatus
    );
    results.push(result);
  }

  updateBatchStats(batchId, successCount, failedCount, skippedCount);

  return {
    success: true,
    data: {
      batchNo: batchOperation.batchNo,
      action,
      totalCount: uniqueCaseIds.length,
      successCount,
      failedCount,
      skippedCount,
      totalRefundAmount: Number(totalRefundAmount.toFixed(2)),
      successRefundAmount: Number(successRefundAmount.toFixed(2)),
      items: results
    }
  };
}

export function getBatchList(
  filter: BatchListFilter
): { success: boolean; data?: ReturnType<typeof findBatches> } {
  const batches = findBatches(filter);
  return { success: true, data: batches };
}

export function getBatchDetail(
  batchIdOrNo: string
): { success: boolean; data?: BatchDetail; error?: { code: string; message: string } } {
  let detail: BatchDetail | undefined;

  const id = parseInt(batchIdOrNo);
  if (!isNaN(id)) {
    detail = findBatchDetailById(id);
  }

  if (!detail) {
    detail = findBatchDetailByNo(batchIdOrNo);
  }

  if (!detail) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.BATCH_NOT_FOUND,
        message: '批次不存在'
      }
    };
  }

  return { success: true, data: detail };
}

export function exportBatchCSV(
  batchId: number
): { success: boolean; data?: string; error?: { code: string; message: string } } {
  const batch = findBatchDetailById(batchId);
  if (!batch) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.BATCH_NOT_FOUND,
        message: '批次不存在'
      }
    };
  }

  const items = findBatchItemsForExport(batchId);

  const headers = [
    '批次号',
    '操作类型',
    '操作人',
    '操作备注',
    '案件ID',
    '订单号',
    '退款金额',
    '原状态',
    '原版本号',
    '处理结果',
    '新状态',
    '新版本号',
    '错误码',
    '错误信息',
    '处理时间',
    '是否已撤销',
    '撤销时间',
    '撤销人',
    '撤销备注'
  ];

  const actionLabel = BATCH_OPERATION_LABELS[batch.action as BatchOperationAction];

  const rows = items.map(item => [
    `"${item.batchNo}"`,
    `"${actionLabel}"`,
    `"${item.operatorName}"`,
    `"${(item.remark || '').replace(/"/g, '""')}"`,
    item.caseId,
    `"${item.orderNo}"`,
    item.refundAmount.toFixed(2),
    `"${CASE_STATUS_LABELS[item.originalStatus]}"`,
    item.originalVersion,
    `"${item.status === 'success' ? '成功' : item.status === 'failed' ? '失败' : '已跳过'}"`,
    item.newStatus ? `"${CASE_STATUS_LABELS[item.newStatus as CaseStatus]}"` : '',
    item.newVersion || '',
    item.errorCode ? `"${item.errorCode}"` : '',
    item.errorMessage ? `"${item.errorMessage.replace(/"/g, '""')}"` : '',
    `"${new Date(item.updatedAt).toLocaleString()}"`,
    item.isRevoked ? '"是"' : '"否"',
    item.revokedAt ? `"${new Date(item.revokedAt).toLocaleString()}"` : '',
    item.revokedByName ? `"${item.revokedByName}"` : '',
    item.revokeRemark ? `"${item.revokeRemark.replace(/"/g, '""')}"` : ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const BOM = '\uFEFF';
  return { success: true, data: BOM + csvContent };
}

function validateBatchForRevoke(
  batch: BatchDetail,
  operatorId: number,
  operatorRole: UserRole
): { canRevoke: boolean; reason?: string } {
  if (operatorRole !== 'cs') {
    return {
      canRevoke: false,
      reason: '无权限撤销批次，仅客服可执行此操作'
    };
  }

  if (batch.operatorId !== operatorId) {
    return {
      canRevoke: false,
      reason: '不能撤销他人执行的批次'
    };
  }

  if (batch.isRevoked) {
    return {
      canRevoke: false,
      reason: '该批次已被撤销'
    };
  }

  if (batch.successCount === 0) {
    return {
      canRevoke: false,
      reason: '该批次没有成功处理的案件，无需撤销'
    };
  }

  return { canRevoke: true };
}

function validateCaseForRevoke(
  caseInfo: ReturnType<typeof findCaseById>,
  batchItem: {
    id: number;
    caseId: number;
    orderNo: string;
    status: BatchItemStatus;
    newVersion?: number;
    newStatus?: CaseStatus;
    originalStatus: CaseStatus;
    originalVersion: number;
  },
  batchId: number
): { canRevoke: boolean; reason?: string } {
  if (!caseInfo) {
    return {
      canRevoke: false,
      reason: `案件ID ${batchItem.caseId} 不存在`
    };
  }

  if (batchItem.status !== 'success') {
    return {
      canRevoke: false,
      reason: `案件 ${batchItem.orderNo} 在批次中未成功处理，无需撤销`
    };
  }

  if (!batchItem.newVersion || !batchItem.newStatus) {
    return {
      canRevoke: false,
      reason: `案件 ${batchItem.orderNo} 批次信息不完整，无法撤销`
    };
  }

  const latestBatch = findLatestSuccessfulBatchByCaseId(batchItem.caseId, batchId);
  if (latestBatch && latestBatch.batchId !== batchId) {
    return {
      canRevoke: false,
      reason: `案件 ${batchItem.orderNo} 已被其他批次处理，无法撤销`
    };
  }

  if (caseInfo.version !== batchItem.newVersion) {
    return {
      canRevoke: false,
      reason: `案件 ${batchItem.orderNo} 已被后续处理（当前版本v${caseInfo.version}，批次处理后版本v${batchItem.newVersion}），无法撤销`
    };
  }

  if (caseInfo.status !== batchItem.newStatus) {
    return {
      canRevoke: false,
      reason: `案件 ${batchItem.orderNo} 状态已变更（当前状态${CASE_STATUS_LABELS[caseInfo.status]}，批次处理后状态${CASE_STATUS_LABELS[batchItem.newStatus]}），无法撤销`
    };
  }

  return { canRevoke: true };
}

export function previewRevokeBatch(
  request: BatchRevokePreviewRequest,
  operatorId: number,
  operatorRole: UserRole
): { success: boolean; data?: BatchRevokePreviewResponse; error?: { code: string; message: string } } {
  const { batchId } = request;

  if (!batchId || typeof batchId !== 'number') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_PARAMS,
        message: '无效的批次ID'
      }
    };
  }

  const batch = findBatchDetailById(batchId);
  if (!batch) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.BATCH_NOT_FOUND,
        message: '批次不存在'
      }
    };
  }

  const batchValidation = validateBatchForRevoke(batch, operatorId, operatorRole);
  if (!batchValidation.canRevoke) {
    let errorCode: string = ERROR_CODES.BATCH_NOT_REVOCABLE;
    if (operatorRole !== 'cs') {
      errorCode = ERROR_CODES.PERMISSION_DENIED;
    } else if (batch.isRevoked) {
      errorCode = ERROR_CODES.BATCH_ALREADY_REVOKED;
    } else if (batch.operatorId !== operatorId) {
      errorCode = ERROR_CODES.BATCH_NOT_OWNED;
    }

    return {
      success: false,
      error: {
        code: errorCode,
        message: batchValidation.reason || '批次不可撤销'
      }
    };
  }

  const items: BatchRevokePreviewItem[] = [];
  let totalRefundAmount = 0;
  let revocableRefundAmount = 0;
  let revocableCount = 0;
  let unrevocableCount = 0;

  for (const batchItem of batch.items) {
    const caseInfo = findCaseById(batchItem.caseId);

    const validation = validateCaseForRevoke(caseInfo, batchItem, batchId);

    const targetStatus = batchItem.originalStatus;
    const targetVersion = batchItem.originalVersion;

    const item: BatchRevokePreviewItem = {
      batchItemId: batchItem.id,
      caseId: batchItem.caseId,
      orderNo: batchItem.orderNo,
      originalStatus: batchItem.newStatus || batchItem.originalStatus,
      originalVersion: batchItem.newVersion || batchItem.originalVersion,
      targetStatus,
      targetVersion,
      currentStatus: caseInfo?.status || 'pendingEvidence',
      currentVersion: caseInfo?.version || 0,
      refundAmount: batchItem.refundAmount,
      canRevoke: validation.canRevoke,
      revokeReason: validation.reason
    };

    items.push(item);
    totalRefundAmount += item.refundAmount;

    if (validation.canRevoke) {
      revocableCount++;
      revocableRefundAmount += item.refundAmount;
    } else {
      unrevocableCount++;
    }
  }

  return {
    success: true,
    data: {
      items,
      totalCount: items.length,
      revocableCount,
      unrevocableCount,
      totalRefundAmount: Number(totalRefundAmount.toFixed(2)),
      revocableRefundAmount: Number(revocableRefundAmount.toFixed(2)),
      canRevokeBatch: revocableCount > 0,
      batchNotRevocableReason: revocableCount === 0 ? '该批次没有可撤销的案件' : undefined
    }
  };
}

export function executeRevokeBatch(
  request: BatchRevokeExecuteRequest,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): { success: boolean; data?: BatchRevokeExecuteResponse; error?: { code: string; message: string } } {
  const { batchId, remark, versions } = request;

  if (!batchId || typeof batchId !== 'number') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_PARAMS,
        message: '无效的批次ID'
      }
    };
  }

  if (!versions || typeof versions !== 'object') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_PARAMS,
        message: '缺少版本号信息'
      }
    };
  }

  if (operatorRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限撤销批次，仅客服可执行此操作'
      }
    };
  }

  const batch = findBatchDetailById(batchId);
  if (!batch) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.BATCH_NOT_FOUND,
        message: '批次不存在'
      }
    };
  }

  const batchValidation = validateBatchForRevoke(batch, operatorId, operatorRole);
  if (!batchValidation.canRevoke) {
    let errorCode: string = ERROR_CODES.BATCH_NOT_REVOCABLE;
    if (operatorRole !== 'cs') {
      errorCode = ERROR_CODES.PERMISSION_DENIED;
    } else if (batch.isRevoked) {
      errorCode = ERROR_CODES.BATCH_ALREADY_REVOKED;
    } else if (batch.operatorId !== operatorId) {
      errorCode = ERROR_CODES.BATCH_NOT_OWNED;
    }

    return {
      success: false,
      error: {
        code: errorCode,
        message: batchValidation.reason || '批次不可撤销'
      }
    };
  }

  const preValidation = previewRevokeBatch({ batchId }, operatorId, operatorRole);
  if (!preValidation.success || !preValidation.data) {
    return {
      success: false,
      error: preValidation.error
    };
  }

  if (preValidation.data.revocableCount === 0) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.REVOKE_EMPTY,
        message: '该批次没有可撤销的案件'
      }
    };
  }

  const totalRefundAmount = preValidation.data.items.reduce((sum, item) => sum + item.refundAmount, 0);

  const revokeAudit = createBatchRevokeAudit(
    batchId,
    batch.batchNo,
    operatorId,
    operatorName,
    remark || '',
    preValidation.data.items.length
  );

  const revokeAuditId = revokeAudit.id;
  const results: BatchItemResult[] = [];
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let successRefundAmount = 0;

  for (const previewItem of preValidation.data.items) {
    const caseInfo = findCaseById(previewItem.caseId);
    const expectedVersion = versions[previewItem.caseId];

    const revokeItem = addBatchRevokeItem(
      revokeAuditId,
      previewItem.batchItemId,
      previewItem.caseId,
      previewItem.orderNo,
      previewItem.originalStatus,
      previewItem.originalVersion,
      previewItem.targetStatus,
      previewItem.targetVersion,
      previewItem.currentStatus,
      previewItem.currentVersion,
      previewItem.refundAmount,
      previewItem.canRevoke,
      previewItem.revokeReason
    );

    const result: BatchItemResult = {
      caseId: previewItem.caseId,
      orderNo: previewItem.orderNo,
      status: 'failed',
      currentVersion: caseInfo?.version || 0,
      refundAmount: previewItem.refundAmount
    };

    if (!previewItem.canRevoke) {
      result.errorCode = ERROR_CODES.CASE_ALREADY_PROCESSED;
      result.errorMessage = previewItem.revokeReason;
      skippedCount++;
      result.status = 'skipped';
      updateBatchRevokeItemStatus(revokeItem.id, 'skipped', result.errorCode, result.errorMessage);
      results.push(result);
      continue;
    }

    if (!caseInfo) {
      result.errorCode = ERROR_CODES.CASE_NOT_FOUND;
      result.errorMessage = `案件ID ${previewItem.caseId} 不存在`;
      skippedCount++;
      result.status = 'skipped';
      updateBatchRevokeItemStatus(revokeItem.id, 'skipped', result.errorCode, result.errorMessage);
      results.push(result);
      continue;
    }

    if (caseInfo.version !== expectedVersion) {
      result.errorCode = ERROR_CODES.VERSION_CONFLICT;
      result.errorMessage = `案件 ${previewItem.orderNo} 版本不匹配，当前版本v${caseInfo.version}，预期版本v${expectedVersion}，请刷新后重试`;
      failedCount++;
      result.status = 'failed';
      updateBatchRevokeItemStatus(revokeItem.id, 'failed', result.errorCode, result.errorMessage);
      updateBatchItemRevokeStatus(previewItem.batchItemId, 'failed', result.errorCode, result.errorMessage);
      results.push(result);
      continue;
    }

    const reValidation = validateCaseForRevoke(caseInfo, {
      id: previewItem.batchItemId,
      caseId: previewItem.caseId,
      orderNo: previewItem.orderNo,
      status: 'success',
      newVersion: previewItem.originalVersion,
      newStatus: previewItem.originalStatus,
      originalStatus: previewItem.targetStatus,
      originalVersion: previewItem.targetVersion
    }, batchId);

    if (!reValidation.canRevoke) {
      result.errorCode = ERROR_CODES.CASE_ALREADY_PROCESSED;
      result.errorMessage = reValidation.reason;
      skippedCount++;
      result.status = 'skipped';
      updateBatchRevokeItemStatus(revokeItem.id, 'skipped', result.errorCode, result.errorMessage);
      results.push(result);
      continue;
    }

    const actionData: CaseActionRequest = {
      action: 'csRefund',
      version: expectedVersion,
      remark: `撤销批次${batch.batchNo}：${remark || ''}`
    };

    const updateResult = updateCaseStatus(
      previewItem.caseId,
      expectedVersion,
      previewItem.targetStatus,
      actionData,
      operatorId,
      operatorName,
      'cs'
    );

    if (!updateResult.success) {
      if (updateResult.error === 'VERSION_CONFLICT') {
        result.errorCode = ERROR_CODES.VERSION_CONFLICT;
        result.errorMessage = `案件 ${previewItem.orderNo} 版本不匹配，可能已被其他人处理，请刷新后重试`;
      } else {
        result.errorCode = ERROR_CODES.CASE_NOT_FOUND;
        result.errorMessage = `案件 ${previewItem.orderNo} 撤销失败`;
      }
      failedCount++;
      result.status = 'failed';
      updateBatchRevokeItemStatus(revokeItem.id, 'failed', result.errorCode, result.errorMessage);
      updateBatchItemRevokeStatus(previewItem.batchItemId, 'failed', result.errorCode, result.errorMessage);
      results.push(result);
      continue;
    }

    successCount++;
    successRefundAmount += previewItem.refundAmount;
    result.status = 'success';
    result.currentVersion = updateResult.case!.version;
    updateBatchRevokeItemStatus(
      revokeItem.id,
      'success',
      undefined,
      undefined,
      updateResult.case!.version,
      previewItem.targetStatus
    );
    updateBatchItemRevokeStatus(
      previewItem.batchItemId,
      'success',
      undefined,
      undefined,
      updateResult.case!.version,
      previewItem.targetStatus
    );
    results.push(result);
  }

  if (successCount > 0) {
    updateBatchRevoked(batchId, operatorId, operatorName, remark || '');
  }

  updateBatchRevokeAuditStats(revokeAuditId, successCount, failedCount, skippedCount);

  return {
    success: true,
    data: {
      revokeId: revokeAuditId,
      batchNo: batch.batchNo,
      totalCount: preValidation.data.items.length,
      successCount,
      failedCount,
      skippedCount,
      totalRefundAmount: Number(totalRefundAmount.toFixed(2)),
      successRefundAmount: Number(successRefundAmount.toFixed(2)),
      items: results
    }
  };
}

export function exportRevokeBatchCSV(
  revokeAuditId: number
): { success: boolean; data?: string; error?: { code: string; message: string } } {
  const revokeDetail = findBatchRevokeItemsForExport(revokeAuditId);
  if (!revokeDetail || revokeDetail.length === 0) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.BATCH_NOT_FOUND,
        message: '撤销记录不存在'
      }
    };
  }

  const headers = [
    '撤销记录ID',
    '批次号',
    '操作类型',
    '操作人',
    '操作备注',
    '案件ID',
    '订单号',
    '退款金额',
    '撤销前状态',
    '撤销前版本号',
    '撤销目标状态',
    '撤销目标版本号',
    '处理结果',
    '撤销后状态',
    '撤销后版本号',
    '错误码',
    '错误信息',
    '处理时间'
  ];

  const rows = revokeDetail.map(item => [
    item.revokeAuditId,
    `"${item.batchNo}"`,
    '"撤销批次"',
    `"${item.operatorName}"`,
    `"${(item.remark || '').replace(/"/g, '""')}"`,
    item.caseId,
    `"${item.orderNo}"`,
    item.refundAmount.toFixed(2),
    `"${CASE_STATUS_LABELS[item.originalStatus]}"`,
    item.originalVersion,
    `"${CASE_STATUS_LABELS[item.targetStatus]}"`,
    item.targetVersion,
    `"${BATCH_REVOKE_ITEM_STATUS_LABELS[item.status]}"`,
    item.newStatus ? `"${CASE_STATUS_LABELS[item.newStatus as CaseStatus]}"` : '',
    item.newVersion || '',
    item.errorCode ? `"${item.errorCode}"` : '',
    item.errorMessage ? `"${item.errorMessage.replace(/"/g, '""')}"` : '',
    `"${new Date(item.createdAt).toLocaleString()}"`
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const BOM = '\uFEFF';
  return { success: true, data: BOM + csvContent };
}
