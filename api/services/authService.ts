import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { findUserByUsername } from '../repositories/userRepository.js';
import { LoginResponse } from '../../shared/types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'after-sales-arbitration-secret-key';
const JWT_EXPIRES_IN = '24h';

export function login(username: string, password: string): LoginResponse | null {
  const user = findUserByUsername(username);
  if (!user) return null;

  const isValid = bcrypt.compareSync(password, user.passwordHash);
  if (!isValid) return null;

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt
    }
  };
}

export function verifyToken(token: string): {
  id: number;
  username: string;
  name: string;
  role: string;
} | null {
  try {
    return jwt.verify(token, JWT_SECRET) as {
      id: number;
      username: string;
      name: string;
      role: string;
    };
  } catch {
    return null;
  }
}
