import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/permission.js';
import { getRefundedCases } from '../services/caseService.js';
import {
  createRefundExport,
  getExportRecord,
  getExportRecordList,
  getExportCSVContent,
  getOperatorList
} from '../services/exportService.js';
import { ExportRecordListFilter } from '../../shared/types.js';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('cs'));

router.get('/refunds', (req, res) => {
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请提供开始日期和结束日期'
      }
    });
    return;
  }

  const result = getRefundedCases(startDate, endDate);
  res.json(result);
});

router.post('/refunds', (req, res) => {
  const startDate = req.body.startDate as string;
  const endDate = req.body.endDate as string;

  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请提供开始日期和结束日期'
      }
    });
    return;
  }

  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '未登录'
      }
    });
    return;
  }

  const result = createRefundExport(
    startDate,
    endDate,
    req.user.id,
    req.user.name
  );

  if (!result.success) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

router.get('/records', (req, res) => {
  const filter: ExportRecordListFilter = {};

  if (req.query.startDate) {
    filter.startDate = req.query.startDate as string;
  }
  if (req.query.endDate) {
    filter.endDate = req.query.endDate as string;
  }
  if (req.query.operatorId) {
    filter.operatorId = parseInt(req.query.operatorId as string, 10);
  }

  const result = getExportRecordList(filter);
  res.json(result);
});

router.get('/records/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的记录ID'
      }
    });
    return;
  }

  const result = getExportRecord(id);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }

  res.json(result);
});

router.get('/records/:id/download', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的记录ID'
      }
    });
    return;
  }

  const result = getExportCSVContent(id);
  if (!result.success || !result.data || !result.filename) {
    res.status(404).json(result);
    return;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.data);
});

router.get('/operators', (req, res) => {
  const result = getOperatorList();
  res.json(result);
});

export default router;
