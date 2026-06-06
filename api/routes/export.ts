import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/permission.js';
import { generateRefundCSV } from '../services/exportService.js';
import { getRefundedCases } from '../services/caseService.js';

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

  const format = req.query.format as string;
  if (format === 'csv') {
    const csv = generateRefundCSV(startDate, endDate);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="refund_list_${startDate}_${endDate}.csv"`);
    res.send(csv);
    return;
  }

  const result = getRefundedCases(startDate, endDate);
  res.json(result);
});

export default router;
