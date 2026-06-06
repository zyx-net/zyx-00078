import {
  ApiResponse,
  QualityInspection,
  QualityInspectionItem,
  QualityInspectionStatus,
  QualityInspectionListFilter,
  CreateQualityInspectionRequest,
  CreateQualityInspectionResponse,
  InspectQualityRequest,
  BatchInspectQualityRequest,
  QualityInspectionImportResult,
  QUALITY_INSPECTION_ERROR_CODES,
  ERROR_CODES,
  UserRole,
  QUALITY_INSPECTION_STATUS_LABELS,
  CASE_TYPE_LABELS,
  RESPONSIBLE_PARTY_LABELS,
  QUALITY_INSPECTION_CASE_STATUS_LABELS
} from '../../shared/types.js';
import {
  findFinishedCasesForInspection,
  createQualityInspection as createInspectionInDb,
  findInspectionById,
  findInspectionByNo,
  findInspections,
  findInspectionDetailById,
  findInspectionItemDetailById,
  updateInspectionItemStatus,
  findItemsForExport,
  importInspectionItems,
  addExportLog,
  findOperationLogsByInspectionId,
  findAllOperationLogs,
  CreateQualityInspectionParams
} from '../repositories/qualityInspectionRepository.js';
import { findUserById } from '../repositories/userRepository.js';

function parseCSV(csvContent: string): Array<Record<string, string>> {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const result: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    result.push(row);
  }

  return result;
}

export function previewQualityInspection(params: {
  startDate: string;
  endDate: string;
  caseType?: string;
  responsibleParty?: string;
  operatorId?: number;
  caseIds?: number[];
  userRole: UserRole;
}): ApiResponse<{ caseCount: number; cases: Array<{ caseId: number; orderNo: string; caseType: string; status: string; refundAmount: number; operatorName: string }> }> {
  if (params.userRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限创建质检抽查单，仅客服可执行此操作'
      }
    };
  }

  if (!params.startDate || !params.endDate) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_PARAMS,
        message: '请选择开始日期和结束日期'
      }
    };
  }

  const cases = findFinishedCasesForInspection(
    params.startDate,
    params.endDate,
    params.caseType as any,
    params.responsibleParty as any,
    params.operatorId,
    params.caseIds
  );

  return {
    success: true,
    data: {
      caseCount: cases.length,
      cases: cases.map(c => ({
        caseId: c.id,
        orderNo: c.orderNo,
        caseType: CASE_TYPE_LABELS[c.caseType],
        status: c.status,
        refundAmount: c.refundAmount,
        operatorName: c.createdByName
      }))
    }
  };
}

export function createQualityInspection(
  params: CreateQualityInspectionRequest,
  createdBy: number,
  createdByName: string,
  userRole: UserRole
): ApiResponse<CreateQualityInspectionResponse> {
  if (userRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限创建质检抽查单，仅客服可执行此操作'
      }
    };
  }

  if (!params.title || !params.title.trim()) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_PARAMS,
        message: '请输入抽查单标题'
      }
    };
  }

  if (!params.startDate || !params.endDate) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_PARAMS,
        message: '请选择开始日期和结束日期'
      }
    };
  }

  const cases = findFinishedCasesForInspection(
    params.startDate,
    params.endDate,
    params.caseType,
    params.responsibleParty,
    params.operatorId,
    params.caseIds
  );

  if (cases.length === 0) {
    return {
      success: false,
      error: {
        code: QUALITY_INSPECTION_ERROR_CODES.NO_CASES_SELECTED,
        message: '没有符合条件的已完成案件'
      }
    };
  }

  let operatorName: string | undefined;
  if (params.operatorId) {
    const user = findUserById(params.operatorId);
    operatorName = user?.name;
  }

  const createParams: CreateQualityInspectionParams = {
    title: params.title,
    startDate: params.startDate,
    endDate: params.endDate,
    caseType: params.caseType,
    responsibleParty: params.responsibleParty,
    operatorId: params.operatorId,
    operatorName,
    createdBy,
    createdByName,
    caseIds: params.caseIds
  };

  const inspection = createInspectionInDb(createParams, cases);

  return {
    success: true,
    data: {
      inspectionId: inspection.id,
      inspectionNo: inspection.inspectionNo,
      totalCount: inspection.totalCount
    }
  };
}

export function getQualityInspectionList(
  filter: QualityInspectionListFilter,
  userRole: UserRole
): ApiResponse<QualityInspection[]> {
  if (userRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限查看质检抽查单'
      }
    };
  }

  const inspections = findInspections(filter);
  return {
    success: true,
    data: inspections
  };
}

export function getQualityInspectionDetail(
  inspectionIdOrNo: string,
  userRole: UserRole
): ApiResponse<QualityInspection & { items: QualityInspectionItem[] }> {
  if (userRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限查看质检抽查单'
      }
    };
  }

  let detail: ReturnType<typeof findInspectionDetailById>;

  const id = parseInt(inspectionIdOrNo);
  if (!isNaN(id)) {
    detail = findInspectionDetailById(id);
  } else {
    const inspection = findInspectionByNo(inspectionIdOrNo);
    if (inspection) {
      detail = findInspectionDetailById(inspection.id);
    }
  }

  if (!detail) {
    return {
      success: false,
      error: {
        code: QUALITY_INSPECTION_ERROR_CODES.INSPECTION_NOT_FOUND,
        message: '质检抽查单不存在'
      }
    };
  }

  return {
    success: true,
    data: detail
  };
}

export function getQualityInspectionItemDetail(
  itemId: number,
  userRole: UserRole
): ApiResponse<any> {
  if (userRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限查看质检明细'
      }
    };
  }

  const detail = findInspectionItemDetailById(itemId);
  if (!detail) {
    return {
      success: false,
      error: {
        code: QUALITY_INSPECTION_ERROR_CODES.INSPECTION_ITEM_NOT_FOUND,
        message: '质检明细不存在'
      }
    };
  }

  return {
    success: true,
    data: detail
  };
}

export function inspectQualityItem(
  params: InspectQualityRequest,
  inspectorId: number,
  inspectorName: string,
  userRole: UserRole
): ApiResponse<QualityInspectionItem> {
  if (userRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限进行质检，仅客服可执行此操作'
      }
    };
  }

  if (!params.status || !['passed', 'needsReview', 'misjudged'].includes(params.status)) {
    return {
      success: false,
      error: {
        code: QUALITY_INSPECTION_ERROR_CODES.INVALID_STATUS,
        message: '无效的质检状态'
      }
    };
  }

  if (!params.reason || !params.reason.trim()) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_PARAMS,
        message: '请填写质检原因'
      }
    };
  }

  const result = updateInspectionItemStatus(
    params.itemId,
    params.version,
    params.status,
    params.reason,
    inspectorId,
    inspectorName
  );

  if (!result.success) {
    if (result.error === 'INSPECTION_ITEM_NOT_FOUND') {
      return {
        success: false,
        error: {
          code: QUALITY_INSPECTION_ERROR_CODES.INSPECTION_ITEM_NOT_FOUND,
          message: '质检明细不存在'
        }
      };
    }
    if (result.error === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: {
          code: QUALITY_INSPECTION_ERROR_CODES.VERSION_CONFLICT,
          message: '该明细已被他人处理，请刷新后重试'
        }
      };
    }
  }

  return {
    success: true,
    data: result.item!
  };
}

export function batchInspectQualityItems(
  params: BatchInspectQualityRequest,
  inspectorId: number,
  inspectorName: string,
  userRole: UserRole
): ApiResponse<{ totalCount: number; successCount: number; failedCount: number; items: Array<{ itemId: number; success: boolean; error?: string; errorCode?: string }> }> {
  if (userRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限进行质检，仅客服可执行此操作'
      }
    };
  }

  if (!params.items || params.items.length === 0) {
    return {
      success: false,
      error: {
        code: QUALITY_INSPECTION_ERROR_CODES.NO_CASES_SELECTED,
        message: '请选择要质检的明细'
      }
    };
  }

  const results: Array<{ itemId: number; success: boolean; error?: string; errorCode?: string }> = [];
  let successCount = 0;
  let failedCount = 0;

  params.items.forEach(item => {
    if (!['passed', 'needsReview', 'misjudged'].includes(item.status)) {
      results.push({
        itemId: item.itemId,
        success: false,
        errorCode: QUALITY_INSPECTION_ERROR_CODES.INVALID_STATUS,
        error: '无效的质检状态'
      });
      failedCount++;
      return;
    }

    if (!item.reason || !item.reason.trim()) {
      results.push({
        itemId: item.itemId,
        success: false,
        errorCode: ERROR_CODES.INVALID_PARAMS,
        error: '请填写质检原因'
      });
      failedCount++;
      return;
    }

    const result = updateInspectionItemStatus(
      item.itemId,
      item.version,
      item.status,
      item.reason,
      inspectorId,
      inspectorName
    );

    if (!result.success) {
      failedCount++;
      if (result.error === 'INSPECTION_ITEM_NOT_FOUND') {
        results.push({
          itemId: item.itemId,
          success: false,
          errorCode: QUALITY_INSPECTION_ERROR_CODES.INSPECTION_ITEM_NOT_FOUND,
          error: '质检明细不存在'
        });
      } else if (result.error === 'VERSION_CONFLICT') {
        results.push({
          itemId: item.itemId,
          success: false,
          errorCode: QUALITY_INSPECTION_ERROR_CODES.VERSION_CONFLICT,
          error: '该明细已被他人处理，请刷新后重试'
        });
      } else {
        results.push({
          itemId: item.itemId,
          success: false,
          errorCode: result.error as any,
          error: '处理失败'
        });
      }
    } else {
      successCount++;
      results.push({
        itemId: item.itemId,
        success: true
      });
    }
  });

  return {
    success: true,
    data: {
      totalCount: params.items.length,
      successCount,
      failedCount,
      items: results
    }
  };
}

export function exportQualityInspectionCSV(
  inspectionId: number,
  userRole: UserRole,
  operatorId: number,
  operatorName: string
): ApiResponse<string> {
  if (userRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限导出质检结果'
      }
    };
  }

  const inspection = findInspectionById(inspectionId);
  if (!inspection) {
    return {
      success: false,
      error: {
        code: QUALITY_INSPECTION_ERROR_CODES.INSPECTION_NOT_FOUND,
        message: '质检抽查单不存在'
      }
    };
  }

  const items = findItemsForExport(inspectionId);

  const headers = [
    '抽查单号',
    '案件ID',
    '订单号',
    '售后类型',
    '商品名称',
    '数量',
    '退款金额',
    '责任方',
    '商家',
    '问题描述',
    '原裁决',
    '原裁决备注',
    '原裁决人',
    '原裁决时间',
    '案件状态',
    '证据链接',
    '命中规则',
    '命中原因',
    '导出记录摘要',
    '质检状态',
    '质检结论',
    '质检原因',
    '质检人',
    '质检时间',
    '是否有复核记录',
    '版本号'
  ];

  const rows = items.map(item => {
    const s = item.snapshot;
    return [
      inspection.inspectionNo,
      item.caseId,
      s.orderNo,
      CASE_TYPE_LABELS[s.caseType],
      s.productName,
      s.quantity,
      s.refundAmount.toFixed(2),
      RESPONSIBLE_PARTY_LABELS[s.responsibleParty],
      s.merchantName,
      `"${s.description.replace(/"/g, '""')}"`,
      s.originalDecision === 'refund' ? '同意退款' : '驳回',
      `"${s.originalDecisionRemark.replace(/"/g, '""')}"`,
      s.originalOperatorName,
      s.originalDecisionAt,
      QUALITY_INSPECTION_CASE_STATUS_LABELS[s.caseStatus],
      s.evidenceLinks.join('; '),
      s.hitRule || '',
      s.hitRuleReason || '',
      s.exportRecordSummary || '',
      QUALITY_INSPECTION_STATUS_LABELS[item.status],
      item.conclusion ? QUALITY_INSPECTION_STATUS_LABELS[item.conclusion] : '',
      `"${(item.reason || '').replace(/"/g, '""')}"`,
      item.inspectorName || '',
      item.inspectedAt || '',
      item.hasReviewHistory ? '是' : '否',
      item.version
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');

  addExportLog(inspectionId, operatorId, operatorName);

  return {
    success: true,
    data: csvContent
  };
}

export function importQualityInspectionItems(
  inspectionId: number,
  csvContent: string,
  operatorId: number,
  operatorName: string,
  userRole: UserRole
): ApiResponse<QualityInspectionImportResult> {
  if (userRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限导入质检清单'
      }
    };
  }

  const inspection = findInspectionById(inspectionId);
  if (!inspection) {
    return {
      success: false,
      error: {
        code: QUALITY_INSPECTION_ERROR_CODES.INSPECTION_NOT_FOUND,
        message: '质检抽查单不存在'
      }
    };
  }

  const rows = parseCSV(csvContent);
  if (rows.length === 0) {
    return {
      success: false,
      error: {
        code: QUALITY_INSPECTION_ERROR_CODES.IMPORT_FORMAT_ERROR,
        message: 'CSV文件为空或格式错误'
      }
    };
  }

  const caseIds: number[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  rows.forEach((row, index) => {
    const caseIdStr = row['案件ID'] || row['caseId'] || row['id'];
    if (!caseIdStr) {
      errors.push({ row: index + 2, error: '缺少案件ID' });
      return;
    }
    const caseId = parseInt(caseIdStr);
    if (isNaN(caseId)) {
      errors.push({ row: index + 2, error: `无效的案件ID: ${caseIdStr}` });
      return;
    }
    caseIds.push(caseId);
  });

  if (caseIds.length === 0) {
    return {
      success: false,
      error: {
        code: QUALITY_INSPECTION_ERROR_CODES.IMPORT_FORMAT_ERROR,
        message: '没有有效的案件ID'
      }
    };
  }

  const result = importInspectionItems(inspectionId, caseIds, operatorId, operatorName);

  const allErrors = [...errors, ...result.errors];

  return {
    success: true,
    data: {
      successCount: result.successCount,
      failedCount: result.failedCount + errors.length,
      errors: allErrors
    }
  };
}

export function getQualityInspectionOperationLogs(
  inspectionId?: number,
  userRole?: UserRole
): ApiResponse<any[]> {
  if (userRole && userRole !== 'cs') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限查看操作日志'
      }
    };
  }

  let logs;
  if (inspectionId) {
    logs = findOperationLogsByInspectionId(inspectionId);
  } else {
    logs = findAllOperationLogs();
  }

  return {
    success: true,
    data: logs
  };
}
