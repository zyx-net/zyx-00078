import { db } from '../db/index.js';
import {
  CompensationCommitment,
  CompensationCommitmentOperationLog,
  CreateCompensationCommitmentRequest,
  UpdateCompensationCommitmentRequest,
  CompensationCommitmentListFilter,
  CompensationCommitmentStatus,
  CompensationCommitmentType,
  UserRole,
  CompensationCommitmentSummary
} from '../../shared/types.js';

function generateCommitmentNo(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `COMP-${dateStr}-`;

  const result = db.prepare(`
    SELECT commitmentNo FROM compensation_commitments
    WHERE commitmentNo LIKE ?
    ORDER BY commitmentNo DESC
    LIMIT 1
  `).get(prefix + '%') as { commitmentNo: string } | undefined;

  let seq = 1;
  if (result) {
    const match = result.commitmentNo.match(/-(\d{4})$/);
    if (match) {
      seq = parseInt(match[1]) + 1;
    }
  }

  return prefix + String(seq).padStart(4, '0');
}

export function createCommitment(
  data: CreateCompensationCommitmentRequest,
  caseInfo: { orderNo: string; merchantId: number; merchantName: string; createdBy: number; createdByName: string },
  createdBy: number,
  createdByName: string
): CompensationCommitment {
  const commitmentNo = generateCommitmentNo();

  const insertCommitment = db.prepare(`
    INSERT INTO compensation_commitments (
      commitmentNo, caseId, orderNo, merchantId, merchantName,
      leaderId, leaderName, type, amount, couponName, couponValue,
      productName, productQuantity, offlineDescription, dueDate,
      status, remark, attachment, version, createdBy, createdByName
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const result = insertCommitment.run(
    commitmentNo,
    data.caseId,
    caseInfo.orderNo,
    caseInfo.merchantId,
    caseInfo.merchantName,
    caseInfo.createdBy,
    caseInfo.createdByName,
    data.type,
    data.amount,
    data.couponName || null,
    data.couponValue || null,
    data.productName || null,
    data.productQuantity || null,
    data.offlineDescription || null,
    data.dueDate,
    'pendingFulfillment',
    data.remark || null,
    data.attachment || null,
    createdBy,
    createdByName
  );

  const id = result.lastInsertRowid as number;

  return db.prepare('SELECT * FROM compensation_commitments WHERE id = ?').get(id) as CompensationCommitment;
}

export function findCommitmentById(id: number): CompensationCommitment | undefined {
  return db.prepare('SELECT * FROM compensation_commitments WHERE id = ?').get(id) as CompensationCommitment | undefined;
}

export function findCommitments(
  filter: CompensationCommitmentListFilter,
  userRole: UserRole,
  userId: number
): CompensationCommitment[] {
  let sql = 'SELECT * FROM compensation_commitments WHERE 1=1';
  const params: (string | number)[] = [];

  if (userRole === 'leader') {
    sql += ' AND leaderId = ?';
    params.push(userId);
  } else if (userRole === 'merchant') {
    sql += ' AND merchantId = ?';
    params.push(userId);
  }

  if (filter.status) {
    sql += ' AND status = ?';
    params.push(filter.status);
  }

  if (filter.type) {
    sql += ' AND type = ?';
    params.push(filter.type);
  }

  if (filter.caseId) {
    sql += ' AND caseId = ?';
    params.push(filter.caseId);
  }

  if (filter.startDate) {
    sql += ' AND createdAt >= ?';
    params.push(filter.startDate + ' 00:00:00');
  }

  if (filter.endDate) {
    sql += ' AND createdAt <= ?';
    params.push(filter.endDate + ' 23:59:59');
  }

  if (filter.keyword) {
    sql += ' AND (commitmentNo LIKE ? OR orderNo LIKE ? OR remark LIKE ?)';
    const keyword = `%${filter.keyword}%`;
    params.push(keyword, keyword, keyword);
  }

  sql += ' ORDER BY createdAt DESC, id DESC';

  return db.prepare(sql).all(...params) as CompensationCommitment[];
}

export function findCommitmentSummaries(
  filter: CompensationCommitmentListFilter,
  userRole: UserRole,
  userId: number
): CompensationCommitmentSummary[] {
  let sql = `
    SELECT id, commitmentNo, caseId, orderNo, type, amount, status, dueDate, createdByName, createdAt
    FROM compensation_commitments WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (userRole === 'leader') {
    sql += ' AND leaderId = ?';
    params.push(userId);
  } else if (userRole === 'merchant') {
    sql += ' AND merchantId = ?';
    params.push(userId);
  }

  if (filter.status) {
    sql += ' AND status = ?';
    params.push(filter.status);
  }

  if (filter.type) {
    sql += ' AND type = ?';
    params.push(filter.type);
  }

  if (filter.caseId) {
    sql += ' AND caseId = ?';
    params.push(filter.caseId);
  }

  if (filter.startDate) {
    sql += ' AND createdAt >= ?';
    params.push(filter.startDate + ' 00:00:00');
  }

  if (filter.endDate) {
    sql += ' AND createdAt <= ?';
    params.push(filter.endDate + ' 23:59:59');
  }

  if (filter.keyword) {
    sql += ' AND (commitmentNo LIKE ? OR orderNo LIKE ? OR remark LIKE ?)';
    const keyword = `%${filter.keyword}%`;
    params.push(keyword, keyword, keyword);
  }

  sql += ' ORDER BY createdAt DESC, id DESC';

  return db.prepare(sql).all(...params) as CompensationCommitmentSummary[];
}

export function updateCommitment(
  id: number,
  currentVersion: number,
  data: UpdateCompensationCommitmentRequest,
  operatorId: number,
  operatorName: string
): { success: boolean; commitment?: CompensationCommitment; error?: string } {
  const current = db.prepare('SELECT * FROM compensation_commitments WHERE id = ?').get(id) as CompensationCommitment | undefined;
  if (!current) {
    return { success: false, error: 'COMMITMENT_NOT_FOUND' };
  }

  if (current.version !== currentVersion) {
    return { success: false, error: 'VERSION_CONFLICT' };
  }

  if (current.status !== 'pendingFulfillment') {
    return { success: false, error: 'INVALID_STATUS_TRANSITION' };
  }

  const newVersion = currentVersion + 1;

  const updateStmt = db.prepare(`
    UPDATE compensation_commitments
    SET type = ?, amount = ?, couponName = ?, couponValue = ?, productName = ?,
        productQuantity = ?, offlineDescription = ?, dueDate = ?, remark = ?,
        attachment = ?, version = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND version = ?
  `);

  const result = updateStmt.run(
    data.type,
    data.amount,
    data.couponName || null,
    data.couponValue || null,
    data.productName || null,
    data.productQuantity || null,
    data.offlineDescription || null,
    data.dueDate,
    data.remark || null,
    data.attachment || null,
    newVersion,
    id,
    currentVersion
  );

  if (result.changes === 0) {
    return { success: false, error: 'VERSION_CONFLICT' };
  }

  const updated = db.prepare('SELECT * FROM compensation_commitments WHERE id = ?').get(id) as CompensationCommitment;
  return { success: true, commitment: updated };
}

export function markAsFulfilled(
  id: number,
  currentVersion: number,
  operatorId: number,
  operatorName: string,
  remark?: string
): { success: boolean; commitment?: CompensationCommitment; error?: string } {
  const current = db.prepare('SELECT * FROM compensation_commitments WHERE id = ?').get(id) as CompensationCommitment | undefined;
  if (!current) {
    return { success: false, error: 'COMMITMENT_NOT_FOUND' };
  }

  if (current.version !== currentVersion) {
    return { success: false, error: 'VERSION_CONFLICT' };
  }

  if (current.status !== 'pendingFulfillment' && current.status !== 'overdue') {
    return { success: false, error: 'INVALID_STATUS_TRANSITION' };
  }

  const newVersion = currentVersion + 1;

  const updateStmt = db.prepare(`
    UPDATE compensation_commitments
    SET status = 'fulfilled', fulfilledBy = ?, fulfilledByName = ?, fulfilledAt = CURRENT_TIMESTAMP,
        version = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND version = ?
  `);

  const result = updateStmt.run(operatorId, operatorName, newVersion, id, currentVersion);

  if (result.changes === 0) {
    return { success: false, error: 'VERSION_CONFLICT' };
  }

  const updated = db.prepare('SELECT * FROM compensation_commitments WHERE id = ?').get(id) as CompensationCommitment;
  return { success: true, commitment: updated };
}

export function cancelCommitment(
  id: number,
  currentVersion: number,
  operatorId: number,
  operatorName: string,
  cancelReason: string
): { success: boolean; commitment?: CompensationCommitment; error?: string } {
  const current = db.prepare('SELECT * FROM compensation_commitments WHERE id = ?').get(id) as CompensationCommitment | undefined;
  if (!current) {
    return { success: false, error: 'COMMITMENT_NOT_FOUND' };
  }

  if (current.version !== currentVersion) {
    return { success: false, error: 'VERSION_CONFLICT' };
  }

  if (current.status !== 'pendingFulfillment' && current.status !== 'overdue') {
    return { success: false, error: 'INVALID_STATUS_TRANSITION' };
  }

  const newVersion = currentVersion + 1;

  const updateStmt = db.prepare(`
    UPDATE compensation_commitments
    SET status = 'cancelled', cancelledBy = ?, cancelledByName = ?, cancelledAt = CURRENT_TIMESTAMP,
        cancelReason = ?, version = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND version = ?
  `);

  const result = updateStmt.run(operatorId, operatorName, cancelReason, newVersion, id, currentVersion);

  if (result.changes === 0) {
    return { success: false, error: 'VERSION_CONFLICT' };
  }

  const updated = db.prepare('SELECT * FROM compensation_commitments WHERE id = ?').get(id) as CompensationCommitment;
  return { success: true, commitment: updated };
}

export function checkOverdueCommitments(): number {
  const today = new Date().toISOString().slice(0, 10);
  const result = db.prepare(`
    UPDATE compensation_commitments
    SET status = 'overdue', updatedAt = CURRENT_TIMESTAMP
    WHERE status = 'pendingFulfillment' AND dueDate < ?
  `).run(today);
  return result.changes || 0;
}

export function logOperation(
  commitmentId: number,
  operationType: 'create' | 'update' | 'fulfill' | 'cancel' | 'import',
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole,
  beforeChange: string | null,
  afterChange: string | null,
  remark: string | null
): void {
  db.prepare(`
    INSERT INTO compensation_commitment_operation_logs (
      commitmentId, operationType, operatorId, operatorName, operatorRole,
      beforeChange, afterChange, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(commitmentId, operationType, operatorId, operatorName, operatorRole, beforeChange, afterChange, remark);
}

export function getOperationLogs(commitmentId: number): CompensationCommitmentOperationLog[] {
  return db.prepare(`
    SELECT * FROM compensation_commitment_operation_logs
    WHERE commitmentId = ?
    ORDER BY createdAt DESC, id DESC
  `).all(commitmentId) as CompensationCommitmentOperationLog[];
}

export function findCommitmentsByCaseId(caseId: number): CompensationCommitment[] {
  return db.prepare(`
    SELECT * FROM compensation_commitments
    WHERE caseId = ?
    ORDER BY createdAt DESC, id DESC
  `).all(caseId) as CompensationCommitment[];
}
