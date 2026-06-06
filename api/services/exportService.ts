import { getRefundedCases } from './caseService.js';
import { CASE_TYPE_LABELS, CASE_STATUS_LABELS, RESPONSIBLE_PARTY_LABELS } from '../../shared/types.js';

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
