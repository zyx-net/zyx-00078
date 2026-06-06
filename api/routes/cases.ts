import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/permission.js';
import {
  createCase,
  getCaseDetail,
  getCaseList,
  executeCaseAction,
  getMerchantList
} from '../services/caseService.js';
import {
  CreateCaseRequest,
  CaseActionRequest,
  CaseListFilter,
  UserRole,
  CaseType,
  CaseStatus,
  ResponsibleParty
} from '../../shared/types.js';

const router = Router();

router.use(authMiddleware);

router.get('/merchants', (req, res) => {
  const result = getMerchantList();
  res.json(result);
});

router.get('/', (req, res) => {
  if (!req.user) return;

  const filter: CaseListFilter = {
    caseType: req.query.caseType as CaseType | undefined,
    status: req.query.status as CaseStatus | undefined,
    responsibleParty: req.query.responsibleParty as ResponsibleParty | undefined,
    keyword: req.query.keyword as string | undefined
  };

  const result = getCaseList(
    filter,
    req.user.role as UserRole,
    req.user.id
  );
  res.json(result);
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的案件ID'
      }
    });
    return;
  }

  const result = getCaseDetail(id);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

router.post('/', requireRole('leader'), (req, res) => {
  if (!req.user) return;

  const data = req.body as CreateCaseRequest;

  if (!data.orderNo || !data.caseType || !data.productName ||
      data.quantity === undefined || data.refundAmount === undefined ||
      !data.responsibleParty || !data.merchantId || !data.description) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请填写所有必填项'
      }
    });
    return;
  }

  if (data.quantity <= 0 || data.refundAmount <= 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '数量和金额必须大于0'
      }
    });
    return;
  }

  const result = createCase(data, req.user.id, req.user.name);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.status(201).json({
    success: result.success,
    data: result.data,
    ruleMatch: result.ruleMatch
  });
});

router.post('/:id/action', (req, res) => {
  if (!req.user) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的案件ID'
      }
    });
    return;
  }

  const actionData = req.body as CaseActionRequest;
  if (!actionData.action || actionData.version === undefined) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '操作类型和版本号不能为空'
      }
    });
    return;
  }

  const result = executeCaseAction(
    id,
    actionData,
    req.user.id,
    req.user.name,
    req.user.role as UserRole
  );

  if (!result.success) {
    if (result.error?.code === 'CASE_NOT_FOUND') {
      res.status(404).json(result);
    } else if (result.error?.code === 'PERMISSION_DENIED') {
      res.status(403).json(result);
    } else {
      res.status(400).json(result);
    }
    return;
  }

  res.json({
    success: result.success,
    data: result.data,
    ruleMatch: result.ruleMatch
  });
});

export default router;
