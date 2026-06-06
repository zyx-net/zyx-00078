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

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const passwordHash = bcrypt.hashSync('123456', 10);
    const insertUsers = db.prepare(INITIAL_USERS_SQL);
    insertUsers.run(
      'leader1', '李团长', passwordHash,
      'merchant1', '张商家', passwordHash,
      'cs1', '王客服', passwordHash
    );
    console.log('初始化演示用户完成');
  }

  console.log('数据库初始化完成');
}
