import { db } from '../db/index.js';
import {
  ArbitrationRule,
  CreateRuleRequest,
  UpdateRuleRequest,
  RuleHitRecord,
  RuleMatchResult,
  Case,
  RuleListFilter,
  RuleImportResult,
  RULE_SUGGESTED_ACTION_LABELS,
  CASE_TYPE_LABELS,
  RESPONSIBLE_PARTY_LABELS,
  CaseType,
  ResponsibleParty
} from '../../shared/types.js';

function transformRule(raw: any): ArbitrationRule {
  return {
    ...raw,
    isEnabled: raw.isEnabled === 1
  };
}

function transformHitRecord(raw: any): RuleHitRecord {
  return {
    ...raw,
    isOverridden: raw.isOverridden === 1
  };
}

export function createRule(
  data: CreateRuleRequest,
  createdBy: number,
  createdByName: string
): ArbitrationRule {
  const insertRule = db.prepare(`
    INSERT INTO arbitration_rules (
      caseType, responsibleParty, refundAmountMin, refundAmountMax,
      merchantId, priority, suggestedAction, suggestedActionLabel,
      assignedCsId, assignedCsName, remark, version, createdBy, createdByName
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const suggestedActionLabel = RULE_SUGGESTED_ACTION_LABELS[data.suggestedAction];
  const assignedCsName = data.assignedCsId ? 
    (db.prepare('SELECT name FROM users WHERE id = ?').get(data.assignedCsId) as { name: string } | undefined)?.name : 
    null;

  const result = insertRule.run(
    data.caseType,
    data.responsibleParty,
    data.refundAmountMin,
    data.refundAmountMax,
    data.merchantId,
    data.priority,
    data.suggestedAction,
    suggestedActionLabel,
    data.assignedCsId,
    assignedCsName,
    data.remark,
    createdBy,
    createdByName
  );

  const ruleId = result.lastInsertRowid as number;
  return findRuleById(ruleId)!;
}

export function updateRule(
  id: number,
  data: UpdateRuleRequest
): { success: boolean; rule?: ArbitrationRule; error?: string } {
  const currentRule = db.prepare('SELECT * FROM arbitration_rules WHERE id = ?').get(id) as any;
  if (!currentRule) {
    return { success: false, error: 'RULE_NOT_FOUND' };
  }

  if (currentRule.version !== data.version) {
    return { success: false, error: 'VERSION_CONFLICT' };
  }

  const newVersion = data.version + 1;
  const suggestedActionLabel = RULE_SUGGESTED_ACTION_LABELS[data.suggestedAction];
  const assignedCsName = data.assignedCsId ? 
    (db.prepare('SELECT name FROM users WHERE id = ?').get(data.assignedCsId) as { name: string } | undefined)?.name : 
    null;

  const updateStmt = db.prepare(`
    UPDATE arbitration_rules
    SET caseType = ?, responsibleParty = ?, refundAmountMin = ?, refundAmountMax = ?,
        merchantId = ?, priority = ?, suggestedAction = ?, suggestedActionLabel = ?,
        assignedCsId = ?, assignedCsName = ?, remark = ?, version = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND version = ?
  `);

  const updateResult = updateStmt.run(
    data.caseType,
    data.responsibleParty,
    data.refundAmountMin,
    data.refundAmountMax,
    data.merchantId,
    data.priority,
    data.suggestedAction,
    suggestedActionLabel,
    data.assignedCsId,
    assignedCsName,
    data.remark,
    newVersion,
    id,
    data.version
  );

  if (updateResult.changes === 0) {
    return { success: false, error: 'VERSION_CONFLICT' };
  }

  return { success: true, rule: findRuleById(id)! };
}

export function deleteRule(id: number): { success: boolean; error?: string } {
  const currentRule = db.prepare('SELECT * FROM arbitration_rules WHERE id = ?').get(id);
  if (!currentRule) {
    return { success: false, error: 'RULE_NOT_FOUND' };
  }

  db.prepare('DELETE FROM rule_hit_records WHERE ruleId = ?').run(id);
  db.prepare('UPDATE rule_audit_logs SET ruleId = NULL WHERE ruleId = ?').run(id);
  db.prepare('DELETE FROM arbitration_rules WHERE id = ?').run(id);
  return { success: true };
}

export function setRuleStatus(id: number, isEnabled: boolean): { success: boolean; rule?: ArbitrationRule; error?: string } {
  const currentRule = db.prepare('SELECT * FROM arbitration_rules WHERE id = ?').get(id) as any;
  if (!currentRule) {
    return { success: false, error: 'RULE_NOT_FOUND' };
  }

  const newVersion = currentRule.version + 1;
  db.prepare(`
    UPDATE arbitration_rules
    SET isEnabled = ?, version = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(isEnabled ? 1 : 0, newVersion, id);

  return { success: true, rule: findRuleById(id)! };
}

export function findRuleById(id: number): ArbitrationRule | undefined {
  const rule = db.prepare('SELECT * FROM arbitration_rules WHERE id = ?').get(id);
  return rule ? transformRule(rule) : undefined;
}

export function findRuleByPriority(priority: number, excludeId?: number): ArbitrationRule | undefined {
  let sql = 'SELECT * FROM arbitration_rules WHERE priority = ?';
  const params: any[] = [priority];
  
  if (excludeId !== undefined) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  
  const rule = db.prepare(sql).get(...params);
  return rule ? transformRule(rule) : undefined;
}

export function findRules(filter: RuleListFilter): ArbitrationRule[] {
  let sql = 'SELECT * FROM arbitration_rules WHERE 1=1';
  const params: (string | number)[] = [];

  if (filter.caseType) {
    sql += ' AND (caseType = ? OR caseType IS NULL)';
    params.push(filter.caseType);
  }

  if (filter.responsibleParty) {
    sql += ' AND (responsibleParty = ? OR responsibleParty IS NULL)';
    params.push(filter.responsibleParty);
  }

  if (filter.isEnabled !== undefined) {
    sql += ' AND isEnabled = ?';
    params.push(filter.isEnabled ? 1 : 0);
  }

  if (filter.keyword) {
    sql += ' AND (suggestedActionLabel LIKE ? OR remark LIKE ?)';
    const keyword = `%${filter.keyword}%`;
    params.push(keyword, keyword);
  }

  sql += ' ORDER BY priority ASC, id ASC';

  const rules = db.prepare(sql).all(...params) as any[];
  return rules.map(transformRule);
}

export function findAllEnabledRules(): ArbitrationRule[] {
  const rules = db.prepare('SELECT * FROM arbitration_rules WHERE isEnabled = 1 ORDER BY priority ASC, id ASC').all() as any[];
  return rules.map(transformRule);
}

export function matchRuleForCase(caseInfo: Case): RuleMatchResult | null {
  const rules = findAllEnabledRules();

  for (const rule of rules) {
    const matchConditions: string[] = [];
    let isMatch = true;

    if (rule.caseType !== null) {
      if (rule.caseType !== caseInfo.caseType) {
        isMatch = false;
      } else {
        matchConditions.push(`售后类型匹配: ${CASE_TYPE_LABELS[rule.caseType]}`);
      }
    } else {
      matchConditions.push('售后类型: 任意');
    }

    if (!isMatch) continue;

    if (rule.responsibleParty !== null) {
      if (rule.responsibleParty !== caseInfo.responsibleParty) {
        isMatch = false;
      } else {
        matchConditions.push(`责任方匹配: ${RESPONSIBLE_PARTY_LABELS[rule.responsibleParty]}`);
      }
    } else {
      matchConditions.push('责任方: 任意');
    }

    if (!isMatch) continue;

    if (caseInfo.refundAmount < rule.refundAmountMin || caseInfo.refundAmount > rule.refundAmountMax) {
      isMatch = false;
    } else {
      matchConditions.push(`退款金额匹配: ${caseInfo.refundAmount}元 在区间 ${rule.refundAmountMin} - ${rule.refundAmountMax} 内`);
    }

    if (!isMatch) continue;

    if (rule.merchantId !== null) {
      if (rule.merchantId !== caseInfo.merchantId) {
        isMatch = false;
      } else {
        matchConditions.push(`商家匹配: ${caseInfo.merchantName}`);
      }
    } else {
      matchConditions.push('商家: 任意');
    }

    if (isMatch) {
      return {
        rule,
        hitReason: matchConditions.join('; ')
      };
    }
  }

  return null;
}

export function createRuleHitRecord(
  caseId: number,
  ruleMatch: RuleMatchResult,
  version: number
): RuleHitRecord {
  const insertHit = db.prepare(`
    INSERT INTO rule_hit_records (
      caseId, ruleId, hitReason, suggestedAction,
      assignedCsId, assignedCsName, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insertHit.run(
    caseId,
    ruleMatch.rule.id,
    ruleMatch.hitReason,
    ruleMatch.rule.suggestedAction,
    ruleMatch.rule.assignedCsId,
    ruleMatch.rule.assignedCsName,
    version
  );

  const hitId = result.lastInsertRowid as number;
  return findHitRecordById(hitId)!;
}

export function findHitRecordById(id: number): RuleHitRecord | undefined {
  const record = db.prepare('SELECT * FROM rule_hit_records WHERE id = ?').get(id);
  return record ? transformHitRecord(record) : undefined;
}

export function findLatestHitRecordByCaseId(caseId: number): (RuleHitRecord & { rule?: ArbitrationRule }) | undefined {
  const record = db.prepare(`
    SELECT rhr.*
    FROM rule_hit_records rhr
    WHERE rhr.caseId = ?
    ORDER BY rhr.id DESC
    LIMIT 1
  `).get(caseId) as any;

  if (!record) return undefined;

  const hitRecord = transformHitRecord(record);
  const rule = findRuleById(hitRecord.ruleId);

  return { ...hitRecord, rule };
}

export function overrideRuleHit(
  hitRecordId: number,
  overrideRemark: string,
  overriddenBy: number,
  overriddenByName: string
): { success: boolean; error?: string } {
  const hitRecord = db.prepare('SELECT * FROM rule_hit_records WHERE id = ?').get(hitRecordId);
  if (!hitRecord) {
    return { success: false, error: 'RULE_NOT_FOUND' };
  }

  const result = db.prepare(`
    UPDATE rule_hit_records
    SET isOverridden = 1, overrideRemark = ?, overriddenBy = ?, 
        overriddenByName = ?, overriddenAt = CURRENT_TIMESTAMP
    WHERE id = ? AND isOverridden = 0
  `).run(overrideRemark, overriddenBy, overriddenByName, hitRecordId);

  if (result.changes === 0) {
    return { success: false, error: 'ALREADY_OVERRIDDEN' };
  }

  return { success: true };
}

export function exportRulesToCSV(): string {
  const rules = findRules({});
  
  const headers = [
    '优先级', '售后类型', '责任方', '金额下限', '金额上限',
    '商家ID', '建议动作', '分派客服ID', '备注', '启用状态'
  ];

  const rows = rules.map(rule => [
    rule.priority,
    rule.caseType || '',
    rule.responsibleParty || '',
    rule.refundAmountMin,
    rule.refundAmountMax,
    rule.merchantId || '',
    rule.suggestedAction,
    rule.assignedCsId || '',
    rule.remark || '',
    rule.isEnabled ? 'true' : 'false'
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return '\uFEFF' + csvContent;
}

export function importRulesFromCSV(
  csvContent: string,
  operatorId: number,
  operatorName: string
): RuleImportResult {
  const result: RuleImportResult = {
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    errors: [],
    warnings: []
  };

  const lines = csvContent.replace(/^\uFEFF/, '').split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    result.errors.push({ row: 1, error: 'CSV文件格式错误，缺少数据行' });
    result.failedCount++;
    return result;
  }

  const usedPriorities = new Set<number>();
  const existingRules = findRules({});
  existingRules.forEach(r => usedPriorities.add(r.priority));

  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.trim());
  
  const headerIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    headerIndex[h] = i;
  });

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const values = parseCSVLine(lines[i]);

    try {
      const getValue = (name: string) => {
        const idx = headerIndex[name];
        return idx !== undefined ? values[idx] || '' : '';
      };

      const priorityStr = getValue('优先级');
      const caseTypeStr = getValue('售后类型');
      const responsiblePartyStr = getValue('责任方');
      const minAmountStr = getValue('金额下限');
      const maxAmountStr = getValue('金额上限');
      const merchantIdStr = getValue('商家ID');
      const suggestedActionStr = getValue('建议动作');
      const assignedCsIdStr = getValue('分派客服ID');
      const remarkStr = getValue('备注');
      const isEnabledStr = getValue('启用状态');

      const priority = parseInt(priorityStr);
      if (isNaN(priority) || priority <= 0) {
        result.errors.push({ row: rowNum, error: `无效的优先级: ${priorityStr}` });
        result.failedCount++;
        continue;
      }

      let finalPriority = priority;
      if (usedPriorities.has(priority)) {
        result.warnings.push({ row: rowNum, warning: `优先级 ${priority} 已存在，已自动调整` });
        let newPriority = priority;
        while (usedPriorities.has(newPriority)) {
          newPriority++;
        }
        result.warnings.push({ row: rowNum, warning: `优先级已调整为 ${newPriority}` });
        finalPriority = newPriority;
      }
      usedPriorities.add(finalPriority);

      const refundAmountMin = parseFloat(minAmountStr) || 0;
      const refundAmountMax = parseFloat(maxAmountStr) || 999999.99;
      
      if (refundAmountMin < 0 || refundAmountMax < 0) {
        result.errors.push({ row: rowNum, error: `金额不能为负数: ${minAmountStr} - ${maxAmountStr}` });
        result.failedCount++;
        continue;
      }
      
      if (refundAmountMin > refundAmountMax) {
        result.errors.push({ row: rowNum, error: `无效的金额区间: ${minAmountStr} - ${maxAmountStr}，最低金额不能大于最高金额` });
        result.failedCount++;
        continue;
      }

      const validCaseTypes = ['outOfStock', 'damaged', 'wrongDelivery'];
      const caseTypeLabels: Record<string, CaseType> = {
        '缺货': 'outOfStock', '破损': 'damaged', '错发': 'wrongDelivery'
      };
      
      let caseType: CaseType | null = null;
      if (caseTypeStr.trim()) {
        if (validCaseTypes.includes(caseTypeStr.trim())) {
          caseType = caseTypeStr.trim() as CaseType;
        } else if (caseTypeLabels[caseTypeStr.trim()]) {
          caseType = caseTypeLabels[caseTypeStr.trim()];
        }
      }

      const validParties = ['merchant', 'logistics', 'platform'];
      const partyLabels: Record<string, ResponsibleParty> = {
        '商家': 'merchant', '物流': 'logistics', '平台': 'platform'
      };
      
      let responsibleParty: ResponsibleParty | null = null;
      if (responsiblePartyStr.trim()) {
        if (validParties.includes(responsiblePartyStr.trim())) {
          responsibleParty = responsiblePartyStr.trim() as ResponsibleParty;
        } else if (partyLabels[responsiblePartyStr.trim()]) {
          responsibleParty = partyLabels[responsiblePartyStr.trim()];
        }
      }

      const validActions = ['csRefund', 'csReject', 'review'];
      const actionLabels: Record<string, 'csRefund' | 'csReject' | 'review'> = {
        '同意退款': 'csRefund', '驳回申请': 'csReject', '人工审核': 'review'
      };
      
      let suggestedAction: 'csRefund' | 'csReject' | 'review' = 'review';
      if (validActions.includes(suggestedActionStr.trim())) {
        suggestedAction = suggestedActionStr.trim() as 'csRefund' | 'csReject' | 'review';
      } else if (actionLabels[suggestedActionStr.trim()]) {
        suggestedAction = actionLabels[suggestedActionStr.trim()];
      }

      const merchantId = merchantIdStr.trim() ? parseInt(merchantIdStr) : null;
      const assignedCsId = assignedCsIdStr.trim() ? parseInt(assignedCsIdStr) : null;
      const isEnabled = isEnabledStr.trim() === 'true' || isEnabledStr.trim() === '1' || isEnabledStr.trim() === '是';

      const ruleData: CreateRuleRequest = {
        caseType,
        responsibleParty,
        refundAmountMin,
        refundAmountMax,
        merchantId,
        priority: finalPriority,
        suggestedAction,
        assignedCsId,
        remark: remarkStr.trim() || null
      };

      createRule(ruleData, operatorId, operatorName);
      
      if (!isEnabled) {
        const createdRule = findRuleByPriority(finalPriority);
        if (createdRule) {
          setRuleStatus(createdRule.id, false);
        }
      }
      
      result.successCount++;

    } catch (error: any) {
      result.errors.push({ row: rowNum, error: `导入失败: ${error.message}` });
      result.failedCount++;
    }
  }

  return result;
}

function findNextAvailablePriority(used: Set<number>, start: number): number {
  let p = start;
  while (used.has(p)) {
    p++;
  }
  used.add(p);
  return p;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}
