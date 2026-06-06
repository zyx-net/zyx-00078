import { Router, Request } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/permission.js';
import {
  previewQualityInspection,
  createQualityInspection,
  getQualityInspectionList,
  getQualityInspectionDetail,
  getQualityInspectionItemDetail,
  inspectQualityItem,
  batchInspectQualityItems,
  exportQualityInspectionCSV,
  importQualityInspectionItems,
  getQualityInspectionOperationLogs
} from '../services/qualityInspectionService.js';
import {
  CreateQualityInspectionRequest,
  InspectQualityRequest,
  BatchInspectQualityRequest,
  QualityInspectionListFilter,
  CaseType,
  ResponsibleParty
} from '../../shared/types.js';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('cs'));

router.post('/preview', (req, res) => {
  if (!req.user) return;

  const body = req.body as {
    startDate: string;
    endDate: string;
    caseType?: string;
    responsibleParty?: string;
    operatorId?: number;
    caseIds?: number[];
  };

  const { startDate, endDate, caseType, responsibleParty, operatorId, caseIds } = body;

  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请选择开始日期和结束日期'
      }
    });
    return;
  }

  const result = previewQualityInspection({
    startDate,
    endDate,
    caseType,
    responsibleParty,
    operatorId,
    caseIds,
    userRole: req.user.role
  });

  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.post('/', (req, res) => {
  if (!req.user) return;

  const body = req.body as CreateQualityInspectionRequest;

  if (!body.title || !body.title.trim()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请输入抽查单标题'
      }
    });
    return;
  }

  if (!body.startDate || !body.endDate) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请选择开始日期和结束日期'
      }
    });
    return;
  }

  const result = createQualityInspection(
    body,
    req.user.id,
    req.user.name,
    req.user.role
  );

  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.get('/', (req, res) => {
  if (!req.user) return;

  const filter: QualityInspectionListFilter = {
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    caseType: req.query.caseType as CaseType | undefined,
    status: req.query.status as any,
    createdBy: req.query.createdBy ? parseInt(req.query.createdBy as string) : undefined
  };

  const result = getQualityInspectionList(filter, req.user.role);
  res.json(result);
});

router.get('/:inspectionIdOrNo', (req, res) => {
  if (!req.user) return;

  const result = getQualityInspectionDetail(
    req.params.inspectionIdOrNo,
    req.user.role
  );

  if (!result.success) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

router.get('/item/:itemId', (req, res) => {
  if (!req.user) return;

  const itemId = parseInt(req.params.itemId);
  if (isNaN(itemId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的明细ID'
      }
    });
    return;
  }

  const result = getQualityInspectionItemDetail(itemId, req.user.role);

  if (!result.success) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

router.post('/inspect', (req, res) => {
  if (!req.user) return;

  const body = req.body as InspectQualityRequest;

  if (!body.itemId || typeof body.itemId !== 'number') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请选择要质检的明细'
      }
    });
    return;
  }

  if (!body.version || typeof body.version !== 'number') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '缺少版本号信息'
      }
    });
    return;
  }

  const result = inspectQualityItem(
    body,
    req.user.id,
    req.user.name,
    req.user.role
  );

  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.post('/batch-inspect', (req, res) => {
  if (!req.user) return;

  const body = req.body as BatchInspectQualityRequest;

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请选择要质检的明细'
      }
    });
    return;
  }

  const result = batchInspectQualityItems(
    body,
    req.user.id,
    req.user.name,
    req.user.role
  );

  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.get('/:inspectionId/export', (req, res) => {
  if (!req.user) return;

  const inspectionId = parseInt(req.params.inspectionId);
  if (isNaN(inspectionId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的抽查单ID'
      }
    });
    return;
  }

  const result = exportQualityInspectionCSV(
    inspectionId,
    req.user.role,
    req.user.id,
    req.user.name
  );

  if (!result.success) {
    res.status(404).json(result);
    return;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="quality_inspection_${inspectionId}_${Date.now()}.csv"`);
  res.send(result.data);
});

router.post('/:inspectionId/import', (req, res) => {
  if (!req.user) return;

  const inspectionId = parseInt(req.params.inspectionId);
  if (isNaN(inspectionId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '无效的抽查单ID'
      }
    });
    return;
  }

  const csvContent = req.body.csvContent || req.body;
  if (!csvContent || typeof csvContent !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '请提供CSV内容'
      }
    });
    return;
  }

  const result = importQualityInspectionItems(
    inspectionId,
    csvContent,
    req.user.id,
    req.user.name,
    req.user.role
  );

  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.get('/logs', (req, res) => {
  if (!req.user) return;

  const inspectionId = req.query.inspectionId ? parseInt(req.query.inspectionId as string) : undefined;

  const result = getQualityInspectionOperationLogs(
    inspectionId,
    req.user.role
  );

  res.json(result);
});

export default router;
