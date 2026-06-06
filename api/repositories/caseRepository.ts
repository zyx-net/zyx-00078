import { db } from '../db/index.js';
import {
  Case,
  CaseVersion,
  Evidence,
  CreateCaseRequest,
  CaseActionRequest,
  CaseListFilter,
  CaseDetail,
  CaseStatus,
  UserRole
} from '../../shared/types.js';

export function createCase(
  data: CreateCaseRequest,
  createdBy: number,
  createdByName: string,
  merchantName: string
): Case {
  const insertCase = db.prepare(`
    INSERT INTO cases (
      orderNo, caseType, productName, quantity, refundAmount,
      responsibleParty, merchantId, merchantName, description,
      status, version, createdBy, createdByName
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendingEvidence', 1, ?, ?)
  `);

  const result = insertCase.run(
    data.orderNo,
    data.caseType,
    data.productName,
    data.quantity,
    data.refundAmount,
    data.responsibleParty,
    data.merchantId,
    merchantName,
    data.description,
    createdBy,
    createdByName
  );

  const caseId = result.lastInsertRowid as number;

  const insertVersion = db.prepare(`
    INSERT INTO case_versions (
      caseId, version, fromStatus, toStatus, action,
      operatorId, operatorName, operatorRole, remark
    ) VALUES (?, 1, NULL, 'pendingEvidence', 'create', ?, ?, 'leader', '创建售后申请')
  `);
  insertVersion.run(caseId, createdBy, createdByName);

  return db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as Case;
}

export function findCaseById(id: number): Case | undefined {
  return db.prepare('SELECT * FROM cases WHERE id = ?').get(id) as Case | undefined;
}

export function findCaseDetailById(id: number): CaseDetail | undefined {
  const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(id) as Case | undefined;
  if (!caseInfo) return undefined;

  const versions = db.prepare('SELECT * FROM case_versions WHERE caseId = ? ORDER BY version ASC').all(id) as CaseVersion[];
  const evidences = db.prepare('SELECT * FROM evidences WHERE caseId = ? ORDER BY createdAt ASC').all(id) as Evidence[];

  return {
    ...caseInfo,
    versions,
    evidences
  };
}

export function findCases(
  filter: CaseListFilter,
  userRole: UserRole,
  userId: number
): Case[] {
  let sql = 'SELECT * FROM cases WHERE 1=1';
  const params: (string | number)[] = [];

  if (userRole === 'leader') {
    sql += ' AND createdBy = ?';
    params.push(userId);
  } else if (userRole === 'merchant') {
    sql += ' AND merchantId = ?';
    params.push(userId);
  }

  if (filter.caseType) {
    sql += ' AND caseType = ?';
    params.push(filter.caseType);
  }

  if (filter.status) {
    sql += ' AND status = ?';
    params.push(filter.status);
  }

  if (filter.responsibleParty) {
    sql += ' AND responsibleParty = ?';
    params.push(filter.responsibleParty);
  }

  if (filter.keyword) {
    sql += ' AND (orderNo LIKE ? OR productName LIKE ? OR description LIKE ?)';
    const keyword = `%${filter.keyword}%`;
    params.push(keyword, keyword, keyword);
  }

  sql += ' ORDER BY createdAt DESC, id DESC';

  return db.prepare(sql).all(...params) as Case[];
}

export function updateCaseStatus(
  caseId: number,
  currentVersion: number,
  newStatus: CaseStatus,
  actionData: CaseActionRequest,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): { success: boolean; case?: Case; error?: string } {
  const currentCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as Case | undefined;
  if (!currentCase) {
    return { success: false, error: 'CASE_NOT_FOUND' };
  }

  if (currentCase.version !== currentVersion) {
    return { success: false, error: 'VERSION_CONFLICT' };
  }

  const newVersion = currentVersion + 1;

  const updateCase = db.prepare(`
    UPDATE cases
    SET status = ?, version = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND version = ?
  `);
  const updateResult = updateCase.run(newStatus, newVersion, caseId, currentVersion);

  if (updateResult.changes === 0) {
    return { success: false, error: 'VERSION_CONFLICT' };
  }

  const insertVersion = db.prepare(`
    INSERT INTO case_versions (
      caseId, version, fromStatus, toStatus, action,
      operatorId, operatorName, operatorRole, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertVersion.run(
    caseId,
    newVersion,
    currentCase.status,
    newStatus,
    actionData.action,
    operatorId,
    operatorName,
    operatorRole,
    actionData.remark
  );

  if (actionData.evidenceUrl && actionData.evidenceType) {
    const insertEvidence = db.prepare(`
      INSERT INTO evidences (
        caseId, version, uploaderId, evidenceType, evidenceUrl, remark
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertEvidence.run(
      caseId,
      newVersion,
      operatorId,
      actionData.evidenceType,
      actionData.evidenceUrl,
      actionData.remark
    );
  }

  const updatedCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as Case;
  return { success: true, case: updatedCase };
}

export function findRefundedCases(startDate: string, endDate: string): Case[] {
  return db.prepare(`
    SELECT * FROM cases
    WHERE status = 'refundCompleted'
    AND updatedAt >= ?
    AND updatedAt <= ?
    ORDER BY updatedAt DESC
  `).all(startDate + ' 00:00:00', endDate + ' 23:59:59') as Case[];
}
