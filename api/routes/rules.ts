import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/permission.js';
import {
  createRule,
  updateRule,
  deleteRule,
  enableRule,
  disableRule,
  getRuleById,
  getRuleList,
  getCaseRuleInfo,
  overrideRuleHitByCaseId,
  exportRules,
  importRules,
  logExport,
  getRuleAuditLogs,
  getCaseAuditLogs,
  getAllAuditLogs,
  getCsList
} from '../services/ruleService.js';
import {
  CreateRuleRequest,
  UpdateRuleRequest,
  RuleListFilter,
  CaseType,
  ResponsibleParty,
  RuleOperationType
} from '../../shared/types.js';

const router = Router();

router.use(authMiddleware);

router.get('/cs-list', requireRole('cs'), (req, res) => {
  const result = getCsList();
  res.json(result);
});

router.get('/', requireRole('cs'), (req, res) => {
  const filter: RuleListFilter = {
    caseType: req.query.caseType as CaseType | undefined,
    responsibleParty: req.query.responsibleParty as ResponsibleParty | undefined,
    isEnabled: req.query.isEnabled !== undefined ? req.query.isEnabled === 'true' : undefined,
    keyword: req.query.keyword as string | undefined
  };

  const result = getRuleList(filter);
  res.json(result);
});

router.get('/:id', requireRole('cs'), (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的规则ID'
      }
    });
    return;
  }

  const result = getRuleById(id);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

router.post('/', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const data = req.body as CreateRuleRequest;

  if (data.priority === undefined || !data.suggestedAction) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '优先级和建议动作为必填项'
      }
    });
    return;
  }

  const result = createRule(data, req.user.id, req.user.name);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.status(201).json(result);
});

router.put('/:id', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的规则ID'
      }
    });
    return;
  }

  const data = req.body as UpdateRuleRequest;
  if (data.version === undefined) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '版本号不能为空'
      }
    });
    return;
  }

  const result = updateRule(id, data, req.user.id, req.user.name);
  if (!result.success) {
    if (result.error?.code === 'RULE_NOT_FOUND') {
      res.status(404).json(result);
    } else {
      res.status(400).json(result);
    }
    return;
  }
  res.json(result);
});

router.delete('/:id', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的规则ID'
      }
    });
    return;
  }

  const result = deleteRule(id, req.user.id, req.user.name);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

router.post('/:id/enable', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的规则ID'
      }
    });
    return;
  }

  const result = enableRule(id, req.user.id, req.user.name);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

router.post('/:id/disable', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的规则ID'
      }
    });
    return;
  }

  const result = disableRule(id, req.user.id, req.user.name);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

router.get('/:id/audit-logs', requireRole('cs'), (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的规则ID'
      }
    });
    return;
  }

  const result = getRuleAuditLogs(id);
  res.json(result);
});

router.get('/case/:caseId/rule-info', (req, res) => {
  const caseId = parseInt(req.params.caseId);
  if (isNaN(caseId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的案件ID'
      }
    });
    return;
  }

  const result = getCaseRuleInfo(caseId);
  res.json(result);
});

router.get('/case/:caseId/audit-logs', requireRole('cs'), (req, res) => {
  const caseId = parseInt(req.params.caseId);
  if (isNaN(caseId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的案件ID'
      }
    });
    return;
  }

  const result = getCaseAuditLogs(caseId);
  res.json(result);
});

router.post('/case/:caseId/override', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const caseId = parseInt(req.params.caseId);
  if (isNaN(caseId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的案件ID'
      }
    });
    return;
  }

  const { overrideRemark } = req.body;
  if (!overrideRemark || !overrideRemark.trim()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '覆盖备注不能为空'
      }
    });
    return;
  }

  const result = overrideRuleHitByCaseId(caseId, overrideRemark, req.user.id, req.user.name);
  if (!result.success) {
    if (result.error?.code === 'RULE_NOT_FOUND') {
      res.status(404).json(result);
    } else {
      res.status(400).json(result);
    }
    return;
  }
  res.json(result);
});

router.get('/export/csv', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const csvContent = exportRules();
  
  const ruleCount = csvContent.split('\n').length - 1;
  logExport(ruleCount, req.user.id, req.user.name);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="arbitration_rules_${Date.now()}.csv"`);
  res.send(csvContent);
});

router.post('/import/csv', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const { csvContent } = req.body;
  if (!csvContent || !csvContent.trim()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: 'CSV内容不能为空'
      }
    });
    return;
  }

  const result = importRules(csvContent, req.user.id, req.user.name);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.get('/audit-logs/all', requireRole('cs'), (req, res) => {
  const filter = {
    operationType: req.query.operationType as RuleOperationType | undefined,
    operatorId: req.query.operatorId ? parseInt(req.query.operatorId as string) : undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined
  };

  const result = getAllAuditLogs(filter);
  res.json(result);
});

export default router;
