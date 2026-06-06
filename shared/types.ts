export type UserRole = 'leader' | 'merchant' | 'cs';

export type CaseType = 'outOfStock' | 'damaged' | 'wrongDelivery';

export type CaseStatus =
  | 'pendingEvidence'
  | 'merchantProcessing'
  | 'csArbitration'
  | 'refundCompleted'
  | 'rejected';

export type ResponsibleParty = 'merchant' | 'logistics' | 'platform';

export type CaseAction =
  | 'submitEvidence'
  | 'merchantRespond'
  | 'csRefund'
  | 'csReject';

export interface User {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  createdAt: string;
}

export interface Case {
  id: number;
  orderNo: string;
  caseType: CaseType;
  productName: string;
  quantity: number;
  refundAmount: number;
  responsibleParty: ResponsibleParty;
  merchantId: number;
  merchantName: string;
  description: string;
  status: CaseStatus;
  version: number;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseVersion {
  id: number;
  caseId: number;
  version: number;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  action: CaseAction | 'create';
  operatorId: number;
  operatorName: string;
  operatorRole: UserRole;
  remark: string;
  createdAt: string;
}

export interface Evidence {
  id: number;
  caseId: number;
  version: number;
  uploaderId: number;
  evidenceType: 'image' | 'video' | 'other';
  evidenceUrl: string;
  remark: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: Omit<User, 'passwordHash'>;
}

export interface CreateCaseRequest {
  orderNo: string;
  caseType: CaseType;
  productName: string;
  quantity: number;
  refundAmount: number;
  responsibleParty: ResponsibleParty;
  merchantId: number;
  description: string;
}

export interface CaseActionRequest {
  action: CaseAction;
  version: number;
  remark: string;
  evidenceType?: 'image' | 'video' | 'other';
  evidenceUrl?: string;
}

export interface CaseDetail extends Case {
  versions: CaseVersion[];
  evidences: Evidence[];
}

export interface CaseListFilter {
  caseType?: CaseType;
  status?: CaseStatus;
  responsibleParty?: ResponsibleParty;
  keyword?: string;
}

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  outOfStock: '缺货',
  damaged: '破损',
  wrongDelivery: '错发'
};

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  pendingEvidence: '待举证',
  merchantProcessing: '商家处理',
  csArbitration: '客服仲裁',
  refundCompleted: '退款完成',
  rejected: '驳回'
};

export const RESPONSIBLE_PARTY_LABELS: Record<ResponsibleParty, string> = {
  merchant: '商家',
  logistics: '物流',
  platform: '平台'
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  leader: '团长',
  merchant: '商家',
  cs: '客服'
};

export const CASE_ACTION_LABELS: Record<CaseAction | 'create', string> = {
  create: '创建申请',
  submitEvidence: '提交凭证',
  merchantRespond: '商家响应',
  csRefund: '同意退款',
  csReject: '驳回申请'
};

export type BatchOperationAction = 'csRefund' | 'csReject';

export type BatchItemStatus = 'pending' | 'success' | 'failed' | 'skipped';

export interface BatchItemResult {
  caseId: number;
  orderNo: string;
  status: BatchItemStatus;
  currentVersion: number;
  refundAmount: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface BatchOperation {
  id: number;
  batchNo: string;
  action: BatchOperationAction;
  operatorId: number;
  operatorName: string;
  remark: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalRefundAmount: number;
  createdAt: string;
}

export interface BatchItem {
  id: number;
  batchId: number;
  caseId: number;
  orderNo: string;
  originalStatus: CaseStatus;
  originalVersion: number;
  refundAmount: number;
  status: BatchItemStatus;
  errorCode?: string;
  errorMessage?: string;
  newVersion?: number;
  newStatus?: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BatchDetail extends BatchOperation {
  items: BatchItem[];
}

export interface BatchPreviewRequest {
  caseIds: number[];
  action: BatchOperationAction;
}

export interface BatchPreviewItem {
  caseId: number;
  orderNo: string;
  currentStatus: CaseStatus;
  currentVersion: number;
  refundAmount: number;
  canProcess: boolean;
  reason?: string;
}

export interface BatchPreviewResponse {
  items: BatchPreviewItem[];
  totalCount: number;
  processableCount: number;
  unprocessableCount: number;
  totalRefundAmount: number;
  processableRefundAmount: number;
}

export interface BatchExecuteRequest {
  caseIds: number[];
  action: BatchOperationAction;
  remark: string;
  versions: Record<number, number>;
}

export interface BatchExecuteResponse {
  batchNo: string;
  action: BatchOperationAction;
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalRefundAmount: number;
  successRefundAmount: number;
  items: BatchItemResult[];
}

export interface BatchListFilter {
  startDate?: string;
  endDate?: string;
  action?: BatchOperationAction;
}

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_PARAMS: 'INVALID_PARAMS',
  CASE_NOT_FOUND: 'CASE_NOT_FOUND',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  MISSING_EVIDENCE: 'MISSING_EVIDENCE',
  SERVER_ERROR: 'SERVER_ERROR',
  BATCH_EMPTY: 'BATCH_EMPTY',
  BATCH_NOT_FOUND: 'BATCH_NOT_FOUND'
} as const;

export const BATCH_OPERATION_LABELS: Record<BatchOperationAction, string> = {
  csRefund: '批量同意退款',
  csReject: '批量驳回'
};

export const BATCH_ITEM_STATUS_LABELS: Record<BatchItemStatus, string> = {
  pending: '待处理',
  success: '成功',
  failed: '失败',
  skipped: '已跳过'
};
