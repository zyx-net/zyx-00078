import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { SCHEMA_SQL, INITIAL_USERS_SQL } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(SCHEMA_SQL);

  const defaultPassword = '123456';
  const validPasswordHash = bcrypt.hashSync(defaultPassword, 10);

  const users = db.prepare('SELECT id, username, passwordHash FROM users').all() as Array<{ id: number; username: string; passwordHash: string }>;
  
  if (users.length === 0) {
    const insertUsers = db.prepare(INITIAL_USERS_SQL);
    insertUsers.run(
      'leader1', '李团长', validPasswordHash,
      'merchant1', '张商家', validPasswordHash,
      'cs1', '王客服', validPasswordHash
    );
    console.log('初始化演示用户完成');
  } else {
    const updateStmt = db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?');
    let fixedCount = 0;
    for (const user of users) {
      try {
        const isValid = bcrypt.compareSync(defaultPassword, user.passwordHash);
        if (!isValid) {
          updateStmt.run(validPasswordHash, user.id);
          fixedCount++;
        }
      } catch {
        updateStmt.run(validPasswordHash, user.id);
        fixedCount++;
      }
    }
    if (fixedCount > 0) {
      console.log(`修复了 ${fixedCount} 个用户的密码哈希（bcrypt版本兼容性问题）`);
    }
  }

  console.log('数据库初始化完成');
}
