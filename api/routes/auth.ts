import { Router } from 'express';
import { login } from '../services/authService.js';
import { LoginRequest } from '../../shared/types.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body as LoginRequest;

  if (!username || !password) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PARAMS',
        message: '用户名和密码不能为空'
      }
    });
    return;
  }

  const result = login(username, password);
  if (!result) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '用户名或密码错误'
      }
    });
    return;
  }

  res.json({
    success: true,
    data: result
  });
});

router.post('/logout', (req, res) => {
  res.json({
    success: true,
    data: { message: '登出成功' }
  });
});

export default router;
