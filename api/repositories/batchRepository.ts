import { db } from '../db/index.js';
import {
  BatchOperation,
  BatchItem,
  BatchDetail,
  BatchListFilter,
  BatchOperationAction,
  BatchItemStatus,
  CaseStatus
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
  return db.prepare('SELECT * FROM batch_operations WHERE id = ?').get(id) as BatchOperation | undefined;
}

export function findBatchByNo(batchNo: string): BatchOperation | undefined {
  return db.prepare('SELECT * FROM batch_operations WHERE batchNo = ?').get(batchNo) as BatchOperation | undefined;
}

export function findBatchDetailById(id: number): BatchDetail | undefined {
  const batch = db.prepare('SELECT * FROM batch_operations WHERE id = ?').get(id) as BatchOperation | undefined;
  if (!batch) return undefined;
  
  const items = db.prepare('SELECT * FROM batch_items WHERE batchId = ? ORDER BY id ASC').all(id) as BatchItem[];
  
  return {
    ...batch,
    items
  };
}

export function findBatchDetailByNo(batchNo: string): BatchDetail | undefined {
  const batch = db.prepare('SELECT * FROM batch_operations WHERE batchNo = ?').get(batchNo) as BatchOperation | undefined;
  if (!batch) return undefined;
  
  const items = db.prepare('SELECT * FROM batch_items WHERE batchId = ? ORDER BY id ASC').all(batch.id) as BatchItem[];
  
  return {
    ...batch,
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
  
  return db.prepare(sql).all(...params) as BatchOperation[];
}

export function findBatchItemsForExport(batchId: number): Array<BatchItem & { batchNo: string; action: string; operatorName: string; remark: string }> {
  return db.prepare(`
    SELECT bi.*, bo.batchNo, bo.action, bo.operatorName, bo.remark
    FROM batch_items bi
    JOIN batch_operations bo ON bi.batchId = bo.id
    WHERE bi.batchId = ?
    ORDER BY bi.id ASC
  `).all(batchId) as Array<BatchItem & { batchNo: string; action: string; operatorName: string; remark: string }>;
}
