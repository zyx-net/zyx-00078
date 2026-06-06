import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../shared/types.js';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
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

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: '无权限执行此操作'
        }
      });
      return;
    }

    next();
  };
}
