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

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_type ON cases(caseType);
CREATE INDEX IF NOT EXISTS idx_cases_merchant ON cases(merchantId);
CREATE INDEX IF NOT EXISTS idx_cases_created ON cases(createdBy);
CREATE INDEX IF NOT EXISTS idx_versions_case ON case_versions(caseId);
CREATE INDEX IF NOT EXISTS idx_evidences_case ON evidences(caseId);
`;

export const INITIAL_USERS_SQL = `
INSERT OR IGNORE INTO users (username, name, role, passwordHash) VALUES
(?, ?, 'leader', ?),
(?, ?, 'merchant', ?),
(?, ?, 'cs', ?);
`;
