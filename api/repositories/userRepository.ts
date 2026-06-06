import { db } from '../db/index.js';
import { User, UserRole } from '../../shared/types.js';

export function findUserByUsername(username: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
}

export function findUserById(id: number): Omit<User, 'passwordHash'> | undefined {
  return db.prepare('SELECT id, username, name, role, createdAt FROM users WHERE id = ?').get(id) as Omit<User, 'passwordHash'> | undefined;
}

export function findUsersByRole(role: UserRole): Array<Omit<User, 'passwordHash'>> {
  return db.prepare('SELECT id, username, name, role, createdAt FROM users WHERE role = ?').all(role) as Array<Omit<User, 'passwordHash'>>;
}
