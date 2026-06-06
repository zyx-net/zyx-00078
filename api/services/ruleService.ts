import {
  ArbitrationRule,
  CreateRuleRequest,
  UpdateRuleRequest,
  RuleListFilter,
  RuleImportResult,
  Case,
  RuleMatchResult,
  RuleHitRecord,
  RuleAuditLog,
  ERROR_CODES,
  RULE_ERROR_CODES,
  UserRole,
  RuleOperationType,
  CASE_TYPE_LABELS,
  RESPONSIBLE_PARTY_LABELS
} from '../../shared/types.js';
import {
  createRule as repoCreateRule,
  updateRule as repoUpdateRule,
  deleteRule as repoDeleteRule,
  setRuleStatus,
  findRuleById,
  findRuleByPriority,
  findRules,
  matchRuleForCase,
  createRuleHitRecord,
  findLatestHitRecordByCaseId,
  overrideRuleHit as repoOverrideRuleHit,
  exportRulesToCSV,
  importRulesFromCSV
} from '../repositories/ruleRepository.js';
import {
  logRuleCreate,
  logRuleUpdate,
  logRuleDelete,
  logRuleStatusChange,
  logRuleHit,
  logRuleOverride,
  logRuleImport,
  logRuleExport,
  findAuditLogsByRuleId,
  findAuditLogsByCaseId,
  findAuditLogs
} from '../repositories/ruleAuditRepository.js';
import { findUserById, findUsersByRole } from '../repositories/userRepository.js';

function validateRuleData(data: CreateRuleRequest, excludeId?: number): { valid: boolean; error?: string } {
  if (data.priority <= 0) {
    return { valid: false, error: '优先级必须大于0' };
  }

  if (data.refundAmountMin < 0 || data.refundAmountMax < 0) {
    return { valid: false, error: '退款金额不能为负数' };
  }

  if (data.refundAmountMin > data.refundAmountMax) {
    return { valid: false, error: '最低金额不能大于最高金额' };
  }

  const existingRule = findRuleByPriority(data.priority, excludeId);
  if (existingRule) {
    return { valid: false, error: `优先级 ${data.priority} 已被规则ID ${existingRule.id} 使用` };
  }

  if (data.merchantId !== null) {
    const merchant = findUserById(data.merchantId);
    if (!merchant || merchant.role !== 'merchant') {
      return { valid: false, error: '无效的商家ID' };
    }
  }

  if (data.assignedCsId !== null) {
    const cs = findUserById(data.assignedCsId);
    if (!cs || cs.role !== 'cs') {
      return { valid: false, error: '无效的客服ID，分派对象必须是客服角色' };
    }
  }

  return { valid: true };
}

export function createRule(
  data: CreateRuleRequest,
  operatorId: number,
  operatorName: string
): { success: boolean; data?: ArbitrationRule; error?: { code: string; message: string } } {
  const operator = findUserById(operatorId);
  if (!operator || operator.role !== 'cs') {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.INVALID_RULE,
        message: '只有客服角色可以创建仲裁规则'
      }
    };
  }

  const validation = validateRuleData(data);
  if (!validation.valid) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.INVALID_RULE,
        message: validation.error!
      }
    };
  }

  const rule = repoCreateRule(data, operatorId, operatorName);
  
  logRuleCreate(rule, operatorId, operatorName, 'cs');

  return { success: true, data: rule };
}

export function updateRule(
  id: number,
  data: UpdateRuleRequest,
  operatorId: number,
  operatorName: string
): { success: boolean; data?: ArbitrationRule; error?: { code: string; message: string } } {
  const operator = findUserById(operatorId);
  if (!operator || operator.role !== 'cs') {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.INVALID_RULE,
        message: '只有客服角色可以更新仲裁规则'
      }
    };
  }

  const oldRule = findRuleById(id);
  if (!oldRule) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: '规则不存在'
      }
    };
  }

  const validation = validateRuleData(data, id);
  if (!validation.valid) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.INVALID_RULE,
        message: validation.error!
      }
    };
  }

  const result = repoUpdateRule(id, data);
  
  if (!result.success) {
    if (result.error === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: {
          code: RULE_ERROR_CODES.VERSION_CONFLICT,
          message: '规则版本不匹配，请刷新后重试'
        }
      };
    }
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: '规则不存在'
      }
    };
  }

  logRuleUpdate(oldRule, result.rule!, operatorId, operatorName, 'cs');

  return { success: true, data: result.rule };
}

export function deleteRule(
  id: number,
  operatorId: number,
  operatorName: string
): { success: boolean; error?: { code: string; message: string } } {
  const operator = findUserById(operatorId);
  if (!operator || operator.role !== 'cs') {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.INVALID_RULE,
        message: '只有客服角色可以删除仲裁规则'
      }
    };
  }

  const rule = findRuleById(id);
  if (!rule) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: '规则不存在'
      }
    };
  }

  logRuleDelete(rule, operatorId, operatorName, 'cs');

  const result = repoDeleteRule(id);
  if (!result.success) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: '规则不存在'
      }
    };
  }

  return { success: true };
}

export function enableRule(
  id: number,
  operatorId: number,
  operatorName: string
): { success: boolean; data?: ArbitrationRule; error?: { code: string; message: string } } {
  const operator = findUserById(operatorId);
  if (!operator || operator.role !== 'cs') {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.INVALID_RULE,
        message: '只有客服角色可以启用仲裁规则'
      }
    };
  }

  const result = setRuleStatus(id, true);
  
  if (!result.success) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: '规则不存在'
      }
    };
  }

  logRuleStatusChange(result.rule!, true, operatorId, operatorName, 'cs');

  return { success: true, data: result.rule };
}

export function disableRule(
  id: number,
  operatorId: number,
  operatorName: string
): { success: boolean; data?: ArbitrationRule; error?: { code: string; message: string } } {
  const operator = findUserById(operatorId);
  if (!operator || operator.role !== 'cs') {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.INVALID_RULE,
        message: '只有客服角色可以禁用仲裁规则'
      }
    };
  }

  const result = setRuleStatus(id, false);
  
  if (!result.success) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: '规则不存在'
      }
    };
  }

  logRuleStatusChange(result.rule!, false, operatorId, operatorName, 'cs');

  return { success: true, data: result.rule };
}

export function getRuleById(id: number): { success: boolean; data?: ArbitrationRule; error?: { code: string; message: string } } {
  const rule = findRuleById(id);
  if (!rule) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: '规则不存在'
      }
    };
  }
  return { success: true, data: rule };
}

export function getRuleList(filter: RuleListFilter = {}): { success: boolean; data?: ArbitrationRule[] } {
  const rules = findRules(filter);
  return { success: true, data: rules };
}

export function matchAndRecordRule(
  caseInfo: Case,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): RuleMatchResult | null {
  const matchResult = matchRuleForCase(caseInfo);
  
  if (matchResult) {
    createRuleHitRecord(caseInfo.id, matchResult, caseInfo.version);
    logRuleHit(caseInfo.id, matchResult.rule, matchResult.hitReason, operatorId, operatorName, operatorRole);
  }

  return matchResult;
}

export function getCaseRuleInfo(caseId: number): { success: boolean; data?: (RuleHitRecord & { rule?: ArbitrationRule }) | null; error?: { code: string; message: string } } {
  const hitRecord = findLatestHitRecordByCaseId(caseId);
  return { success: true, data: hitRecord || null };
}

export function overrideRuleHitByCaseId(
  caseId: number,
  overrideRemark: string,
  operatorId: number,
  operatorName: string
): { success: boolean; error?: { code: string; message: string } } {
  const operator = findUserById(operatorId);
  if (!operator || operator.role !== 'cs') {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.INVALID_RULE,
        message: '只有客服角色可以覆盖规则建议'
      }
    };
  }

  const hitRecord = findLatestHitRecordByCaseId(caseId);
  if (!hitRecord) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: '该案件没有命中的规则'
      }
    };
  }

  if (hitRecord.isOverridden) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.INVALID_RULE,
        message: '该规则命中已被覆盖'
      }
    };
  }

  const result = repoOverrideRuleHit(hitRecord.id, overrideRemark, operatorId, operatorName);
  
  if (!result.success) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: '规则命中记录不存在'
      }
    };
  }

  if (hitRecord.rule) {
    logRuleOverride(caseId, hitRecord.rule, overrideRemark, operatorId, operatorName, 'cs');
  }

  return { success: true };
}

export function exportRules(operatorId?: number, operatorName?: string): string {
  const csv = exportRulesToCSV();
  if (operatorId !== undefined && operatorName !== undefined) {
    const rules = findRules({});
    logRuleExport(rules.length, operatorId, operatorName, 'cs');
  }
  return csv;
}

export function importRules(
  csvContent: string,
  operatorId: number,
  operatorName: string
): { success: boolean; data?: RuleImportResult; error?: { code: string; message: string } } {
  const operator = findUserById(operatorId);
  if (!operator || operator.role !== 'cs') {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.INVALID_RULE,
        message: '只有客服角色可以导入仲裁规则'
      }
    };
  }

  try {
    const result = importRulesFromCSV(csvContent, operatorId, operatorName);
    
    logRuleImport(result.successCount, result.failedCount, operatorId, operatorName, 'cs');

    return { success: true, data: result };
  } catch (error: any) {
    return {
      success: false,
      error: {
        code: RULE_ERROR_CODES.IMPORT_FORMAT_ERROR,
        message: `导入失败: ${error.message}`
      }
    };
  }
}

export function logExport(ruleCount: number, operatorId: number, operatorName: string): void {
  logRuleExport(ruleCount, operatorId, operatorName, 'cs');
}

export function getRuleAuditLogs(ruleId: number): { success: boolean; data?: RuleAuditLog[] } {
  const logs = findAuditLogsByRuleId(ruleId);
  return { success: true, data: logs };
}

export function getCaseAuditLogs(caseId: number): { success: boolean; data?: RuleAuditLog[] } {
  const logs = findAuditLogsByCaseId(caseId);
  return { success: true, data: logs };
}

export function getAllAuditLogs(filter: {
  operationType?: RuleOperationType;
  operatorId?: number;
  startDate?: string;
  endDate?: string;
} = {}): { success: boolean; data?: RuleAuditLog[] } {
  const logs = findAuditLogs(filter);
  return { success: true, data: logs };
}

export function getCsList(): { success: boolean; data?: Array<{ id: number; name: string }> } {
  const csUsers = findUsersByRole('cs');
  return { success: true, data: csUsers.map(u => ({ id: u.id, name: u.name })) };
}
