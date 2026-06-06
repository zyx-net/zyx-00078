import {
  Case,
  CaseStatus,
  CaseAction,
  UserRole,
  CaseActionRequest,
  CreateCaseRequest,
  CaseListFilter,
  CaseDetail,
  ERROR_CODES,
  RuleMatchResult
} from '../../shared/types.js';
import {
  createCase as repoCreateCase,
  findCaseById,
  findCaseDetailById,
  findCases,
  updateCaseStatus,
  findRefundedCases
} from '../repositories/caseRepository.js';
import { findUserById, findUsersByRole } from '../repositories/userRepository.js';
import { matchAndRecordRule } from './ruleService.js';

interface StateTransition {
  action: CaseAction;
  role: UserRole;
  targetStatus: CaseStatus;
  requireEvidence: boolean;
}

const stateTransitions: Record<CaseStatus, StateTransition[]> = {
  pendingEvidence: [
    {
      action: 'submitEvidence',
      role: 'leader',
      targetStatus: 'merchantProcessing',
      requireEvidence: true
    }
  ],
  merchantProcessing: [
    {
      action: 'merchantRespond',
      role: 'merchant',
      targetStatus: 'csArbitration',
      requireEvidence: false
    }
  ],
  csArbitration: [
    {
      action: 'csRefund',
      role: 'cs',
      targetStatus: 'refundCompleted',
      requireEvidence: false
    },
    {
      action: 'csReject',
      role: 'cs',
      targetStatus: 'rejected',
      requireEvidence: false
    }
  ],
  refundCompleted: [],
  rejected: []
};

export function createCase(
  data: CreateCaseRequest,
  createdBy: number,
  createdByName: string
): { success: boolean; data?: Case; error?: { code: string; message: string }; ruleMatch?: RuleMatchResult | null } {
  const merchant = findUserById(data.merchantId);
  if (!merchant || merchant.role !== 'merchant') {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_PARAMS,
        message: '无效的商家ID'
      }
    };
  }

  const caseData = repoCreateCase(data, createdBy, createdByName, merchant.name);
  
  const ruleMatch = matchAndRecordRule(caseData, createdBy, createdByName, 'leader');
  
  return { success: true, data: caseData, ruleMatch };
}

export function getCaseDetail(id: number): { success: boolean; data?: CaseDetail; error?: { code: string; message: string } } {
  const caseDetail = findCaseDetailById(id);
  if (!caseDetail) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.CASE_NOT_FOUND,
        message: '案件不存在'
      }
    };
  }
  return { success: true, data: caseDetail };
}

export function getCaseList(
  filter: CaseListFilter,
  userRole: UserRole,
  userId: number
): { success: boolean; data?: Case[] } {
  const cases = findCases(filter, userRole, userId);
  return { success: true, data: cases };
}

export function executeCaseAction(
  caseId: number,
  actionData: CaseActionRequest,
  operatorId: number,
  operatorName: string,
  operatorRole: UserRole
): { success: boolean; data?: Case; error?: { code: string; message: string }; ruleMatch?: RuleMatchResult | null } {
  const caseInfo = findCaseById(caseId);
  if (!caseInfo) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.CASE_NOT_FOUND,
        message: '案件不存在'
      }
    };
  }

  if (caseInfo.version !== actionData.version) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.VERSION_CONFLICT,
        message: '案件版本不匹配，请刷新后重试'
      }
    };
  }

  const transitions = stateTransitions[caseInfo.status];
  const transition = transitions.find(t => t.action === actionData.action);

  if (!transition) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.INVALID_STATUS_TRANSITION,
        message: '当前状态不支持此操作'
      }
    };
  }

  if (transition.role !== operatorRole) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限执行此操作'
      }
    };
  }

  if (transition.requireEvidence && !actionData.evidenceUrl) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.MISSING_EVIDENCE,
        message: '请提供凭证URL'
      }
    };
  }

  if (operatorRole === 'merchant' && caseInfo.merchantId !== operatorId) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限处理此案件'
      }
    };
  }

  if (operatorRole === 'leader' && caseInfo.createdBy !== operatorId) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.PERMISSION_DENIED,
        message: '无权限处理此案件'
      }
    };
  }

  const result = updateCaseStatus(
    caseId,
    actionData.version,
    transition.targetStatus,
    actionData,
    operatorId,
    operatorName,
    operatorRole
  );

  if (!result.success) {
    if (result.error === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: {
          code: ERROR_CODES.VERSION_CONFLICT,
          message: '案件版本不匹配，请刷新后重试'
        }
      };
    }
    return {
      success: false,
      error: {
        code: ERROR_CODES.CASE_NOT_FOUND,
        message: '案件不存在'
      }
    };
  }

  let ruleMatch: RuleMatchResult | null = null;
  if (actionData.action === 'merchantRespond' && result.case) {
    ruleMatch = matchAndRecordRule(result.case, operatorId, operatorName, operatorRole);
  }

  return { success: true, data: result.case, ruleMatch };
}

export function getMerchantList() {
  const merchants = findUsersByRole('merchant');
  return { success: true, data: merchants };
}

export function getRefundedCases(startDate: string, endDate: string) {
  const cases = findRefundedCases(startDate, endDate);
  return { success: true, data: cases };
}
