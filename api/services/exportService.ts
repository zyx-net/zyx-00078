import { getRefundedCases } from './caseService.js';
import {
  CASE_TYPE_LABELS,
  CASE_STATUS_LABELS,
  RESPONSIBLE_PARTY_LABELS,
  ExportRecord,
  ExportRecordListFilter,
  CreateExportResponse,
  EXPORT_ERROR_CODES
} from '../../shared/types.js';
import {
  createExportRecord,
  findExportRecordById,
  findExportRecords,
  getCsOperators
} from '../repositories/exportRepository.js';

export function generateRefundCSV(startDate: string, endDate: string): string {
  const result = getRefundedCases(startDate, endDate);
  if (!result.success || !result.data) {
    return '';
  }

  const headers = [
    '案件ID',
    '订单号',
    '售后类型',
    '商品名称',
    '数量',
    '退款金额(元)',
    '责任方',
    '商家',
    '问题描述',
    '状态',
    '创建人',
    '创建时间',
    '完成时间'
  ];

  const rows = result.data.map(c => [
    c.id,
    c.orderNo,
    CASE_TYPE_LABELS[c.caseType],
    c.productName,
    c.quantity,
    c.refundAmount.toFixed(2),
    RESPONSIBLE_PARTY_LABELS[c.responsibleParty],
    c.merchantName,
    c.description.replace(/"/g, '""'),
    CASE_STATUS_LABELS[c.status],
    c.createdByName,
    c.createdAt,
    c.updatedAt
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return '\ufeff' + csvContent;
}

export function createRefundExport(
  startDate: string,
  endDate: string,
  operatorId: number,
  operatorName: string
): { success: boolean; data?: CreateExportResponse; error?: { code: string; message: string } } {
  const result = getRefundedCases(startDate, endDate);
  if (!result.success || !result.data) {
    return {
      success: false,
      error: {
        code: EXPORT_ERROR_CODES.EXPORT_EMPTY,
        message: '获取退款数据失败'
      }
    };
  }

  const caseCount = result.data.length;
  const totalRefundAmount = result.data.reduce((sum, c) => sum + c.refundAmount, 0);
  const csvContent = generateRefundCSV(startDate, endDate);

  if (caseCount === 0) {
    return {
      success: false,
      error: {
        code: EXPORT_ERROR_CODES.EXPORT_EMPTY,
        message: '当前筛选条件下没有可导出的退款记录'
      }
    };
  }

  const record = createExportRecord(
    startDate,
    endDate,
    operatorId,
    operatorName,
    caseCount,
    totalRefundAmount,
    csvContent
  );

  return {
    success: true,
    data: {
      exportId: record.id,
      exportNo: record.exportNo,
      caseCount: record.caseCount,
      totalRefundAmount: record.totalRefundAmount,
      fileHash: record.fileHash
    }
  };
}

export function getExportRecord(
  id: number
): { success: boolean; data?: ExportRecord; error?: { code: string; message: string } } {
  const record = findExportRecordById(id);
  if (!record) {
    return {
      success: false,
      error: {
        code: EXPORT_ERROR_CODES.EXPORT_NOT_FOUND,
        message: '导出记录不存在'
      }
    };
  }

  return { success: true, data: record };
}

export function getExportRecordList(
  filter: ExportRecordListFilter
): { success: boolean; data?: ExportRecord[] } {
  const records = findExportRecords(filter);
  return { success: true, data: records };
}

export function getExportCSVContent(
  id: number
): { success: boolean; data?: string; filename?: string; error?: { code: string; message: string } } {
  const record = findExportRecordById(id);
  if (!record) {
    return {
      success: false,
      error: {
        code: EXPORT_ERROR_CODES.EXPORT_NOT_FOUND,
        message: '导出记录不存在'
      }
    };
  }

  const filename = `refund_export_${record.exportNo}.csv`;
  return { success: true, data: record.csvContent, filename };
}

export function getOperatorList(): { success: boolean; data?: Array<{ id: number; name: string }> } {
  const operators = getCsOperators();
  return { success: true, data: operators };
}
