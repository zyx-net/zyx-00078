export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('leader', 'merchant', 'cs')),
  passwordHash TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderNo TEXT NOT NULL,
  caseType TEXT NOT NULL CHECK(caseType IN ('outOfStock', 'damaged', 'wrongDelivery')),
  productName TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  refundAmount DECIMAL(10,2) NOT NULL,
  responsibleParty TEXT NOT NULL CHECK(responsibleParty IN ('merchant', 'logistics', 'platform')),
  merchantId INTEGER NOT NULL,
  merchantName TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendingEvidence'
    CHECK(status IN ('pendingEvidence', 'merchantProcessing', 'csArbitration', 'refundCompleted', 'rejected')),
  version INTEGER NOT NULL DEFAULT 1,
  createdBy INTEGER NOT NULL,
  createdByName TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchantId) REFERENCES users(id),
  FOREIGN KEY (createdBy) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS case_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caseId INTEGER NOT NULL,
  version INTEGER NOT NULL,
  fromStatus TEXT,
  toStatus TEXT NOT NULL,
  action TEXT NOT NULL,
  operatorId INTEGER NOT NULL,
  operatorName TEXT NOT NULL,
  operatorRole TEXT NOT NULL,
  remark TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (caseId) REFERENCES cases(id),
  FOREIGN KEY (operatorId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS evidences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caseId INTEGER NOT NULL,
  version INTEGER NOT NULL,
  uploaderId INTEGER NOT NULL,
  evidenceType TEXT NOT NULL CHECK(evidenceType IN ('image', 'video', 'other')),
  evidenceUrl TEXT NOT NULL,
  remark TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (caseId) REFERENCES cases(id),
  FOREIGN KEY (uploaderId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS batch_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batchNo TEXT UNIQUE NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('csRefund', 'csReject')),
  operatorId INTEGER NOT NULL,
  operatorName TEXT NOT NULL,
  remark TEXT,
  totalCount INTEGER NOT NULL DEFAULT 0,
  successCount INTEGER NOT NULL DEFAULT 0,
  failedCount INTEGER NOT NULL DEFAULT 0,
  skippedCount INTEGER NOT NULL DEFAULT 0,
  totalRefundAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
  isRevoked INTEGER NOT NULL DEFAULT 0,
  revokedAt DATETIME,
  revokedBy INTEGER,
  revokedByName TEXT,
  revokeRemark TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operatorId) REFERENCES users(id),
  FOREIGN KEY (revokedBy) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS batch_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batchId INTEGER NOT NULL,
  caseId INTEGER NOT NULL,
  orderNo TEXT NOT NULL,
  originalStatus TEXT NOT NULL,
  originalVersion INTEGER NOT NULL,
  refundAmount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed', 'skipped')),
  errorCode TEXT,
  errorMessage TEXT,
  newVersion INTEGER,
  newStatus TEXT,
  revokeStatus TEXT CHECK(revokeStatus IN ('pending', 'success', 'failed', 'skipped')),
  revokeErrorCode TEXT,
  revokeErrorMessage TEXT,
  revokeNewVersion INTEGER,
  revokeNewStatus TEXT,
  revokedAt DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batchId) REFERENCES batch_operations(id),
  FOREIGN KEY (caseId) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS batch_revoke_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batchId INTEGER NOT NULL,
  batchNo TEXT NOT NULL,
  operatorId INTEGER NOT NULL,
  operatorName TEXT NOT NULL,
  remark TEXT,
  totalCount INTEGER NOT NULL DEFAULT 0,
  successCount INTEGER NOT NULL DEFAULT 0,
  failedCount INTEGER NOT NULL DEFAULT 0,
  skippedCount INTEGER NOT NULL DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batchId) REFERENCES batch_operations(id),
  FOREIGN KEY (operatorId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS batch_revoke_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revokeAuditId INTEGER NOT NULL,
  batchItemId INTEGER NOT NULL,
  caseId INTEGER NOT NULL,
  orderNo TEXT NOT NULL,
  originalStatus TEXT NOT NULL,
  originalVersion INTEGER NOT NULL,
  targetStatus TEXT NOT NULL,
  targetVersion INTEGER NOT NULL,
  currentStatus TEXT NOT NULL,
  currentVersion INTEGER NOT NULL,
  refundAmount DECIMAL(10,2) NOT NULL,
  canRevoke INTEGER NOT NULL DEFAULT 0,
  revokeReason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed', 'skipped')),
  errorCode TEXT,
  errorMessage TEXT,
  newVersion INTEGER,
  newStatus TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (revokeAuditId) REFERENCES batch_revoke_audits(id),
  FOREIGN KEY (batchItemId) REFERENCES batch_items(id),
  FOREIGN KEY (caseId) REFERENCES cases(id)
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_type ON cases(caseType);
CREATE INDEX IF NOT EXISTS idx_cases_merchant ON cases(merchantId);
CREATE INDEX IF NOT EXISTS idx_cases_created ON cases(createdBy);
CREATE INDEX IF NOT EXISTS idx_versions_case ON case_versions(caseId);
CREATE INDEX IF NOT EXISTS idx_evidences_case ON evidences(caseId);
CREATE INDEX IF NOT EXISTS idx_batch_operations_created ON batch_operations(createdAt);
CREATE INDEX IF NOT EXISTS idx_batch_operations_operator ON batch_operations(operatorId);
CREATE INDEX IF NOT EXISTS idx_batch_operations_revoked ON batch_operations(isRevoked);
CREATE INDEX IF NOT EXISTS idx_batch_items_batch ON batch_items(batchId);
CREATE INDEX IF NOT EXISTS idx_batch_items_case ON batch_items(caseId);
CREATE INDEX IF NOT EXISTS idx_batch_revoke_audits_batch ON batch_revoke_audits(batchId);
CREATE INDEX IF NOT EXISTS idx_batch_revoke_audits_operator ON batch_revoke_audits(operatorId);
CREATE INDEX IF NOT EXISTS idx_batch_revoke_items_audit ON batch_revoke_items(revokeAuditId);
CREATE INDEX IF NOT EXISTS idx_batch_revoke_items_case ON batch_revoke_items(caseId);

CREATE TABLE IF NOT EXISTS arbitration_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caseType TEXT CHECK(caseType IN ('outOfStock', 'damaged', 'wrongDelivery')),
  responsibleParty TEXT CHECK(responsibleParty IN ('merchant', 'logistics', 'platform')),
  refundAmountMin DECIMAL(10,2) NOT NULL DEFAULT 0,
  refundAmountMax DECIMAL(10,2) NOT NULL DEFAULT 999999.99,
  merchantId INTEGER,
  priority INTEGER NOT NULL,
  suggestedAction TEXT NOT NULL CHECK(suggestedAction IN ('csRefund', 'csReject', 'review')),
  suggestedActionLabel TEXT NOT NULL,
  assignedCsId INTEGER,
  assignedCsName TEXT,
  isEnabled INTEGER NOT NULL DEFAULT 1,
  remark TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  createdBy INTEGER NOT NULL,
  createdByName TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (merchantId) REFERENCES users(id),
  FOREIGN KEY (assignedCsId) REFERENCES users(id),
  FOREIGN KEY (createdBy) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS rule_hit_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caseId INTEGER NOT NULL,
  ruleId INTEGER NOT NULL,
  hitReason TEXT NOT NULL,
  suggestedAction TEXT NOT NULL,
  assignedCsId INTEGER,
  assignedCsName TEXT,
  isOverridden INTEGER NOT NULL DEFAULT 0,
  overrideRemark TEXT,
  overriddenBy INTEGER,
  overriddenByName TEXT,
  overriddenAt DATETIME,
  version INTEGER NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (caseId) REFERENCES cases(id),
  FOREIGN KEY (ruleId) REFERENCES arbitration_rules(id),
  FOREIGN KEY (overriddenBy) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS rule_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruleId INTEGER,
  caseId INTEGER,
  operationType TEXT NOT NULL CHECK(operationType IN ('create', 'update', 'delete', 'enable', 'disable', 'hit', 'override', 'import', 'export')),
  operatorId INTEGER NOT NULL,
  operatorName TEXT NOT NULL,
  operatorRole TEXT NOT NULL,
  beforeChange TEXT,
  afterChange TEXT,
  remark TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ruleId) REFERENCES arbitration_rules(id),
  FOREIGN KEY (caseId) REFERENCES cases(id),
  FOREIGN KEY (operatorId) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_rules_priority ON arbitration_rules(priority);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON arbitration_rules(isEnabled);
CREATE INDEX IF NOT EXISTS idx_rules_type ON arbitration_rules(caseType);
CREATE INDEX IF NOT EXISTS idx_rules_party ON arbitration_rules(responsibleParty);
CREATE INDEX IF NOT EXISTS idx_rules_merchant ON arbitration_rules(merchantId);
CREATE INDEX IF NOT EXISTS idx_rule_hits_case ON rule_hit_records(caseId);
CREATE INDEX IF NOT EXISTS idx_rule_hits_rule ON rule_hit_records(ruleId);
CREATE INDEX IF NOT EXISTS idx_audit_rule ON rule_audit_logs(ruleId);
CREATE INDEX IF NOT EXISTS idx_audit_case ON rule_audit_logs(caseId);
CREATE INDEX IF NOT EXISTS idx_audit_operation ON rule_audit_logs(operationType);
CREATE INDEX IF NOT EXISTS idx_audit_created ON rule_audit_logs(createdAt);

CREATE TABLE IF NOT EXISTS export_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exportNo TEXT UNIQUE NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  operatorId INTEGER NOT NULL,
  operatorName TEXT NOT NULL,
  caseCount INTEGER NOT NULL DEFAULT 0,
  totalRefundAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
  fileHash TEXT NOT NULL,
  fileSize INTEGER NOT NULL DEFAULT 0,
  csvContent TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (operatorId) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_export_records_created ON export_records(createdAt);
CREATE INDEX IF NOT EXISTS idx_export_records_operator ON export_records(operatorId);

CREATE TABLE IF NOT EXISTS quality_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspectionNo TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  caseType TEXT CHECK(caseType IN ('outOfStock', 'damaged', 'wrongDelivery')),
  responsibleParty TEXT CHECK(responsibleParty IN ('merchant', 'logistics', 'platform')),
  operatorId INTEGER,
  operatorName TEXT,
  totalCount INTEGER NOT NULL DEFAULT 0,
  passedCount INTEGER NOT NULL DEFAULT 0,
  needsReviewCount INTEGER NOT NULL DEFAULT 0,
  misjudgedCount INTEGER NOT NULL DEFAULT 0,
  pendingCount INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER NOT NULL,
  createdByName TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (createdBy) REFERENCES users(id),
  FOREIGN KEY (operatorId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quality_inspection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspectionId INTEGER NOT NULL,
  caseId INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'passed', 'needsReview', 'misjudged')),
  conclusion TEXT CHECK(conclusion IN ('passed', 'needsReview', 'misjudged')),
  reason TEXT,
  inspectorId INTEGER,
  inspectorName TEXT,
  inspectedAt DATETIME,
  hasReviewHistory INTEGER NOT NULL DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inspectionId) REFERENCES quality_inspections(id),
  FOREIGN KEY (caseId) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS quality_inspection_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspectionItemId INTEGER NOT NULL,
  version INTEGER NOT NULL,
  previousStatus TEXT NOT NULL
    CHECK(previousStatus IN ('pending', 'passed', 'needsReview', 'misjudged')),
  newStatus TEXT NOT NULL
    CHECK(newStatus IN ('passed', 'needsReview', 'misjudged')),
  reason TEXT NOT NULL,
  inspectorId INTEGER NOT NULL,
  inspectorName TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inspectionItemId) REFERENCES quality_inspection_items(id),
  FOREIGN KEY (inspectorId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quality_inspection_operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspectionId INTEGER,
  inspectionItemId INTEGER,
  operationType TEXT NOT NULL
    CHECK(operationType IN ('create', 'update', 'inspect', 'review', 'import', 'export')),
  operatorId INTEGER NOT NULL,
  operatorName TEXT NOT NULL,
  operatorRole TEXT NOT NULL CHECK(operatorRole IN ('leader', 'merchant', 'cs')),
  detail TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inspectionId) REFERENCES quality_inspections(id),
  FOREIGN KEY (inspectionItemId) REFERENCES quality_inspection_items(id),
  FOREIGN KEY (operatorId) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_quality_inspections_created ON quality_inspections(createdAt);
CREATE INDEX IF NOT EXISTS idx_quality_inspections_created_by ON quality_inspections(createdBy);
CREATE INDEX IF NOT EXISTS idx_quality_inspections_case_type ON quality_inspections(caseType);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_items_inspection ON quality_inspection_items(inspectionId);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_items_case ON quality_inspection_items(caseId);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_items_status ON quality_inspection_items(status);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_reviews_item ON quality_inspection_reviews(inspectionItemId);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_logs_inspection ON quality_inspection_operation_logs(inspectionId);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_logs_item ON quality_inspection_operation_logs(inspectionItemId);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_logs_operation ON quality_inspection_operation_logs(operationType);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_logs_created ON quality_inspection_operation_logs(createdAt);
`;

export const INITIAL_USERS_SQL = `
INSERT OR IGNORE INTO users (username, name, role, passwordHash) VALUES
(?, ?, 'leader', ?),
(?, ?, 'merchant', ?),
(?, ?, 'cs', ?);
`;
