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
  isRevoked: boolean;
  revokedAt?: string;
  revokedBy?: number;
  revokedByName?: string;
  revokeRemark?: string;
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
  revokeStatus?: BatchItemStatus;
  revokeErrorCode?: string;
  revokeErrorMessage?: string;
  revokeNewVersion?: number;
  revokeNewStatus?: CaseStatus;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BatchRevokeAudit {
  id: number;
  batchId: number;
  batchNo: string;
  operatorId: number;
  operatorName: string;
  remark: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
}

export interface BatchRevokeItem {
  id: number;
  revokeAuditId: number;
  batchItemId: number;
  caseId: number;
  orderNo: string;
  originalStatus: CaseStatus;
  originalVersion: number;
  targetStatus: CaseStatus;
  targetVersion: number;
  currentStatus: CaseStatus;
  currentVersion: number;
  refundAmount: number;
  canRevoke: boolean;
  revokeReason?: string;
  status: BatchItemStatus;
  errorCode?: string;
  errorMessage?: string;
  newVersion?: number;
  newStatus?: CaseStatus;
  createdAt: string;
}

export interface BatchRevokeDetail extends BatchRevokeAudit {
  items: BatchRevokeItem[];
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
  BATCH_NOT_FOUND: 'BATCH_NOT_FOUND',
  BATCH_ALREADY_REVOKED: 'BATCH_ALREADY_REVOKED',
  BATCH_NOT_OWNED: 'BATCH_NOT_OWNED',
  BATCH_NOT_REVOCABLE: 'BATCH_NOT_REVOCABLE',
  CASE_ALREADY_PROCESSED: 'CASE_ALREADY_PROCESSED',
  REVOKE_EMPTY: 'REVOKE_EMPTY'
} as const;

export interface BatchRevokePreviewRequest {
  batchId: number;
}

export interface BatchRevokePreviewItem {
  batchItemId: number;
  caseId: number;
  orderNo: string;
  originalStatus: CaseStatus;
  originalVersion: number;
  targetStatus: CaseStatus;
  targetVersion: number;
  currentStatus: CaseStatus;
  currentVersion: number;
  refundAmount: number;
  canRevoke: boolean;
  revokeReason?: string;
}

export interface BatchRevokePreviewResponse {
  items: BatchRevokePreviewItem[];
  totalCount: number;
  revocableCount: number;
  unrevocableCount: number;
  totalRefundAmount: number;
  revocableRefundAmount: number;
  canRevokeBatch: boolean;
  batchNotRevocableReason?: string;
}

export interface BatchRevokeExecuteRequest {
  batchId: number;
  remark: string;
  versions: Record<number, number>;
}

export interface BatchRevokeExecuteResponse {
  revokeId: number;
  batchNo: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalRefundAmount: number;
  successRefundAmount: number;
  items: BatchItemResult[];
}

export const BATCH_REVOKE_ITEM_STATUS_LABELS: Record<BatchItemStatus, string> = {
  pending: '待处理',
  success: '撤销成功',
  failed: '撤销失败',
  skipped: '已跳过'
};

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

export type RuleSuggestedAction = 'csRefund' | 'csReject' | 'review';

export const RULE_SUGGESTED_ACTION_LABELS: Record<RuleSuggestedAction, string> = {
  csRefund: '同意退款',
  csReject: '驳回申请',
  review: '人工审核'
};

export type RuleOperationType = 'create' | 'update' | 'delete' | 'enable' | 'disable' | 'hit' | 'override' | 'import' | 'export';

export const RULE_OPERATION_TYPE_LABELS: Record<RuleOperationType, string> = {
  create: '创建规则',
  update: '更新规则',
  delete: '删除规则',
  enable: '启用规则',
  disable: '禁用规则',
  hit: '规则命中',
  override: '人工覆盖',
  import: '导入规则',
  export: '导出规则'
};

export interface ArbitrationRule {
  id: number;
  caseType: CaseType | null;
  responsibleParty: ResponsibleParty | null;
  refundAmountMin: number;
  refundAmountMax: number;
  merchantId: number | null;
  priority: number;
  suggestedAction: RuleSuggestedAction;
  suggestedActionLabel: string;
  assignedCsId: number | null;
  assignedCsName: string | null;
  isEnabled: boolean;
  remark: string | null;
  version: number;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuleRequest {
  caseType: CaseType | null;
  responsibleParty: ResponsibleParty | null;
  refundAmountMin: number;
  refundAmountMax: number;
  merchantId: number | null;
  priority: number;
  suggestedAction: RuleSuggestedAction;
  assignedCsId: number | null;
  remark: string | null;
}

export interface UpdateRuleRequest extends CreateRuleRequest {
  version: number;
}

export interface RuleHitRecord {
  id: number;
  caseId: number;
  ruleId: number;
  hitReason: string;
  suggestedAction: RuleSuggestedAction;
  assignedCsId: number | null;
  assignedCsName: string | null;
  isOverridden: boolean;
  overrideRemark: string | null;
  overriddenBy: number | null;
  overriddenByName: string | null;
  overriddenAt: string | null;
  version: number;
  createdAt: string;
}

export interface RuleMatchResult {
  rule: ArbitrationRule;
  hitReason: string;
}

export interface CaseRuleInfo extends Case {
  ruleHit?: RuleHitRecord & { rule?: ArbitrationRule };
}

export interface RuleAuditLog {
  id: number;
  ruleId: number | null;
  caseId: number | null;
  operationType: RuleOperationType;
  operatorId: number;
  operatorName: string;
  operatorRole: UserRole;
  beforeChange: string | null;
  afterChange: string | null;
  remark: string | null;
  createdAt: string;
}

export interface RuleImportResult {
  successCount: number;
  failedCount: number;
  skippedCount: number;
  errors: Array<{ row: number; error: string }>;
  warnings: Array<{ row: number; warning: string }>;
}

export interface RuleListFilter {
  caseType?: CaseType;
  responsibleParty?: ResponsibleParty;
  isEnabled?: boolean;
  keyword?: string;
}

export const RULE_ERROR_CODES = {
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  PRIORITY_CONFLICT: 'PRIORITY_CONFLICT',
  INVALID_AMOUNT_RANGE: 'INVALID_AMOUNT_RANGE',
  INVALID_RULE: 'INVALID_RULE',
  DUPLICATE_PRIORITY: 'DUPLICATE_PRIORITY',
  IMPORT_FORMAT_ERROR: 'IMPORT_FORMAT_ERROR',
  NO_PERMISSION: 'NO_PERMISSION'
} as const;

export interface ExportRecord {
  id: number;
  exportNo: string;
  startDate: string;
  endDate: string;
  operatorId: number;
  operatorName: string;
  caseCount: number;
  totalRefundAmount: number;
  fileHash: string;
  fileSize: number;
  csvContent: string;
  createdAt: string;
}

export interface ExportRecordListFilter {
  startDate?: string;
  endDate?: string;
  operatorId?: number;
}

export interface CreateExportRequest {
  startDate: string;
  endDate: string;
}

export interface CreateExportResponse {
  exportId: number;
  exportNo: string;
  caseCount: number;
  totalRefundAmount: number;
  fileHash: string;
}

export const EXPORT_ERROR_CODES = {
  EXPORT_NOT_FOUND: 'EXPORT_NOT_FOUND',
  EXPORT_EMPTY: 'EXPORT_EMPTY',
  NO_PERMISSION: 'NO_PERMISSION'
} as const;

export type QualityInspectionStatus = 'pending' | 'passed' | 'needsReview' | 'misjudged';

export const QUALITY_INSPECTION_STATUS_LABELS: Record<QualityInspectionStatus, string> = {
  pending: '待质检',
  passed: '通过',
  needsReview: '需复核',
  misjudged: '误判'
};

export type QualityInspectionCaseStatus = 'refundCompleted' | 'rejected' | 'revoked';

export const QUALITY_INSPECTION_CASE_STATUS_LABELS: Record<QualityInspectionCaseStatus, string> = {
  refundCompleted: '退款完成',
  rejected: '驳回',
  revoked: '已撤销'
};

export interface QualityInspectionCaseSnapshot {
  orderNo: string;
  caseType: CaseType;
  productName: string;
  quantity: number;
  refundAmount: number;
  responsibleParty: ResponsibleParty;
  merchantName: string;
  description: string;
  originalDecision: 'refund' | 'reject';
  originalDecisionRemark: string;
  originalOperatorName: string;
  originalDecisionAt: string;
  evidenceLinks: string[];
  hitRule?: string;
  hitRuleReason?: string;
  exportRecordSummary?: string;
  caseVersion: number;
  caseStatus: QualityInspectionCaseStatus;
}

export interface QualityInspection {
  id: number;
  inspectionNo: string;
  title: string;
  startDate: string;
  endDate: string;
  caseType?: CaseType;
  responsibleParty?: ResponsibleParty;
  operatorId?: number;
  operatorName?: string;
  totalCount: number;
  passedCount: number;
  needsReviewCount: number;
  misjudgedCount: number;
  pendingCount: number;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface QualityInspectionItem {
  id: number;
  inspectionId: number;
  caseId: number;
  version: number;
  snapshot: QualityInspectionCaseSnapshot;
  status: QualityInspectionStatus;
  conclusion?: QualityInspectionStatus;
  reason?: string;
  inspectorId?: number;
  inspectorName?: string;
  inspectedAt?: string;
  hasReviewHistory: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QualityInspectionReview {
  id: number;
  inspectionItemId: number;
  version: number;
  previousStatus: QualityInspectionStatus;
  newStatus: QualityInspectionStatus;
  reason: string;
  inspectorId: number;
  inspectorName: string;
  createdAt: string;
}

export interface QualityInspectionOperationLog {
  id: number;
  inspectionId?: number;
  inspectionItemId?: number;
  operationType: 'create' | 'update' | 'inspect' | 'review' | 'import' | 'export';
  operatorId: number;
  operatorName: string;
  operatorRole: UserRole;
  detail: string;
  createdAt: string;
}

export interface QualityInspectionDetail extends QualityInspection {
  items: QualityInspectionItem[];
}

export interface QualityInspectionItemDetail extends QualityInspectionItem {
  reviews: QualityInspectionReview[];
}

export interface CreateQualityInspectionRequest {
  title: string;
  startDate: string;
  endDate: string;
  caseType?: CaseType;
  responsibleParty?: ResponsibleParty;
  operatorId?: number;
  caseIds?: number[];
}

export interface CreateQualityInspectionResponse {
  inspectionId: number;
  inspectionNo: string;
  totalCount: number;
}

export interface InspectQualityRequest {
  itemId: number;
  version: number;
  status: QualityInspectionStatus;
  reason: string;
}

export interface BatchInspectQualityRequest {
  items: Array<{
    itemId: number;
    version: number;
    status: QualityInspectionStatus;
    reason: string;
  }>;
}

export interface QualityInspectionListFilter {
  startDate?: string;
  endDate?: string;
  caseType?: CaseType;
  status?: QualityInspectionStatus;
  createdBy?: number;
}

export interface QualityInspectionImportResult {
  successCount: number;
  failedCount: number;
  errors: Array<{ row: number; error: string }>;
}

export const QUALITY_INSPECTION_ERROR_CODES = {
  INSPECTION_NOT_FOUND: 'INSPECTION_NOT_FOUND',
  INSPECTION_ITEM_NOT_FOUND: 'INSPECTION_ITEM_NOT_FOUND',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  NO_CASES_SELECTED: 'NO_CASES_SELECTED',
  INVALID_STATUS: 'INVALID_STATUS',
  CANNOT_MODIFY_HISTORY: 'CANNOT_MODIFY_HISTORY',
  IMPORT_FORMAT_ERROR: 'IMPORT_FORMAT_ERROR',
  NO_PERMISSION: 'NO_PERMISSION'
} as const;

export type CompensationCommitmentStatus = 'pendingFulfillment' | 'fulfilled' | 'overdue' | 'cancelled';
export type CompensationCommitmentType = 'cash' | 'coupon' | 'reship' | 'offline';

export const COMPENSATION_COMMITMENT_STATUS_LABELS: Record<CompensationCommitmentStatus, string> = {
  pendingFulfillment: '待履约',
  fulfilled: '已履约',
  overdue: '已逾期',
  cancelled: '已取消'
};

export const COMPENSATION_COMMITMENT_TYPE_LABELS: Record<CompensationCommitmentType, string> = {
  cash: '现金补偿',
  coupon: '优惠券',
  reship: '补寄商品',
  offline: '线下承诺'
};

export interface CompensationCommitment {
  id: number;
  commitmentNo: string;
  caseId: number;
  orderNo: string;
  merchantId: number;
  merchantName: string;
  leaderId: number;
  leaderName: string;
  type: CompensationCommitmentType;
  amount: number;
  couponName?: string;
  couponValue?: number;
  productName?: string;
  productQuantity?: number;
  offlineDescription?: string;
  dueDate: string;
  status: CompensationCommitmentStatus;
  remark?: string;
  attachment?: string;
  cancelReason?: string;
  fulfilledBy?: number;
  fulfilledByName?: string;
  fulfilledAt?: string;
  cancelledBy?: number;
  cancelledByName?: string;
  cancelledAt?: string;
  version: number;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompensationCommitmentOperationLog {
  id: number;
  commitmentId: number;
  operationType: 'create' | 'update' | 'fulfill' | 'cancel' | 'import';
  operatorId: number;
  operatorName: string;
  operatorRole: UserRole;
  beforeChange: string | null;
  afterChange: string | null;
  remark: string | null;
  createdAt: string;
}

export interface CreateCompensationCommitmentRequest {
  caseId: number;
  type: CompensationCommitmentType;
  amount: number;
  couponName?: string;
  couponValue?: number;
  productName?: string;
  productQuantity?: number;
  offlineDescription?: string;
  dueDate: string;
  remark?: string;
  attachment?: string;
}

export interface UpdateCompensationCommitmentRequest extends CreateCompensationCommitmentRequest {
  version: number;
}

export interface CancelCompensationCommitmentRequest {
  version: number;
  cancelReason: string;
}

export interface FulfillCompensationCommitmentRequest {
  version: number;
  remark?: string;
}

export interface CompensationCommitmentListFilter {
  status?: CompensationCommitmentStatus;
  type?: CompensationCommitmentType;
  caseId?: number;
  startDate?: string;
  endDate?: string;
  keyword?: string;
}

export interface CompensationCommitmentSummary {
  id: number;
  commitmentNo: string;
  caseId: number;
  orderNo: string;
  type: CompensationCommitmentType;
  amount: number;
  status: CompensationCommitmentStatus;
  dueDate: string;
  createdByName: string;
  createdAt: string;
}

export interface CompensationImportResult {
  successCount: number;
  failedCount: number;
  errors: Array<{ row: number; error: string }>;
  warnings: Array<{ row: number; warning: string }>;
}

export const COMPENSATION_ERROR_CODES = {
  COMMITMENT_NOT_FOUND: 'COMMITMENT_NOT_FOUND',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  NO_PERMISSION: 'NO_PERMISSION',
  IMPORT_FORMAT_ERROR: 'IMPORT_FORMAT_ERROR',
  INVALID_PARAMS: 'INVALID_PARAMS',
  CASE_NOT_FOUND: 'CASE_NOT_FOUND',
  NOT_OWNED: 'NOT_OWNED'
} as const;
