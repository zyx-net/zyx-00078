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
  CASE_STATUS_LABELS
} from '../../shared/types.js';
import {
  createBatchOperation,
  updateBatchStats,
  addBatchItem,
  updateBatchItemStatus,
  findBatchDetailById,
  findBatchDetailByNo,
  findBatches,
  findBatchItemsForExport
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
    '处理时间'
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
    `"${new Date(item.updatedAt).toLocaleString()}"`
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  const BOM = '\uFEFF';
  return { success: true, data: BOM + csvContent };
}
