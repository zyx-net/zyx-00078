import {
  createCommitment as repoCreateCommitment,
  findCommitmentById,
  findCommitments,
  findCommitmentSummaries,
  updateCommitment as repoUpdateCommitment,
  markAsFulfilled as repoMarkAsFulfilled,
  cancelCommitment as repoCancelCommitment,
  checkOverdueCommitments,
  logOperation,
  getOperationLogs,
  findCommitmentsByCaseId
} from '../repositories/compensationRepository.js';
import { findCaseById } from '../repositories/caseRepository.js';
import {
  CompensationCommitment,
  CompensationCommitmentOperationLog,
  CreateCompensationCommitmentRequest,
  UpdateCompensationCommitmentRequest,
  CancelCompensationCommitmentRequest,
  FulfillCompensationCommitmentRequest,
  CompensationCommitmentListFilter,
  UserRole,
  COMPENSATION_ERROR_CODES,
  CompensationImportResult,
  COMPENSATION_COMMITMENT_STATUS_LABELS,
  COMPENSATION_COMMITMENT_TYPE_LABELS,
  CompensationCommitmentSummary,
  CompensationCommitmentStatus,
  CompensationCommitmentType
} from '../../shared/types.js';

function errorResponse(code: string, message: string) {
  return {
    success: false as const,
    error: { code, message }
  };
}

export function createCommitment(
  data: CreateCompensationCommitmentRequest,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): {
  success: boolean;
  data?: CompensationCommitment;
  error?: { code: string; message: string };
} {
  if (operatorRole !== 'cs') {
    return errorResponse(COMPENSATION_ERROR_CODES.NO_PERMISSION, '只有客服可以创建赔付承诺');
  }

  if (!data.caseId || !data.type || data.amount === undefined || !data.dueDate) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '请填写所有必填项：案件ID、类型、金额、履约截止日期');
  }

  if (data.amount < 0) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '赔付金额不能为负数');
  }

  const caseInfo = findCaseById(data.caseId);
  if (!caseInfo) {
    return errorResponse(COMPENSATION_ERROR_CODES.CASE_NOT_FOUND, '关联的案件不存在');
  }

  if (data.type === 'coupon' && (!data.couponName || !data.couponValue || data.couponValue <= 0)) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '优惠券类型需要填写优惠券名称和面值');
  }

  if (data.type === 'reship' && (!data.productName || !data.productQuantity || data.productQuantity <= 0)) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '补寄商品类型需要填写商品名称和数量');
  }

  if (data.type === 'offline' && !data.offlineDescription?.trim()) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '线下承诺类型需要填写线下承诺描述');
  }

  const commitment = repoCreateCommitment(
    data,
    {
      orderNo: caseInfo.orderNo,
      merchantId: caseInfo.merchantId,
      merchantName: caseInfo.merchantName,
      createdBy: caseInfo.createdBy,
      createdByName: caseInfo.createdByName
    },
    operatorId,
    operatorName
  );

  logOperation(
    commitment.id,
    'create',
    operatorId,
    operatorName,
    operatorRole,
    null,
    JSON.stringify(commitment),
    '创建赔付承诺'
  );

  return { success: true, data: commitment };
}

export function getCommitmentDetail(
  id: number,
  userRole: UserRole,
  userId: number
): {
  success: boolean;
  data?: CompensationCommitment & { operationLogs: CompensationCommitmentOperationLog[] };
  error?: { code: string; message: string };
} {
  const commitment = findCommitmentById(id);
  if (!commitment) {
    return errorResponse(COMPENSATION_ERROR_CODES.COMMITMENT_NOT_FOUND, '承诺单不存在');
  }

  if (userRole === 'leader' && commitment.leaderId !== userId) {
    return errorResponse(COMPENSATION_ERROR_CODES.NOT_OWNED, '无权查看此承诺单');
  }

  if (userRole === 'merchant' && commitment.merchantId !== userId) {
    return errorResponse(COMPENSATION_ERROR_CODES.NOT_OWNED, '无权查看此承诺单');
  }

  const operationLogs = getOperationLogs(id);

  return {
    success: true,
    data: {
      ...commitment,
      operationLogs
    }
  };
}

export function getCommitmentList(
  filter: CompensationCommitmentListFilter,
  userRole: UserRole,
  userId: number
): {
  success: boolean;
  data?: CompensationCommitment[] | CompensationCommitmentSummary[];
} {
  checkOverdueCommitments();

  if (userRole === 'cs') {
    return {
      success: true,
      data: findCommitments(filter, userRole, userId)
    };
  } else {
    return {
      success: true,
      data: findCommitmentSummaries(filter, userRole, userId)
    };
  }
}

export function getCommitmentsByCase(
  caseId: number,
  userRole: UserRole,
  userId: number
): {
  success: boolean;
  data?: CompensationCommitment[];
  error?: { code: string; message: string };
} {
  const caseInfo = findCaseById(caseId);
  if (!caseInfo) {
    return errorResponse(COMPENSATION_ERROR_CODES.CASE_NOT_FOUND, '案件不存在');
  }

  if (userRole === 'leader' && caseInfo.createdBy !== userId) {
    return errorResponse(COMPENSATION_ERROR_CODES.NOT_OWNED, '无权查看此案件的承诺单');
  }

  if (userRole === 'merchant' && caseInfo.merchantId !== userId) {
    return errorResponse(COMPENSATION_ERROR_CODES.NOT_OWNED, '无权查看此案件的承诺单');
  }

  checkOverdueCommitments();
  return { success: true, data: findCommitmentsByCaseId(caseId) };
}

export function updateCommitment(
  id: number,
  data: UpdateCompensationCommitmentRequest,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): {
  success: boolean;
  data?: CompensationCommitment;
  error?: { code: string; message: string };
} {
  if (operatorRole !== 'cs') {
    return errorResponse(COMPENSATION_ERROR_CODES.NO_PERMISSION, '只有客服可以编辑赔付承诺');
  }

  if (data.version === undefined) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '缺少版本号信息');
  }

  if (data.amount < 0) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '赔付金额不能为负数');
  }

  if (data.type === 'coupon' && (!data.couponName || !data.couponValue || data.couponValue <= 0)) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '优惠券类型需要填写优惠券名称和面值');
  }

  if (data.type === 'reship' && (!data.productName || !data.productQuantity || data.productQuantity <= 0)) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '补寄商品类型需要填写商品名称和数量');
  }

  if (data.type === 'offline' && !data.offlineDescription?.trim()) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '线下承诺类型需要填写线下承诺描述');
  }

  const current = findCommitmentById(id);
  if (!current) {
    return errorResponse(COMPENSATION_ERROR_CODES.COMMITMENT_NOT_FOUND, '承诺单不存在');
  }

  const beforeChange = JSON.stringify(current);

  const result = repoUpdateCommitment(id, data.version, data, operatorId, operatorName);

  if (!result.success) {
    if (result.error === 'COMMITMENT_NOT_FOUND') {
      return errorResponse(COMPENSATION_ERROR_CODES.COMMITMENT_NOT_FOUND, '承诺单不存在');
    }
    if (result.error === 'VERSION_CONFLICT') {
      return errorResponse(COMPENSATION_ERROR_CODES.VERSION_CONFLICT, '承诺单已被他人修改，请刷新后重试');
    }
    if (result.error === 'INVALID_STATUS_TRANSITION') {
      return errorResponse(COMPENSATION_ERROR_CODES.INVALID_STATUS_TRANSITION, '只有待履约状态的承诺单可以编辑');
    }
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '更新失败');
  }

  logOperation(
    id,
    'update',
    operatorId,
    operatorName,
    operatorRole,
    beforeChange,
    JSON.stringify(result.commitment),
    '编辑赔付承诺'
  );

  return { success: true, data: result.commitment };
}

export function fulfillCommitment(
  id: number,
  data: FulfillCompensationCommitmentRequest,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): {
  success: boolean;
  data?: CompensationCommitment;
  error?: { code: string; message: string };
} {
  if (operatorRole !== 'cs') {
    return errorResponse(COMPENSATION_ERROR_CODES.NO_PERMISSION, '只有客服可以标记履约');
  }

  if (data.version === undefined) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '缺少版本号信息');
  }

  const current = findCommitmentById(id);
  if (!current) {
    return errorResponse(COMPENSATION_ERROR_CODES.COMMITMENT_NOT_FOUND, '承诺单不存在');
  }

  const beforeChange = JSON.stringify(current);

  const result = repoMarkAsFulfilled(id, data.version, operatorId, operatorName, data.remark);

  if (!result.success) {
    if (result.error === 'COMMITMENT_NOT_FOUND') {
      return errorResponse(COMPENSATION_ERROR_CODES.COMMITMENT_NOT_FOUND, '承诺单不存在');
    }
    if (result.error === 'VERSION_CONFLICT') {
      return errorResponse(COMPENSATION_ERROR_CODES.VERSION_CONFLICT, '承诺单已被他人修改，请刷新后重试');
    }
    if (result.error === 'INVALID_STATUS_TRANSITION') {
      return errorResponse(COMPENSATION_ERROR_CODES.INVALID_STATUS_TRANSITION, '只有待履约或已逾期状态的承诺单可以标记履约');
    }
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '标记履约失败');
  }

  logOperation(
    id,
    'fulfill',
    operatorId,
    operatorName,
    operatorRole,
    beforeChange,
    JSON.stringify(result.commitment),
    data.remark || '标记履约'
  );

  return { success: true, data: result.commitment };
}

export function cancelCommitment(
  id: number,
  data: CancelCompensationCommitmentRequest,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): {
  success: boolean;
  data?: CompensationCommitment;
  error?: { code: string; message: string };
} {
  if (operatorRole !== 'cs') {
    return errorResponse(COMPENSATION_ERROR_CODES.NO_PERMISSION, '只有客服可以取消赔付承诺');
  }

  if (data.version === undefined || !data.cancelReason?.trim()) {
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '版本号和取消原因不能为空');
  }

  const current = findCommitmentById(id);
  if (!current) {
    return errorResponse(COMPENSATION_ERROR_CODES.COMMITMENT_NOT_FOUND, '承诺单不存在');
  }

  const beforeChange = JSON.stringify(current);

  const result = repoCancelCommitment(id, data.version, operatorId, operatorName, data.cancelReason);

  if (!result.success) {
    if (result.error === 'COMMITMENT_NOT_FOUND') {
      return errorResponse(COMPENSATION_ERROR_CODES.COMMITMENT_NOT_FOUND, '承诺单不存在');
    }
    if (result.error === 'VERSION_CONFLICT') {
      return errorResponse(COMPENSATION_ERROR_CODES.VERSION_CONFLICT, '承诺单已被他人修改，请刷新后重试');
    }
    if (result.error === 'INVALID_STATUS_TRANSITION') {
      return errorResponse(COMPENSATION_ERROR_CODES.INVALID_STATUS_TRANSITION, '只有待履约或已逾期状态的承诺单可以取消');
    }
    return errorResponse(COMPENSATION_ERROR_CODES.INVALID_PARAMS, '取消失败');
  }

  logOperation(
    id,
    'cancel',
    operatorId,
    operatorName,
    operatorRole,
    beforeChange,
    JSON.stringify(result.commitment),
    data.cancelReason
  );

  return { success: true, data: result.commitment };
}

export function generateCommitmentCSV(
  filter: CompensationCommitmentListFilter,
  userRole: UserRole,
  userId: number
): string {
  checkOverdueCommitments();
  const result = findCommitments(filter, userRole, userId);

  const headers = [
    '承诺单号',
    '案件ID',
    '订单号',
    '商家',
    '团长',
    '承诺类型',
    '赔付金额(元)',
    '优惠券名称',
    '优惠券面值',
    '补寄商品',
    '补寄数量',
    '线下承诺描述',
    '履约截止日期',
    '状态',
    '备注',
    '附件',
    '取消原因',
    '履约人',
    '履约时间',
    '取消人',
    '取消时间',
    '创建人',
    '创建时间',
    '更新时间'
  ];

  const rows = result.map(c => [
    c.commitmentNo,
    c.caseId,
    c.orderNo,
    c.merchantName,
    c.leaderName,
    COMPENSATION_COMMITMENT_TYPE_LABELS[c.type],
    c.amount.toFixed(2),
    c.couponName || '',
    c.couponValue ? c.couponValue.toFixed(2) : '',
    c.productName || '',
    c.productQuantity || '',
    c.offlineDescription || '',
    c.dueDate,
    COMPENSATION_COMMITMENT_STATUS_LABELS[c.status],
    c.remark || '',
    c.attachment || '',
    c.cancelReason || '',
    c.fulfilledByName || '',
    c.fulfilledAt || '',
    c.cancelledByName || '',
    c.cancelledAt || '',
    c.createdByName,
    c.createdAt,
    c.updatedAt
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return '\ufeff' + csvContent;
}

export function importCommitmentsCSV(
  csvContent: string,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): {
  success: boolean;
  data?: CompensationImportResult;
  error?: { code: string; message: string };
} {
  if (operatorRole !== 'cs') {
    return errorResponse(COMPENSATION_ERROR_CODES.NO_PERMISSION, '只有客服可以批量导入承诺单');
  }

  const lines = csvContent.replace(/^\ufeff/, '').trim().split('\n');
  if (lines.length < 2) {
    return errorResponse(COMPENSATION_ERROR_CODES.IMPORT_FORMAT_ERROR, 'CSV文件内容为空或格式不正确');
  }

  const headerLine = lines[0];
  const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));

  const expectedHeaders = [
    '案件ID', '承诺类型', '赔付金额(元)', '优惠券名称', '优惠券面值',
    '补寄商品', '补寄数量', '线下承诺描述', '履约截止日期', '备注', '附件'
  ];

  const headerMap: Record<string, number> = {};
  headers.forEach((h, i) => {
    headerMap[h] = i;
  });

  for (const h of ['案件ID', '承诺类型', '赔付金额(元)', '履约截止日期']) {
    if (headerMap[h] === undefined) {
      return errorResponse(COMPENSATION_ERROR_CODES.IMPORT_FORMAT_ERROR, `CSV缺少必填列：${h}`);
    }
  }

  const typeLabelToValue: Record<string, CompensationCommitmentType> = {
    '现金补偿': 'cash',
    '优惠券': 'coupon',
    '补寄商品': 'reship',
    '线下承诺': 'offline'
  };

  const result: CompensationImportResult = {
    successCount: 0,
    failedCount: 0,
    errors: [],
    warnings: []
  };

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    try {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));

      const caseIdStr = values[headerMap['案件ID']];
      const typeLabel = values[headerMap['承诺类型']];
      const amountStr = values[headerMap['赔付金额(元)']];
      const dueDate = values[headerMap['履约截止日期']];
      const couponName = values[headerMap['优惠券名称']] || '';
      const couponValueStr = values[headerMap['优惠券面值']] || '';
      const productName = values[headerMap['补寄商品']] || '';
      const productQuantityStr = values[headerMap['补寄数量']] || '';
      const offlineDescription = values[headerMap['线下承诺描述']] || '';
      const remark = values[headerMap['备注']] || '';
      const attachment = values[headerMap['附件']] || '';

      if (!caseIdStr || !typeLabel || !amountStr || !dueDate) {
        result.errors.push({ row: rowNum, error: '必填项不能为空' });
        result.failedCount++;
        continue;
      }

      const caseId = parseInt(caseIdStr);
      if (isNaN(caseId)) {
        result.errors.push({ row: rowNum, error: '案件ID必须是数字' });
        result.failedCount++;
        continue;
      }

      const type = typeLabelToValue[typeLabel];
      if (!type) {
        result.errors.push({ row: rowNum, error: `无效的承诺类型：${typeLabel}` });
        result.failedCount++;
        continue;
      }

      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount < 0) {
        result.errors.push({ row: rowNum, error: '赔付金额必须是非负数' });
        result.failedCount++;
        continue;
      }

      const couponValue = couponValueStr ? parseFloat(couponValueStr) : undefined;
      const productQuantity = productQuantityStr ? parseInt(productQuantityStr) : undefined;

      const createData: CreateCompensationCommitmentRequest = {
        caseId,
        type,
        amount,
        dueDate,
        couponName: couponName || undefined,
        couponValue: couponValue || undefined,
        productName: productName || undefined,
        productQuantity: productQuantity || undefined,
        offlineDescription: offlineDescription || undefined,
        remark: remark || undefined,
        attachment: attachment || undefined
      };

      const createResult = createCommitment(createData, operatorId, operatorName, operatorRole);

      if (createResult.success && createResult.data) {
        result.successCount++;
        logOperation(
          createResult.data.id,
          'import',
          operatorId,
          operatorName,
          operatorRole,
          null,
          JSON.stringify(createResult.data),
          `CSV导入第${rowNum}行`
        );
      } else {
        result.errors.push({ row: rowNum, error: createResult.error?.message || '创建失败' });
        result.failedCount++;
      }
    } catch (e) {
      result.errors.push({ row: rowNum, error: `解析错误：${(e as Error).message}` });
      result.failedCount++;
    }
  }

  return { success: true, data: result };
}

export function getCommitmentLogs(
  id: number,
  userRole: UserRole,
  userId: number
): {
  success: boolean;
  data?: CompensationCommitmentOperationLog[];
  error?: { code: string; message: string };
} {
  const commitment = findCommitmentById(id);
  if (!commitment) {
    return errorResponse(COMPENSATION_ERROR_CODES.COMMITMENT_NOT_FOUND, '承诺单不存在');
  }

  if (userRole === 'leader' && commitment.leaderId !== userId) {
    return errorResponse(COMPENSATION_ERROR_CODES.NOT_OWNED, '无权查看此承诺单的操作日志');
  }

  if (userRole === 'merchant' && commitment.merchantId !== userId) {
    return errorResponse(COMPENSATION_ERROR_CODES.NOT_OWNED, '无权查看此承诺单的操作日志');
  }

  return { success: true, data: getOperationLogs(id) };
}
