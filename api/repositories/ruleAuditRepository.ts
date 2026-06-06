import { db } from '../db/index.js';
import {
  RuleAuditLog,
  RuleOperationType,
  UserRole,
  ArbitrationRule
} from '../../shared/types.js';

export function createRuleAuditLog(
  operationType: RuleOperationType,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole,
  options: {
    ruleId?: number;
    caseId?: number;
    beforeChange?: ArbitrationRule | null;
    afterChange?: ArbitrationRule | null;
    remark?: string;
  } = {}
): RuleAuditLog {
  const beforeChangeStr = options.beforeChange ? JSON.stringify(options.beforeChange) : null;
  const afterChangeStr = options.afterChange ? JSON.stringify(options.afterChange) : null;

  const insertLog = db.prepare(`
    INSERT INTO rule_audit_logs (
      ruleId, caseId, operationType, operatorId, operatorName,
      operatorRole, beforeChange, afterChange, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insertLog.run(
    options.ruleId || null,
    options.caseId || null,
    operationType,
    operatorId,
    operatorName,
    operatorRole,
    beforeChangeStr,
    afterChangeStr,
    options.remark || null
  );

  const logId = result.lastInsertRowid as number;
  return findAuditLogById(logId)!;
}

export function findAuditLogById(id: number): RuleAuditLog | undefined {
  return db.prepare('SELECT * FROM rule_audit_logs WHERE id = ?').get(id) as RuleAuditLog | undefined;
}

export function findAuditLogsByRuleId(ruleId: number): RuleAuditLog[] {
  return db.prepare(`
    SELECT * FROM rule_audit_logs 
    WHERE ruleId = ? 
    ORDER BY createdAt DESC, id DESC
  `).all(ruleId) as RuleAuditLog[];
}

export function findAuditLogsByCaseId(caseId: number): RuleAuditLog[] {
  return db.prepare(`
    SELECT * FROM rule_audit_logs 
    WHERE caseId = ? 
    ORDER BY createdAt DESC, id DESC
  `).all(caseId) as RuleAuditLog[];
}

export function findAuditLogs(filter: {
  operationType?: RuleOperationType;
  operatorId?: number;
  startDate?: string;
  endDate?: string;
} = {}): RuleAuditLog[] {
  let sql = 'SELECT * FROM rule_audit_logs WHERE 1=1';
  const params: (string | number)[] = [];

  if (filter.operationType) {
    sql += ' AND operationType = ?';
    params.push(filter.operationType);
  }

  if (filter.operatorId) {
    sql += ' AND operatorId = ?';
    params.push(filter.operatorId);
  }

  if (filter.startDate) {
    sql += ' AND createdAt >= ?';
    params.push(filter.startDate + ' 00:00:00');
  }

  if (filter.endDate) {
    sql += ' AND createdAt <= ?';
    params.push(filter.endDate + ' 23:59:59');
  }

  sql += ' ORDER BY createdAt DESC, id DESC';

  return db.prepare(sql).all(...params) as RuleAuditLog[];
}

export function logRuleCreate(
  rule: ArbitrationRule,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): RuleAuditLog {
  return createRuleAuditLog('create', operatorId, operatorName, operatorRole, {
    ruleId: rule.id,
    afterChange: rule,
    remark: '创建仲裁规则'
  });
}

export function logRuleUpdate(
  oldRule: ArbitrationRule,
  newRule: ArbitrationRule,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): RuleAuditLog {
  return createRuleAuditLog('update', operatorId, operatorName, operatorRole, {
    ruleId: newRule.id,
    beforeChange: oldRule,
    afterChange: newRule,
    remark: '更新仲裁规则'
  });
}

export function logRuleDelete(
  rule: ArbitrationRule,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): RuleAuditLog {
  return createRuleAuditLog('delete', operatorId, operatorName, operatorRole, {
    ruleId: rule.id,
    beforeChange: rule,
    remark: '删除仲裁规则'
  });
}

export function logRuleStatusChange(
  rule: ArbitrationRule,
  isEnabled: boolean,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): RuleAuditLog {
  return createRuleAuditLog(isEnabled ? 'enable' : 'disable', operatorId, operatorName, operatorRole, {
    ruleId: rule.id,
    afterChange: rule,
    remark: isEnabled ? '启用仲裁规则' : '禁用仲裁规则'
  });
}

export function logRuleHit(
  caseId: number,
  rule: ArbitrationRule,
  hitReason: string,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): RuleAuditLog {
  return createRuleAuditLog('hit', operatorId, operatorName, operatorRole, {
    ruleId: rule.id,
    caseId,
    afterChange: rule,
    remark: `规则命中: ${hitReason}`
  });
}

export function logRuleOverride(
  caseId: number,
  rule: ArbitrationRule,
  overrideRemark: string,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): RuleAuditLog {
  return createRuleAuditLog('override', operatorId, operatorName, operatorRole, {
    ruleId: rule.id,
    caseId,
    beforeChange: rule,
    remark: `人工覆盖规则建议: ${overrideRemark}`
  });
}

export function logRuleImport(
  successCount: number,
  failedCount: number,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): RuleAuditLog {
  return createRuleAuditLog('import', operatorId, operatorName, operatorRole, {
    remark: `导入规则: 成功${successCount}条，失败${failedCount}条`
  });
}

export function logRuleExport(
  ruleCount: number,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): RuleAuditLog {
  return createRuleAuditLog('export', operatorId, operatorName, operatorRole, {
    remark: `导出规则: 共${ruleCount}条`
  });
}
