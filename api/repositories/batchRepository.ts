import { db } from '../db/index.js';
import {
  BatchOperation,
  BatchItem,
  BatchDetail,
  BatchListFilter,
  BatchOperationAction,
  BatchItemStatus,
  CaseStatus,
  BatchRevokeAudit,
  BatchRevokeItem,
  BatchRevokeDetail
} from '../../shared/types.js';

function generateBatchNo(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `BATCH${dateStr}${timeStr}${random}`;
}

export function createBatchOperation(
  action: BatchOperationAction,
  operatorId: number,
  operatorName: string,
  remark: string,
  totalCount: number,
  totalRefundAmount: number
): BatchOperation {
  const batchNo = generateBatchNo();
  
  const insertBatch = db.prepare(`
    INSERT INTO batch_operations (
      batchNo, action, operatorId, operatorName, remark,
      totalCount, totalRefundAmount
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = insertBatch.run(
    batchNo,
    action,
    operatorId,
    operatorName,
    remark,
    totalCount,
    totalRefundAmount
  );
  
  const batchId = result.lastInsertRowid as number;
  
  return db.prepare('SELECT * FROM batch_operations WHERE id = ?').get(batchId) as BatchOperation;
}

export function updateBatchStats(
  batchId: number,
  successCount: number,
  failedCount: number,
  skippedCount: number
): void {
  db.prepare(`
    UPDATE batch_operations
    SET successCount = ?, failedCount = ?, skippedCount = ?
    WHERE id = ?
  `).run(successCount, failedCount, skippedCount, batchId);
}

export function addBatchItem(
  batchId: number,
  caseId: number,
  orderNo: string,
  originalStatus: CaseStatus,
  originalVersion: number,
  refundAmount: number
): BatchItem {
  const insertItem = db.prepare(`
    INSERT INTO batch_items (
      batchId, caseId, orderNo, originalStatus, originalVersion, refundAmount
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const result = insertItem.run(
    batchId,
    caseId,
    orderNo,
    originalStatus,
    originalVersion,
    refundAmount
  );
  
  const itemId = result.lastInsertRowid as number;
  
  return db.prepare('SELECT * FROM batch_items WHERE id = ?').get(itemId) as BatchItem;
}

export function updateBatchItemStatus(
  itemId: number,
  status: BatchItemStatus,
  errorCode?: string,
  errorMessage?: string,
  newVersion?: number,
  newStatus?: CaseStatus
): void {
  db.prepare(`
    UPDATE batch_items
    SET status = ?, errorCode = ?, errorMessage = ?, newVersion = ?, newStatus = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, errorCode || null, errorMessage || null, newVersion || null, newStatus || null, itemId);
}

export function findBatchById(id: number): BatchOperation | undefined {
  const batch = db.prepare('SELECT * FROM batch_operations WHERE id = ?').get(id) as (Omit<BatchOperation, 'isRevoked'> & { isRevoked: number }) | undefined;
  if (!batch) return undefined;
  return {
    ...batch,
    isRevoked: batch.isRevoked === 1
  };
}

export function findBatchByNo(batchNo: string): BatchOperation | undefined {
  const batch = db.prepare('SELECT * FROM batch_operations WHERE batchNo = ?').get(batchNo) as (Omit<BatchOperation, 'isRevoked'> & { isRevoked: number }) | undefined;
  if (!batch) return undefined;
  return {
    ...batch,
    isRevoked: batch.isRevoked === 1
  };
}

export function findBatchDetailById(id: number): BatchDetail | undefined {
  const batch = db.prepare('SELECT * FROM batch_operations WHERE id = ?').get(id) as (Omit<BatchOperation, 'isRevoked'> & { isRevoked: number }) | undefined;
  if (!batch) return undefined;
  
  const items = db.prepare('SELECT * FROM batch_items WHERE batchId = ? ORDER BY id ASC').all(id) as BatchItem[];
  
  return {
    ...batch,
    isRevoked: batch.isRevoked === 1,
    items
  };
}

export function findBatchDetailByNo(batchNo: string): BatchDetail | undefined {
  const batch = db.prepare('SELECT * FROM batch_operations WHERE batchNo = ?').get(batchNo) as (Omit<BatchOperation, 'isRevoked'> & { isRevoked: number }) | undefined;
  if (!batch) return undefined;
  
  const items = db.prepare('SELECT * FROM batch_items WHERE batchId = ? ORDER BY id ASC').all(batch.id) as BatchItem[];
  
  return {
    ...batch,
    isRevoked: batch.isRevoked === 1,
    items
  };
}

export function findBatches(filter: BatchListFilter): BatchOperation[] {
  let sql = 'SELECT * FROM batch_operations WHERE 1=1';
  const params: (string | number)[] = [];
  
  if (filter.startDate) {
    sql += ' AND createdAt >= ?';
    params.push(filter.startDate + ' 00:00:00');
  }
  
  if (filter.endDate) {
    sql += ' AND createdAt <= ?';
    params.push(filter.endDate + ' 23:59:59');
  }
  
  if (filter.action) {
    sql += ' AND action = ?';
    params.push(filter.action);
  }
  
  sql += ' ORDER BY createdAt DESC, id DESC';
  
  const batches = db.prepare(sql).all(...params) as Array<Omit<BatchOperation, 'isRevoked'> & { isRevoked: number }>;
  return batches.map(batch => ({
    ...batch,
    isRevoked: batch.isRevoked === 1
  }));
}

type BatchItemExportRaw = BatchItem & { 
  batchNo: string; 
  action: string; 
  operatorName: string; 
  remark: string; 
  isRevoked: number; 
  revokedAt?: string; 
  revokedByName?: string; 
  revokeRemark?: string 
};

export function findBatchItemsForExport(batchId: number): Array<BatchItem & { batchNo: string; action: string; operatorName: string; remark: string; isRevoked: boolean; revokedAt?: string; revokedByName?: string; revokeRemark?: string }> {
  const items = db.prepare(`
    SELECT bi.*, bo.batchNo, bo.action, bo.operatorName, bo.remark,
           bo.isRevoked, bo.revokedAt, bo.revokedByName, bo.revokeRemark
    FROM batch_items bi
    JOIN batch_operations bo ON bi.batchId = bo.id
    WHERE bi.batchId = ?
    ORDER BY bi.id ASC
  `).all(batchId) as BatchItemExportRaw[];
  
  return items.map(item => ({
    ...item,
    isRevoked: item.isRevoked === 1
  }));
}

export function updateBatchRevoked(
  batchId: number,
  revokedBy: number,
  revokedByName: string,
  revokeRemark: string
): void {
  db.prepare(`
    UPDATE batch_operations
    SET isRevoked = 1, revokedAt = CURRENT_TIMESTAMP,
        revokedBy = ?, revokedByName = ?, revokeRemark = ?
    WHERE id = ?
  `).run(revokedBy, revokedByName, revokeRemark, batchId);
}

export function updateBatchItemRevokeStatus(
  itemId: number,
  status: BatchItemStatus,
  errorCode?: string,
  errorMessage?: string,
  newVersion?: number,
  newStatus?: CaseStatus
): void {
  db.prepare(`
    UPDATE batch_items
    SET revokeStatus = ?, revokeErrorCode = ?, revokeErrorMessage = ?,
        revokeNewVersion = ?, revokeNewStatus = ?, revokedAt = CURRENT_TIMESTAMP,
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, errorCode || null, errorMessage || null, newVersion || null, newStatus || null, itemId);
}

export function createBatchRevokeAudit(
  batchId: number,
  batchNo: string,
  operatorId: number,
  operatorName: string,
  remark: string,
  totalCount: number
): BatchRevokeAudit {
  const insertAudit = db.prepare(`
    INSERT INTO batch_revoke_audits (
      batchId, batchNo, operatorId, operatorName, remark, totalCount
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const result = insertAudit.run(
    batchId,
    batchNo,
    operatorId,
    operatorName,
    remark,
    totalCount
  );
  
  const auditId = result.lastInsertRowid as number;
  
  return db.prepare('SELECT * FROM batch_revoke_audits WHERE id = ?').get(auditId) as BatchRevokeAudit;
}

export function updateBatchRevokeAuditStats(
  auditId: number,
  successCount: number,
  failedCount: number,
  skippedCount: number
): void {
  db.prepare(`
    UPDATE batch_revoke_audits
    SET successCount = ?, failedCount = ?, skippedCount = ?
    WHERE id = ?
  `).run(successCount, failedCount, skippedCount, auditId);
}

export function addBatchRevokeItem(
  revokeAuditId: number,
  batchItemId: number,
  caseId: number,
  orderNo: string,
  originalStatus: CaseStatus,
  originalVersion: number,
  targetStatus: CaseStatus,
  targetVersion: number,
  currentStatus: CaseStatus,
  currentVersion: number,
  refundAmount: number,
  canRevoke: boolean,
  revokeReason?: string
): BatchRevokeItem {
  const insertItem = db.prepare(`
    INSERT INTO batch_revoke_items (
      revokeAuditId, batchItemId, caseId, orderNo, originalStatus, originalVersion,
      targetStatus, targetVersion, currentStatus, currentVersion, refundAmount,
      canRevoke, revokeReason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = insertItem.run(
    revokeAuditId,
    batchItemId,
    caseId,
    orderNo,
    originalStatus,
    originalVersion,
    targetStatus,
    targetVersion,
    currentStatus,
    currentVersion,
    refundAmount,
    canRevoke ? 1 : 0,
    revokeReason || null
  );
  
  const itemId = result.lastInsertRowid as number;
  
  return db.prepare('SELECT * FROM batch_revoke_items WHERE id = ?').get(itemId) as BatchRevokeItem;
}

export function updateBatchRevokeItemStatus(
  itemId: number,
  status: BatchItemStatus,
  errorCode?: string,
  errorMessage?: string,
  newVersion?: number,
  newStatus?: CaseStatus
): void {
  db.prepare(`
    UPDATE batch_revoke_items
    SET status = ?, errorCode = ?, errorMessage = ?,
        newVersion = ?, newStatus = ?
    WHERE id = ?
  `).run(status, errorCode || null, errorMessage || null, newVersion || null, newStatus || null, itemId);
}

export function findBatchRevokeDetailById(auditId: number): BatchRevokeDetail | undefined {
  const audit = db.prepare('SELECT * FROM batch_revoke_audits WHERE id = ?').get(auditId) as BatchRevokeAudit | undefined;
  if (!audit) return undefined;
  
  const items = db.prepare('SELECT * FROM batch_revoke_items WHERE revokeAuditId = ? ORDER BY id ASC').all(auditId) as BatchRevokeItem[];
  
  return {
    ...audit,
    items
  };
}

export function findLatestSuccessfulBatchByCaseId(caseId: number, excludeBatchId?: number): BatchItem | undefined {
  let sql = `
    SELECT bi.*
    FROM batch_items bi
    JOIN batch_operations bo ON bi.batchId = bo.id
    WHERE bi.caseId = ?
      AND bi.status = 'success'
      AND bo.isRevoked = 0
  `;
  const params: (number | undefined)[] = [caseId];
  
  if (excludeBatchId !== undefined) {
    sql += ' AND bi.batchId != ?';
    params.push(excludeBatchId);
  }
  
  sql += ' ORDER BY bi.id DESC LIMIT 1';
  
  return db.prepare(sql).get(...params) as BatchItem | undefined;
}

export function findBatchRevokeAuditsByBatchId(batchId: number): BatchRevokeAudit[] {
  return db.prepare(`
    SELECT * FROM batch_revoke_audits
    WHERE batchId = ?
    ORDER BY id DESC
  `).all(batchId) as BatchRevokeAudit[];
}

export function findBatchRevokeItemsForExport(revokeAuditId: number): Array<BatchRevokeItem & { batchNo: string; operatorName: string; remark: string }> {
  return db.prepare(`
    SELECT bri.*, bra.batchNo, bra.operatorName, bra.remark
    FROM batch_revoke_items bri
    JOIN batch_revoke_audits bra ON bri.revokeAuditId = bra.id
    WHERE bri.revokeAuditId = ?
    ORDER BY bri.id ASC
  `).all(revokeAuditId) as Array<BatchRevokeItem & { batchNo: string; operatorName: string; remark: string }>;
}
