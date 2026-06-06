import { db } from '../db/index.js';
import {
  QualityInspection,
  QualityInspectionItem,
  QualityInspectionReview,
  QualityInspectionOperationLog,
  QualityInspectionCaseSnapshot,
  QualityInspectionStatus,
  QualityInspectionListFilter,
  UserRole,
  Case,
  CaseType,
  ResponsibleParty,
  QUALITY_INSPECTION_STATUS_LABELS
} from '../../shared/types.js';

function generateInspectionNo(): string {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `QI-${dateStr}-${random}`;
}

export interface CreateQualityInspectionParams {
  title: string;
  startDate: string;
  endDate: string;
  caseType?: CaseType;
  responsibleParty?: ResponsibleParty;
  operatorId?: number;
  operatorName?: string;
  createdBy: number;
  createdByName: string;
  caseIds?: number[];
}

export function findFinishedCasesForInspection(
  startDate: string,
  endDate: string,
  caseType?: CaseType,
  responsibleParty?: ResponsibleParty,
  operatorId?: number,
  caseIds?: number[]
): Case[] {
  let sql = `
    SELECT c.* FROM cases c
    WHERE 1=1
    AND (
      c.status IN ('refundCompleted', 'rejected')
      OR EXISTS (
        SELECT 1 FROM batch_operations bo
        JOIN batch_items bi ON bo.id = bi.batchId
        WHERE bi.caseId = c.id
        AND bo.isRevoked = 1
        AND bi.revokeStatus = 'success'
      )
    )
  `;
  const params: (string | number)[] = [];

  sql += ` AND (
    (c.status IN ('refundCompleted', 'rejected') AND c.updatedAt >= ? AND c.updatedAt <= ?)
    OR EXISTS (
      SELECT 1 FROM batch_operations bo
      JOIN batch_items bi ON bo.id = bi.batchId
      WHERE bi.caseId = c.id
      AND bo.isRevoked = 1
      AND bi.revokeStatus = 'success'
      AND bo.revokedAt >= ? AND bo.revokedAt <= ?
    )
  )`;
  params.push(
    startDate + ' 00:00:00', endDate + ' 23:59:59',
    startDate + ' 00:00:00', endDate + ' 23:59:59'
  );

  if (caseType) {
    sql += ' AND c.caseType = ?';
    params.push(caseType);
  }

  if (responsibleParty) {
    sql += ' AND c.responsibleParty = ?';
    params.push(responsibleParty);
  }

  if (operatorId) {
    sql += ` AND EXISTS (
      SELECT 1 FROM case_versions cv
      WHERE cv.caseId = c.id
      AND cv.action IN ('csRefund', 'csReject')
      AND cv.operatorId = ?
    )`;
    params.push(operatorId);
  }

  if (caseIds && caseIds.length > 0) {
    const placeholders = caseIds.map(() => '?').join(',');
    sql += ` AND c.id IN (${placeholders})`;
    params.push(...caseIds.map(id => id as string | number));
  }

  sql += ' ORDER BY c.updatedAt DESC, c.id DESC';

  return db.prepare(sql).all(...params) as Case[];
}

export function createQualityInspection(
  params: CreateQualityInspectionParams,
  cases: Case[]
): QualityInspection {
  const inspectionNo = generateInspectionNo();

  const insertInspection = db.prepare(`
    INSERT INTO quality_inspections (
      inspectionNo, title, startDate, endDate, caseType, responsibleParty,
      operatorId, operatorName, totalCount, pendingCount,
      createdBy, createdByName
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insertInspection.run(
    inspectionNo,
    params.title,
    params.startDate,
    params.endDate,
    params.caseType || null,
    params.responsibleParty || null,
    params.operatorId || null,
    params.operatorName || null,
    cases.length,
    cases.length,
    params.createdBy,
    params.createdByName
  );

  const inspectionId = result.lastInsertRowid as number;

  cases.forEach(caseInfo => {
    addInspectionItem(inspectionId, caseInfo);
  });

  addOperationLog({
    inspectionId,
    operationType: 'create',
    operatorId: params.createdBy,
    operatorName: params.createdByName,
    operatorRole: 'cs',
    detail: `创建质检抽查单「${params.title}」，共${cases.length}笔案件`
  });

  return findInspectionById(inspectionId)!;
}

function addInspectionItem(inspectionId: number, caseInfo: Case): number {
  const latestVersion = db.prepare(`
    SELECT * FROM case_versions
    WHERE caseId = ?
    ORDER BY version DESC
    LIMIT 1
  `).get(caseInfo.id) as any;

  const decisionVersion = db.prepare(`
    SELECT * FROM case_versions
    WHERE caseId = ? AND action IN ('csRefund', 'csReject')
    ORDER BY version DESC
    LIMIT 1
  `).get(caseInfo.id) as any;

  const evidences = db.prepare(`
    SELECT evidenceUrl FROM evidences WHERE caseId = ?
  `).all(caseInfo.id) as Array<{ evidenceUrl: string }>;

  const ruleHit = db.prepare(`
    SELECT rhr.*, ar.priority, ar.remark as ruleRemark
    FROM rule_hit_records rhr
    LEFT JOIN arbitration_rules ar ON rhr.ruleId = ar.id
    WHERE rhr.caseId = ?
    ORDER BY rhr.id DESC
    LIMIT 1
  `).get(caseInfo.id) as any;

  const exportRecord = db.prepare(`
    SELECT er.exportNo, er.caseCount, er.totalRefundAmount
    FROM export_records er
    WHERE er.csvContent LIKE ?
    LIMIT 1
  `).get(`%${caseInfo.orderNo}%`) as any;

  let caseStatus: 'refundCompleted' | 'rejected' | 'revoked' = caseInfo.status as any;
  if (caseInfo.status === 'refundCompleted') {
    const revoked = db.prepare(`
      SELECT 1 FROM batch_operations bo
      JOIN batch_items bi ON bo.id = bi.batchId
      WHERE bi.caseId = ? AND bo.isRevoked = 1 AND bi.revokeStatus = 'success'
    `).get(caseInfo.id);
    if (revoked) {
      caseStatus = 'revoked';
    }
  }

  const snapshot: QualityInspectionCaseSnapshot = {
    orderNo: caseInfo.orderNo,
    caseType: caseInfo.caseType,
    productName: caseInfo.productName,
    quantity: caseInfo.quantity,
    refundAmount: caseInfo.refundAmount,
    responsibleParty: caseInfo.responsibleParty,
    merchantName: caseInfo.merchantName,
    description: caseInfo.description,
    originalDecision: decisionVersion?.action === 'csRefund' ? 'refund' : 'reject',
    originalDecisionRemark: decisionVersion?.remark || '',
    originalOperatorName: decisionVersion?.operatorName || '',
    originalDecisionAt: decisionVersion?.createdAt || caseInfo.updatedAt,
    evidenceLinks: evidences.map(e => e.evidenceUrl),
    hitRule: ruleHit ? `优先级${ruleHit.priority}规则` : undefined,
    hitRuleReason: ruleHit?.hitReason || undefined,
    exportRecordSummary: exportRecord ? `导出单${exportRecord.exportNo}，共${exportRecord.caseCount}笔，${exportRecord.totalRefundAmount}元` : undefined,
    caseVersion: latestVersion?.version || caseInfo.version,
    caseStatus
  };

  const insertItem = db.prepare(`
    INSERT INTO quality_inspection_items (
      inspectionId, caseId, snapshot, status
    ) VALUES (?, ?, ?, 'pending')
  `);

  const result = insertItem.run(
    inspectionId,
    caseInfo.id,
    JSON.stringify(snapshot)
  );

  return result.lastInsertRowid as number;
}

export function findInspectionById(id: number): QualityInspection | undefined {
  return db.prepare('SELECT * FROM quality_inspections WHERE id = ?').get(id) as QualityInspection | undefined;
}

export function findInspectionByNo(inspectionNo: string): QualityInspection | undefined {
  return db.prepare('SELECT * FROM quality_inspections WHERE inspectionNo = ?').get(inspectionNo) as QualityInspection | undefined;
}

export function findInspections(filter: QualityInspectionListFilter): QualityInspection[] {
  let sql = 'SELECT * FROM quality_inspections WHERE 1=1';
  const params: (string | number)[] = [];

  if (filter.startDate) {
    sql += ' AND createdAt >= ?';
    params.push(filter.startDate + ' 00:00:00');
  }

  if (filter.endDate) {
    sql += ' AND createdAt <= ?';
    params.push(filter.endDate + ' 23:59:59');
  }

  if (filter.caseType) {
    sql += ' AND caseType = ?';
    params.push(filter.caseType);
  }

  if (filter.createdBy) {
    sql += ' AND createdBy = ?';
    params.push(filter.createdBy);
  }

  sql += ' ORDER BY createdAt DESC, id DESC';

  return db.prepare(sql).all(...params) as QualityInspection[];
}

export function findInspectionDetailById(id: number): (QualityInspection & { items: QualityInspectionItem[] }) | undefined {
  const inspection = findInspectionById(id);
  if (!inspection) return undefined;

  const items = findInspectionItemsByInspectionId(id);

  return {
    ...inspection,
    items
  };
}

export function findInspectionItemsByInspectionId(inspectionId: number): QualityInspectionItem[] {
  const items = db.prepare(`
    SELECT * FROM quality_inspection_items
    WHERE inspectionId = ?
    ORDER BY id ASC
  `).all(inspectionId) as Array<any>;

  return items.map(item => ({
    ...item,
    snapshot: JSON.parse(item.snapshot),
    hasReviewHistory: item.hasReviewHistory === 1
  })) as QualityInspectionItem[];
}

export function findInspectionItemById(id: number): (QualityInspectionItem & { snapshot: QualityInspectionCaseSnapshot }) | undefined {
  const item = db.prepare('SELECT * FROM quality_inspection_items WHERE id = ?').get(id) as any;
  if (!item) return undefined;

  return {
    ...item,
    snapshot: JSON.parse(item.snapshot),
    hasReviewHistory: item.hasReviewHistory === 1
  };
}

export function findInspectionItemDetailById(id: number): (QualityInspectionItem & { snapshot: QualityInspectionCaseSnapshot; reviews: QualityInspectionReview[] }) | undefined {
  const item = findInspectionItemById(id);
  if (!item) return undefined;

  const reviews = findReviewsByItemId(id);

  return {
    ...item,
    reviews
  };
}

export function findReviewsByItemId(itemId: number): QualityInspectionReview[] {
  return db.prepare(`
    SELECT * FROM quality_inspection_reviews
    WHERE inspectionItemId = ?
    ORDER BY version ASC, createdAt ASC
  `).all(itemId) as QualityInspectionReview[];
}

export function updateInspectionItemStatus(
  itemId: number,
  currentVersion: number,
  newStatus: QualityInspectionStatus,
  reason: string,
  inspectorId: number,
  inspectorName: string
): { success: boolean; item?: QualityInspectionItem; error?: string } {
  const item = db.prepare('SELECT * FROM quality_inspection_items WHERE id = ?').get(itemId) as any;
  if (!item) {
    return { success: false, error: 'INSPECTION_ITEM_NOT_FOUND' };
  }

  if (item.version !== currentVersion) {
    return { success: false, error: 'VERSION_CONFLICT' };
  }

  const newVersion = currentVersion + 1;
  const isReview = item.status !== 'pending';

  if (isReview) {
    addReviewRecord({
      inspectionItemId: itemId,
      version: newVersion,
      previousStatus: item.status,
      newStatus,
      reason,
      inspectorId,
      inspectorName
    });

    db.prepare(`
      UPDATE quality_inspection_items
      SET version = ?, status = ?, reason = ?, inspectorId = ?, inspectorName = ?,
          inspectedAt = CURRENT_TIMESTAMP, hasReviewHistory = 1,
          conclusion = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ?
    `).run(
      newVersion, newStatus, reason, inspectorId, inspectorName,
      newStatus, itemId, currentVersion
    );
  } else {
    db.prepare(`
      UPDATE quality_inspection_items
      SET version = ?, status = ?, conclusion = ?, reason = ?,
          inspectorId = ?, inspectorName = ?, inspectedAt = CURRENT_TIMESTAMP,
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ?
    `).run(
      newVersion, newStatus, newStatus, reason,
      inspectorId, inspectorName, itemId, currentVersion
    );
  }

  const updatedItem = findInspectionItemById(itemId);
  updateInspectionStats(item.inspectionId);

  addOperationLog({
    inspectionId: item.inspectionId,
    inspectionItemId: itemId,
    operationType: isReview ? 'review' : 'inspect',
    operatorId: inspectorId,
    operatorName: inspectorName,
    operatorRole: 'cs',
    detail: `${isReview ? '复核' : '质检'}案件 ${updatedItem?.snapshot.orderNo}，结果：${QUALITY_INSPECTION_STATUS_LABELS[newStatus]}，原因：${reason}`
  });

  return { success: true, item: updatedItem };
}

function addReviewRecord(params: {
  inspectionItemId: number;
  version: number;
  previousStatus: QualityInspectionStatus;
  newStatus: QualityInspectionStatus;
  reason: string;
  inspectorId: number;
  inspectorName: string;
}): number {
  const insertReview = db.prepare(`
    INSERT INTO quality_inspection_reviews (
      inspectionItemId, version, previousStatus, newStatus,
      reason, inspectorId, inspectorName
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insertReview.run(
    params.inspectionItemId,
    params.version,
    params.previousStatus,
    params.newStatus,
    params.reason,
    params.inspectorId,
    params.inspectorName
  );

  return result.lastInsertRowid as number;
}

function updateInspectionStats(inspectionId: number): void {
  const items = db.prepare(`
    SELECT status, COUNT(*) as count FROM quality_inspection_items
    WHERE inspectionId = ?
    GROUP BY status
  `).all(inspectionId) as Array<{ status: string; count: number }>;

  const stats: Record<string, number> = {
    pending: 0,
    passed: 0,
    needsReview: 0,
    misjudged: 0
  };

  items.forEach(item => {
    stats[item.status] = item.count;
  });

  db.prepare(`
    UPDATE quality_inspections
    SET pendingCount = ?, passedCount = ?, needsReviewCount = ?, misjudgedCount = ?,
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    stats.pending,
    stats.passed,
    stats.needsReview,
    stats.misjudged,
    inspectionId
  );
}

function addOperationLog(params: {
  inspectionId?: number;
  inspectionItemId?: number;
  operationType: 'create' | 'update' | 'inspect' | 'review' | 'import' | 'export';
  operatorId: number;
  operatorName: string;
  operatorRole: UserRole;
  detail: string;
}): number {
  const insertLog = db.prepare(`
    INSERT INTO quality_inspection_operation_logs (
      inspectionId, inspectionItemId, operationType,
      operatorId, operatorName, operatorRole, detail
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insertLog.run(
    params.inspectionId || null,
    params.inspectionItemId || null,
    params.operationType,
    params.operatorId,
    params.operatorName,
    params.operatorRole,
    params.detail
  );

  return result.lastInsertRowid as number;
}

export function findOperationLogsByInspectionId(inspectionId: number): QualityInspectionOperationLog[] {
  return db.prepare(`
    SELECT * FROM quality_inspection_operation_logs
    WHERE inspectionId = ?
    ORDER BY createdAt DESC, id DESC
  `).all(inspectionId) as QualityInspectionOperationLog[];
}

export function findAllOperationLogs(): QualityInspectionOperationLog[] {
  return db.prepare(`
    SELECT * FROM quality_inspection_operation_logs
    ORDER BY createdAt DESC, id DESC
  `).all() as QualityInspectionOperationLog[];
}

export function findItemsForExport(inspectionId: number): Array<QualityInspectionItem & { snapshot: QualityInspectionCaseSnapshot }> {
  return findInspectionItemsByInspectionId(inspectionId) as Array<QualityInspectionItem & { snapshot: QualityInspectionCaseSnapshot }>;
}

export function importInspectionItems(
  inspectionId: number,
  caseIds: number[],
  operatorId: number,
  operatorName: string
): { successCount: number; failedCount: number; errors: Array<{ row: number; error: string }> } {
  const errors: Array<{ row: number; error: string }> = [];
  let successCount = 0;
  let failedCount = 0;

  caseIds.forEach((caseId, index) => {
    const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as Case | undefined;
    if (!caseInfo) {
      errors.push({ row: index + 1, error: `案件ID ${caseId} 不存在` });
      failedCount++;
      return;
    }

    const existing = db.prepare(`
      SELECT 1 FROM quality_inspection_items
      WHERE inspectionId = ? AND caseId = ?
    `).get(inspectionId, caseId);
    if (existing) {
      errors.push({ row: index + 1, error: `案件 ${caseInfo.orderNo} 已在抽查单中` });
      failedCount++;
      return;
    }

    const isFinished = ['refundCompleted', 'rejected'].includes(caseInfo.status) ||
      db.prepare(`
        SELECT 1 FROM batch_operations bo
        JOIN batch_items bi ON bo.id = bi.batchId
        WHERE bi.caseId = ? AND bo.isRevoked = 1 AND bi.revokeStatus = 'success'
      `).get(caseId);

    if (!isFinished) {
      errors.push({ row: index + 1, error: `案件 ${caseInfo.orderNo} 状态不是已完成，无法加入质检` });
      failedCount++;
      return;
    }

    addInspectionItem(inspectionId, caseInfo);
    successCount++;
  });

  updateInspectionStats(inspectionId);

  const inspection = findInspectionById(inspectionId)!;
  db.prepare(`
    UPDATE quality_inspections
    SET totalCount = totalCount + ?, pendingCount = pendingCount + ?,
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(successCount, successCount, inspectionId);

  addOperationLog({
    inspectionId,
    operationType: 'import',
    operatorId,
    operatorName,
    operatorRole: 'cs',
    detail: `导入${successCount}笔案件到质检抽查单「${inspection.title}」，失败${failedCount}笔`
  });

  return { successCount, failedCount, errors };
}

export function addExportLog(
  inspectionId: number,
  operatorId: number,
  operatorName: string
): void {
  const inspection = findInspectionById(inspectionId)!;
  addOperationLog({
    inspectionId,
    operationType: 'export',
    operatorId,
    operatorName,
    operatorRole: 'cs',
    detail: `导出具质抽查单「${inspection.title}」的结果`
  });
}
