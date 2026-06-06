import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/permission.js';
import {
  createCommitment,
  getCommitmentDetail,
  getCommitmentList,
  getCommitmentsByCase,
  updateCommitment,
  fulfillCommitment,
  cancelCommitment,
  generateCommitmentCSV,
  importCommitmentsCSV,
  getCommitmentLogs
} from '../services/compensationService.js';
import {
  CreateCompensationCommitmentRequest,
  UpdateCompensationCommitmentRequest,
  CancelCompensationCommitmentRequest,
  FulfillCompensationCommitmentRequest,
  CompensationCommitmentListFilter,
  UserRole,
  CompensationCommitmentStatus,
  CompensationCommitmentType,
  CompensationImportResult
} from '../../shared/types.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (req, res) => {
  if (!req.user) return;

  const filter: CompensationCommitmentListFilter = {
    status: req.query.status as CompensationCommitmentStatus | undefined,
    type: req.query.type as CompensationCommitmentType | undefined,
    caseId: req.query.caseId ? parseInt(req.query.caseId as string) : undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    keyword: req.query.keyword as string | undefined
  };

  const result = getCommitmentList(
    filter,
    req.user.role as UserRole,
    req.user.id
  );
  res.json(result);
});

router.get('/case/:caseId', (req, res) => {
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

  const result = getCommitmentsByCase(
    caseId,
    req.user.role as UserRole,
    req.user.id
  );

  if (!result.success) {
    res.status(403).json(result);
    return;
  }
  res.json(result);
});

router.get('/:id', (req, res) => {
  if (!req.user) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的承诺单ID'
      }
    });
    return;
  }

  const result = getCommitmentDetail(
    id,
    req.user.role as UserRole,
    req.user.id
  );

  if (!result.success) {
    if (result.error?.code === 'COMMITMENT_NOT_FOUND') {
      res.status(404).json(result);
    } else if (result.error?.code === 'NOT_OWNED') {
      res.status(403).json(result);
    } else {
      res.status(400).json(result);
    }
    return;
  }
  res.json(result);
});

router.get('/:id/logs', (req, res) => {
  if (!req.user) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的承诺单ID'
      }
    });
    return;
  }

  const result = getCommitmentLogs(
    id,
    req.user.role as UserRole,
    req.user.id
  );

  if (!result.success) {
    if (result.error?.code === 'COMMITMENT_NOT_FOUND') {
      res.status(404).json(result);
    } else if (result.error?.code === 'NOT_OWNED') {
      res.status(403).json(result);
    } else {
      res.status(400).json(result);
    }
    return;
  }
  res.json(result);
});

router.post('/', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const data = req.body as CreateCompensationCommitmentRequest;

  if (!data.caseId || !data.type || data.amount === undefined || !data.dueDate) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请填写所有必填项：案件ID、类型、金额、履约截止日期'
      }
    });
    return;
  }

  const result = createCommitment(
    data,
    req.user.id,
    req.user.name,
    req.user.role as UserRole
  );

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
        message: '无效的承诺单ID'
      }
    });
    return;
  }

  const data = req.body as UpdateCompensationCommitmentRequest;

  if (data.version === undefined) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '缺少版本号信息'
      }
    });
    return;
  }

  const result = updateCommitment(
    id,
    data,
    req.user.id,
    req.user.name,
    req.user.role as UserRole
  );

  if (!result.success) {
    if (result.error?.code === 'COMMITMENT_NOT_FOUND') {
      res.status(404).json(result);
    } else if (result.error?.code === 'VERSION_CONFLICT') {
      res.status(409).json(result);
    } else {
      res.status(400).json(result);
    }
    return;
  }
  res.json(result);
});

router.post('/:id/fulfill', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的承诺单ID'
      }
    });
    return;
  }

  const data = req.body as FulfillCompensationCommitmentRequest;

  if (data.version === undefined) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '缺少版本号信息'
      }
    });
    return;
  }

  const result = fulfillCommitment(
    id,
    data,
    req.user.id,
    req.user.name,
    req.user.role as UserRole
  );

  if (!result.success) {
    if (result.error?.code === 'COMMITMENT_NOT_FOUND') {
      res.status(404).json(result);
    } else if (result.error?.code === 'VERSION_CONFLICT') {
      res.status(409).json(result);
    } else {
      res.status(400).json(result);
    }
    return;
  }
  res.json(result);
});

router.post('/:id/cancel', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的承诺单ID'
      }
    });
    return;
  }

  const data = req.body as CancelCompensationCommitmentRequest;

  if (data.version === undefined || !data.cancelReason?.trim()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '版本号和取消原因不能为空'
      }
    });
    return;
  }

  const result = cancelCommitment(
    id,
    data,
    req.user.id,
    req.user.name,
    req.user.role as UserRole
  );

  if (!result.success) {
    if (result.error?.code === 'COMMITMENT_NOT_FOUND') {
      res.status(404).json(result);
    } else if (result.error?.code === 'VERSION_CONFLICT') {
      res.status(409).json(result);
    } else {
      res.status(400).json(result);
    }
    return;
  }
  res.json(result);
});

router.get('/export/csv', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const filter: CompensationCommitmentListFilter = {
    status: req.query.status as CompensationCommitmentStatus | undefined,
    type: req.query.type as CompensationCommitmentType | undefined,
    caseId: req.query.caseId ? parseInt(req.query.caseId as string) : undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    keyword: req.query.keyword as string | undefined
  };

  const csvContent = generateCommitmentCSV(
    filter,
    req.user.role as UserRole,
    req.user.id
  );

  const filename = `compensation_commitments_${Date.now()}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

router.post('/import/csv', requireRole('cs'), (req, res) => {
  if (!req.user) return;

  const { csvContent } = req.body as { csvContent: string };

  if (!csvContent?.trim()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: 'CSV内容不能为空'
      }
    });
    return;
  }

  const result = importCommitmentsCSV(
    csvContent,
    req.user.id,
    req.user.name,
    req.user.role as UserRole
  );

  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

export default router;
