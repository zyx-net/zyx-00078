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
`;

export const INITIAL_USERS_SQL = `
INSERT OR IGNORE INTO users (username, name, role, passwordHash) VALUES
(?, ?, 'leader', ?),
(?, ?, 'merchant', ?),
(?, ?, 'cs', ?);
`;
