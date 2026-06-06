import { Router, Request } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/permission.js';
import {
  previewBatch,
  executeBatch,
  getBatchList,
  getBatchDetail,
  exportBatchCSV,
  previewRevokeBatch,
  executeRevokeBatch,
  exportRevokeBatchCSV
} from '../services/batchService.js';
import {
  BatchPreviewRequest,
  BatchExecuteRequest,
  BatchListFilter,
  BatchOperationAction,
  UserRole,
  BatchRevokeExecuteRequest
} from '../../shared/types.js';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('cs'));

router.post('/preview', (req, res) => {
  if (!req.user) return;

  const body = req.body as BatchPreviewRequest;
  const { caseIds, action } = body;

  if (!Array.isArray(caseIds) || caseIds.length === 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请选择要处理的案件'
      }
    });
    return;
  }

  if (!action || !['csRefund', 'csReject'].includes(action)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的批量操作类型'
      }
    });
    return;
  }

  const result = previewBatch({ caseIds, action });
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.post('/execute', (req, res) => {
  if (!req.user) return;

  const body = req.body as BatchExecuteRequest;
  const { caseIds, action, remark, versions } = body;

  if (!Array.isArray(caseIds) || caseIds.length === 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请选择要处理的案件'
      }
    });
    return;
  }

  if (!action || !['csRefund', 'csReject'].includes(action)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的批量操作类型'
      }
    });
    return;
  }

  if (!versions || typeof versions !== 'object') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '缺少版本号信息'
      }
    });
    return;
  }

  const result = executeBatch(
    { caseIds, action, remark: remark || '', versions },
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

router.get('/', (req, res) => {
  if (!req.user) return;

  const filter: BatchListFilter = {
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    action: req.query.action as BatchOperationAction | undefined
  };

  const result = getBatchList(filter);
  res.json(result);
});

router.get('/:batchIdOrNo', (req, res) => {
  if (!req.user) return;

  const result = getBatchDetail(req.params.batchIdOrNo);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

router.get('/:batchId/export', (req, res) => {
  if (!req.user) return;

  const batchId = parseInt(req.params.batchId);
  if (isNaN(batchId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的批次ID'
      }
    });
    return;
  }

  const result = exportBatchCSV(batchId);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="batch_${Date.now()}.csv"`);
  res.send(result.data);
});

router.post('/revoke/preview', (req, res) => {
  if (!req.user) return;

  const body = req.body as { batchId: number };
  const { batchId } = body;

  if (!batchId || typeof batchId !== 'number') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的批次ID'
      }
    });
    return;
  }

  const result = previewRevokeBatch(
    { batchId },
    req.user.id,
    req.user.role as UserRole
  );

  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.post('/revoke/execute', (req, res) => {
  if (!req.user) return;

  const body = req.body as BatchRevokeExecuteRequest;
  const { batchId, remark, versions } = body;

  if (!batchId || typeof batchId !== 'number') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的批次ID'
      }
    });
    return;
  }

  if (!versions || typeof versions !== 'object') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '缺少版本号信息'
      }
    });
    return;
  }

  const result = executeRevokeBatch(
    { batchId, remark: remark || '', versions },
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

router.get('/revoke/:revokeId/export', (req, res) => {
  if (!req.user) return;

  const revokeId = parseInt(req.params.revokeId);
  if (isNaN(revokeId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的撤销记录ID'
      }
    });
    return;
  }

  const result = exportRevokeBatchCSV(revokeId);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="revoke_batch_${Date.now()}.csv"`);
  res.send(result.data);
});

export default router;
