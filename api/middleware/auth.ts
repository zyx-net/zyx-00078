import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/authService.js';
import { UserRole } from '../../shared/types.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        name: string;
        role: UserRole;
      };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '未提供认证Token'
      }
    });
    return;
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token无效或已过期'
      }
    });
    return;
  }

  req.user = {
    id: decoded.id,
    username: decoded.username,
    name: decoded.name,
    role: decoded.role as UserRole
  };

  next();
}
