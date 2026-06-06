import { db } from '../db/index.js';
import {
  ExportRecord,
  ExportRecordListFilter
} from '../../shared/types.js';
import { createHash } from 'crypto';

function generateExportNo(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `EXPORT-${dateStr}-${random}`;
}

function computeFileHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function createExportRecord(
  startDate: string,
  endDate: string,
  operatorId: number,
  operatorName: string,
  caseCount: number,
  totalRefundAmount: number,
  csvContent: string
): ExportRecord {
  const exportNo = generateExportNo();
  const fileHash = computeFileHash(csvContent);
  const fileSize = Buffer.byteLength(csvContent, 'utf8');

  const insertStmt = db.prepare(`
    INSERT INTO export_records (
      exportNo, startDate, endDate, operatorId, operatorName,
      caseCount, totalRefundAmount, fileHash, fileSize, csvContent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insertStmt.run(
    exportNo,
    startDate,
    endDate,
    operatorId,
    operatorName,
    caseCount,
    totalRefundAmount,
    fileHash,
    fileSize,
    csvContent
  );

  const recordId = result.lastInsertRowid as number;
  return db.prepare('SELECT * FROM export_records WHERE id = ?').get(recordId) as ExportRecord;
}

export function findExportRecordById(id: number): ExportRecord | undefined {
  return db.prepare('SELECT * FROM export_records WHERE id = ?').get(id) as ExportRecord | undefined;
}

export function findExportRecords(
  filter: ExportRecordListFilter
): ExportRecord[] {
  let sql = 'SELECT * FROM export_records WHERE 1=1';
  const params: (string | number)[] = [];

  if (filter.startDate) {
    sql += ' AND createdAt >= ?';
    params.push(filter.startDate + ' 00:00:00');
  }

  if (filter.endDate) {
    sql += ' AND createdAt <= ?';
    params.push(filter.endDate + ' 23:59:59');
  }

  if (filter.operatorId) {
    sql += ' AND operatorId = ?';
    params.push(filter.operatorId);
  }

  sql += ' ORDER BY createdAt DESC, id DESC';

  return db.prepare(sql).all(...params) as ExportRecord[];
}

export function getCsOperators(): Array<{ id: number; name: string }> {
  return db.prepare(`
    SELECT id, name FROM users WHERE role = 'cs' ORDER BY name ASC
  `).all() as Array<{ id: number; name: string }>;
}
