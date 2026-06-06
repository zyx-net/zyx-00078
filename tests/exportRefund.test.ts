import { db, initDatabase } from '../api/db/index.js';
import { EXPORT_ERROR_CODES } from '../shared/types.js';
import {
  createRefundExport,
  getExportRecord,
  getExportRecordList,
  getExportCSVContent,
  generateRefundCSV
} from '../api/services/exportService.js';
import { login as authLogin } from '../api/services/authService.js';
import { executeCaseAction } from '../api/services/caseService.js';
import { requireRole } from '../api/middleware/permission.js';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

let testDb: any;

function setDb(dbInstance: any) {
  testDb = dbInstance;
}

function resetDatabase() {
  testDb.exec('DELETE FROM export_records');
  testDb.exec('DELETE FROM rule_audit_logs');
  testDb.exec('DELETE FROM rule_hit_records');
  testDb.exec('DELETE FROM evidences');
  testDb.exec('DELETE FROM case_versions');
  testDb.exec('DELETE FROM batch_revoke_items');
  testDb.exec('DELETE FROM batch_revoke_audits');
  testDb.exec('DELETE FROM batch_items');
  testDb.exec('DELETE FROM batch_operations');
  testDb.exec('DELETE FROM cases');
  testDb.exec("DELETE FROM users WHERE username NOT IN ('leader1', 'merchant1', 'cs1')");
}

function createRefundedCases(count: number, startDate: string, endDate: string) {
  const insertCase = testDb.prepare(`
    INSERT INTO cases (
      orderNo, caseType, productName, quantity, refundAmount,
      responsibleParty, merchantId, merchantName, description,
      status, version, createdBy, createdByName, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertVersion = testDb.prepare(`
    INSERT INTO case_versions (
      caseId, version, fromStatus, toStatus, action,
      operatorId, operatorName, operatorRole, remark, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const caseIds: number[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let i = 0; i < count; i++) {
    const randomTime = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    const updatedAt = randomTime.toISOString().replace('T', ' ').substring(0, 19);

    const result = insertCase.run(
      `DD202606${String(i + 1).padStart(3, '0')}`,
      'damaged',
      `退款商品${i + 1}`,
      i + 1,
      (i + 1) * 50.00,
      'merchant',
      2,
      '张商家',
      `测试退款案件${i + 1}`,
      'refundCompleted',
      4,
      1,
      '李团长',
      updatedAt
    );
    const caseId = result.lastInsertRowid as number;
    caseIds.push(caseId);

    const versions = [
      { v: 1, from: null, to: 'pendingEvidence', action: 'create', opId: 1, opName: '李团长', opRole: 'leader' },
      { v: 2, from: 'pendingEvidence', to: 'merchantProcessing', action: 'submitEvidence', opId: 1, opName: '李团长', opRole: 'leader' },
      { v: 3, from: 'merchantProcessing', to: 'csArbitration', action: 'merchantRespond', opId: 2, opName: '张商家', opRole: 'merchant' },
      { v: 4, from: 'csArbitration', to: 'refundCompleted', action: 'csRefund', opId: 3, opName: '王客服', opRole: 'cs' }
    ];

    versions.forEach(v => {
      insertVersion.run(
        caseId,
        v.v,
        v.from,
        v.to,
        v.action,
        v.opId,
        v.opName,
        v.opRole,
        `版本${v.v}操作`,
        updatedAt
      );
    });
  }

  return caseIds;
}

function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function login(username: string, password: string) {
  const result = authLogin(username, password);
  if (!result) {
    throw new Error(`登录失败: 用户名 ${username} 或密码错误`);
  }
  return result;
}

async function runTest(name: string, testFn: () => void | Promise<void>) {
  console.log(`\n=== 测试: ${name} ===`);
  try {
    await testFn();
    console.log(`✅ ${name} - 通过`);
    return true;
  } catch (error) {
    console.log(`❌ ${name} - 失败`);
    console.log(`   错误: ${(error as Error).message}`);
    return false;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function createExportRecordWithDate(startDate: string, endDate: string, exportDate: string, operatorId: number, operatorName: string) {
  const result = createRefundExport(startDate, endDate, operatorId, operatorName);
  if (result.success && result.data) {
    testDb.prepare('UPDATE export_records SET createdAt = ? WHERE id = ?').run(exportDate + ' 12:00:00', result.data.exportId);
  }
  return result;
}

async function runAllTests() {
  initDatabase();
  setDb(db);

  console.log('\n========================================');
  console.log('  退款导出可追溯功能 - 自动化测试');
  console.log('========================================');

  const csUser = login('cs1', '123456');
  const merchantUser = login('merchant1', '123456');
  const leaderUser = login('leader1', '123456');

  let passed = 0;
  let failed = 0;
  let currentDb = db;

  if (await runTest('1. 客服成功创建导出记录', () => {
    resetDatabase();
    const startDate = '2026-06-01';
    const endDate = '2026-06-10';
    createRefundedCases(3, startDate, endDate);

    const result = createRefundExport(startDate, endDate, csUser.user.id, csUser.user.name);

    assert(result.success === true, '创建导出记录应该成功');
    assert(result.data!.exportId > 0, '应该返回有效的导出ID');
    assert(result.data!.exportNo.startsWith('EXPORT-'), '导出编号格式应该正确');
    assert(result.data!.caseCount === 3, '命中案件数应该正确');
    assert(Math.abs(result.data!.totalRefundAmount - 300.00) < 0.01, '总退款金额应该正确');
    assert(result.data!.fileHash.length === 64, '文件摘要应该是64位SHA-256哈希');

    const record = getExportRecord(result.data!.exportId);
    assert(record.success === true, '应该能查询到导出记录');
    assert(record.data!.startDate === startDate, '筛选条件-开始日期应该正确');
    assert(record.data!.endDate === endDate, '筛选条件-结束日期应该正确');
    assert(record.data!.operatorId === csUser.user.id, '导出人ID应该正确');
    assert(record.data!.operatorName === csUser.user.name, '导出人姓名应该正确');
    assert(record.data!.caseCount === 3, '命中案件数应该正确');
    assert(Math.abs(record.data!.totalRefundAmount - 300.00) < 0.01, '总退款金额应该正确');
    assert(record.data!.fileHash === result.data!.fileHash, '文件摘要应该一致');
    assert(record.data!.createdAt, '生成时间应该存在');
  })) { passed++; } else { failed++; }

  if (await runTest('2. 重新下载CSV与原内容完全一致', () => {
    resetDatabase();
    const startDate = '2026-06-01';
    const endDate = '2026-06-10';
    createRefundedCases(3, startDate, endDate);

    const createResult = createRefundExport(startDate, endDate, csUser.user.id, csUser.user.name);
    const exportId = createResult.data!.exportId;

    const originalCSV = generateRefundCSV(startDate, endDate);
    const originalHash = computeHash(originalCSV);

    const downloadResult = getExportCSVContent(exportId);
    assert(downloadResult.success === true, '下载应该成功');
    assert(downloadResult.filename!.startsWith('refund_export_EXPORT-'), '文件名应该正确');
    assert(downloadResult.data === originalCSV, '重新下载的CSV内容应该与原内容完全一致');

    const downloadHash = computeHash(downloadResult.data!);
    assert(downloadHash === originalHash, '重新下载的CSV哈希应该与原哈希一致');

    const record = getExportRecord(exportId);
    assert(record.data!.fileHash === originalHash, '记录中的文件摘要应该正确');
    assert(record.data!.fileSize === Buffer.byteLength(originalCSV, 'utf8'), '文件大小应该正确');
  })) { passed++; } else { failed++; }

  if (await runTest('3. 历史记录按日期筛选', () => {
    resetDatabase();
    const startDate = '2026-06-01';
    const endDate = '2026-06-10';
    createRefundedCases(3, startDate, endDate);

    const create1 = createExportRecordWithDate(startDate, endDate, '2026-06-05', csUser.user.id, csUser.user.name);
    const create2 = createExportRecordWithDate(startDate, endDate, '2026-06-15', csUser.user.id, csUser.user.name);

    const allRecords = getExportRecordList({});
    assert(allRecords.success === true, '查询所有记录应该成功');
    assert(allRecords.data!.length === 2, '应该有2条导出记录');

    const juneRecords = getExportRecordList({ startDate: '2026-06-01', endDate: '2026-06-30' });
    assert(juneRecords.data!.length === 2, '6月应该有2条记录');

    const earlyJuneRecords = getExportRecordList({ startDate: '2026-06-01', endDate: '2026-06-10' });
    assert(earlyJuneRecords.data!.length === 1, '6月上旬应该只有1条记录');
    assert(earlyJuneRecords.data![0].exportNo === create1.data!.exportNo, '应该是第一条导出记录');

    const lateJuneRecords = getExportRecordList({ startDate: '2026-06-11', endDate: '2026-06-20' });
    assert(lateJuneRecords.data!.length === 1, '6月中旬应该只有1条记录');
    assert(lateJuneRecords.data![0].exportNo === create2.data!.exportNo, '应该是第二条导出记录');
  })) { passed++; } else { failed++; }

  if (await runTest('4. 历史记录按导出人筛选', () => {
    resetDatabase();
    const startDate = '2026-06-01';
    const endDate = '2026-06-10';
    createRefundedCases(2, startDate, endDate);

    const create1 = createRefundExport(startDate, endDate, csUser.user.id, csUser.user.name);

    const insertOtherCs = currentDb.prepare(`
      INSERT OR IGNORE INTO users (username, name, role, passwordHash) VALUES (?, ?, 'cs', ?)
    `);
    const validPasswordHash = bcrypt.hashSync('123456', 10);
    insertOtherCs.run('cs2', '赵客服', validPasswordHash);
    const otherCsResult = currentDb.prepare('SELECT id FROM users WHERE username = ?').get('cs2') as { id: number };
    const otherCsId = otherCsResult.id;

    const create2 = createRefundExport(startDate, endDate, otherCsId, '赵客服');

    const allRecords = getExportRecordList({});
    assert(allRecords.data!.length === 2, '应该有2条导出记录');

    const cs1Records = getExportRecordList({ operatorId: csUser.user.id });
    assert(cs1Records.data!.length === 1, '王客服应该只有1条记录');
    assert(cs1Records.data![0].operatorName === '王客服', '导出人应该是王客服');

    const cs2Records = getExportRecordList({ operatorId: otherCsId });
    assert(cs2Records.data!.length === 1, '赵客服应该只有1条记录');
    assert(cs2Records.data![0].operatorName === '赵客服', '导出人应该是赵客服');
  })) { passed++; } else { failed++; }

  if (await runTest('5. 导出后案件被撤销，旧记录保持不变', () => {
    resetDatabase();
    const startDate = '2026-06-01';
    const endDate = '2026-06-10';
    const caseIds = createRefundedCases(3, startDate, endDate);

    const originalCSV = generateRefundCSV(startDate, endDate);
    const originalHash = computeHash(originalCSV);

    const createResult = createRefundExport(startDate, endDate, csUser.user.id, csUser.user.name);
    const exportId = createResult.data!.exportId;

    const recordBefore = getExportRecord(exportId);
    assert(recordBefore.data!.caseCount === 3, '导出前应该有3个案件');
    assert(recordBefore.data!.fileHash === originalHash, '导出前哈希应该正确');

    const caseToRevoke = caseIds[0];
    currentDb.prepare("UPDATE cases SET status = 'csArbitration', version = 4 WHERE id = ?").run(caseToRevoke);

    const revokeResult = executeCaseAction(
      caseToRevoke,
      { action: 'csReject', version: 4, remark: '撤销退款' },
      csUser.user.id,
      csUser.user.name,
      csUser.user.role as 'cs'
    );
    assert(revokeResult.success === true, '撤销案件应该成功');
    assert(revokeResult.data!.status === 'rejected', '案件状态应该变为驳回');

    const newCSV = generateRefundCSV(startDate, endDate);
    const newHash = computeHash(newCSV);
    assert(newHash !== originalHash, '新导出的哈希应该不同（因为案件减少了）');

    const recordAfter = getExportRecord(exportId);
    assert(recordAfter.data!.caseCount === 3, '旧记录的案件数应该保持不变');
    assert(recordAfter.data!.fileHash === originalHash, '旧记录的文件摘要应该保持不变');
    assert(recordAfter.data!.csvContent === originalCSV, '旧记录的CSV内容应该保持不变');

    const downloadResult = getExportCSVContent(exportId);
    assert(downloadResult.data === originalCSV, '重新下载应该得到原内容');
    assert(downloadResult.data !== newCSV, '重新下载不应该得到新内容');
  })) { passed++; } else { failed++; }

  if (await runTest('6. 新建导出反映最新状态', () => {
    resetDatabase();
    const startDate = '2026-06-01';
    const endDate = '2026-06-10';
    const caseIds = createRefundedCases(3, startDate, endDate);

    const create1 = createRefundExport(startDate, endDate, csUser.user.id, csUser.user.name);
    const export1 = getExportRecord(create1.data!.exportId);

    const caseToRevoke = caseIds[0];
    currentDb.prepare("UPDATE cases SET status = 'csArbitration', version = 4 WHERE id = ?").run(caseToRevoke);
    executeCaseAction(
      caseToRevoke,
      { action: 'csReject', version: 4, remark: '撤销退款' },
      csUser.user.id,
      csUser.user.name,
      csUser.user.role as 'cs'
    );

    const create2 = createRefundExport(startDate, endDate, csUser.user.id, csUser.user.name);
    const export2 = getExportRecord(create2.data!.exportId);

    assert(export1.data!.caseCount === 3, '第一次导出应该有3个案件');
    assert(export2.data!.caseCount === 2, '第二次导出应该只有2个案件');
    assert(export1.data!.totalRefundAmount > export2.data!.totalRefundAmount, '第一次总金额应该更大');
    assert(export1.data!.fileHash !== export2.data!.fileHash, '两次导出的文件摘要应该不同');
    assert(export1.data!.csvContent !== export2.data!.csvContent, '两次导出的CSV内容应该不同');
  })) { passed++; } else { failed++; }

  if (await runTest('7. 团长无权创建导出记录', () => {
    resetDatabase();
    const startDate = '2026-06-01';
    const endDate = '2026-06-10';
    createRefundedCases(3, startDate, endDate);

    const mockReq = {
      user: { id: leaderUser.user.id, role: leaderUser.user.role },
      body: { startDate, endDate }
    };
    const mockRes: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(data: any) { this.body = data; return this; }
    };

    const middleware = requireRole('cs');
    middleware(mockReq as any, mockRes as any, () => {});

    assert(mockRes.statusCode === 403, '应该返回403禁止访问');
    assert(mockRes.body!.success === false, '应该返回失败');
    assert(mockRes.body!.error.code === 'PERMISSION_DENIED', '错误码应该正确');
  })) { passed++; } else { failed++; }

  if (await runTest('8. 商家无权查看导出记录', () => {
    resetDatabase();
    const startDate = '2026-06-01';
    const endDate = '2026-06-10';
    createRefundedCases(3, startDate, endDate);
    createRefundExport(startDate, endDate, csUser.user.id, csUser.user.name);

    const mockReq = {
      user: { id: merchantUser.user.id, role: merchantUser.user.role },
      query: {}
    };
    const mockRes: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(data: any) { this.body = data; return this; }
    };

    const middleware = requireRole('cs');
    middleware(mockReq as any, mockRes as any, () => {});

    assert(mockRes.statusCode === 403, '应该返回403禁止访问');
    assert(mockRes.body!.error.code === 'PERMISSION_DENIED', '错误码应该正确');
  })) { passed++; } else { failed++; }

  if (await runTest('9. 数据持久化验证-重启后记录一致', async () => {
    resetDatabase();
    const startDate = '2026-06-01';
    const endDate = '2026-06-10';
    createRefundedCases(3, startDate, endDate);

    const createResult = createRefundExport(startDate, endDate, csUser.user.id, csUser.user.name);
    const exportId = createResult.data!.exportId;
    const originalRecord = getExportRecord(exportId);

    const exportRecordBefore = currentDb.prepare('SELECT * FROM export_records WHERE id = ?').get(exportId) as any;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const DATA_DIR = path.join(__dirname, '..', 'data');
    const DB_PATH = path.join(DATA_DIR, 'database.sqlite');

    const independentDb = new Database(DB_PATH);
    independentDb.pragma('journal_mode = WAL');
    independentDb.pragma('foreign_keys = ON');

    const exportRecordAfter = independentDb.prepare('SELECT * FROM export_records WHERE id = ?').get(exportId) as any;
    assert(exportRecordAfter !== undefined, '重启后记录应该存在');
    assert(exportRecordAfter.exportNo === exportRecordBefore.exportNo, '导出编号应该一致');
    assert(exportRecordAfter.startDate === exportRecordBefore.startDate, '开始日期应该一致');
    assert(exportRecordAfter.endDate === exportRecordBefore.endDate, '结束日期应该一致');
    assert(exportRecordAfter.operatorId === exportRecordBefore.operatorId, '导出人ID应该一致');
    assert(exportRecordAfter.caseCount === exportRecordBefore.caseCount, '案件数应该一致');
    assert(Math.abs(exportRecordAfter.totalRefundAmount - exportRecordBefore.totalRefundAmount) < 0.01, '总金额应该一致');
    assert(exportRecordAfter.fileHash === exportRecordBefore.fileHash, '文件摘要应该一致');
    assert(exportRecordAfter.csvContent === exportRecordBefore.csvContent, 'CSV内容应该一致');
    assert(exportRecordAfter.createdAt === exportRecordBefore.createdAt, '创建时间应该一致');

    independentDb.close();

    const downloadResult = getExportCSVContent(exportId);
    assert(downloadResult.data === originalRecord.data!.csvContent, '重启后重新下载的CSV应该一致');
  })) { passed++; } else { failed++; }

  if (await runTest('10. 空数据导出应该被拒绝', () => {
    resetDatabase();
    const startDate = '2026-06-01';
    const endDate = '2026-06-10';

    const result = createRefundExport(startDate, endDate, csUser.user.id, csUser.user.name);

    assert(result.success === false, '空数据导出应该失败');
    assert(result.error!.code === EXPORT_ERROR_CODES.EXPORT_EMPTY, '错误码应该正确');
    assert(result.error!.message.includes('没有可导出的退款记录'), '错误信息应该正确');

    const records = getExportRecordList({});
    assert(records.data!.length === 0, '不应该创建导出记录');
  })) { passed++; } else { failed++; }

  if (await runTest('11. 直接调接口越权访问应该被拒绝', () => {
    resetDatabase();
    const startDate = '2026-06-01';
    const endDate = '2026-06-10';
    createRefundedCases(3, startDate, endDate);

    const testEndpoints = [
      { method: 'POST', path: '/export/refunds', role: 'leader' },
      { method: 'POST', path: '/export/refunds', role: 'merchant' },
      { method: 'GET', path: '/export/records', role: 'leader' },
      { method: 'GET', path: '/export/records', role: 'merchant' },
      { method: 'GET', path: '/export/records/1/download', role: 'leader' },
      { method: 'GET', path: '/export/records/1/download', role: 'merchant' }
    ];

    const middleware = requireRole('cs');

    testEndpoints.forEach(({ method, path, role }) => {
      const mockReq = {
        user: { id: 1, role: role },
        method,
        path,
        body: {},
        query: {},
        params: { id: '1' }
      };
      const mockRes: any = {
        statusCode: 200,
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.body = data; return this; }
      };

      middleware(mockReq as any, mockRes as any, () => {});

      assert(mockRes.statusCode === 403, `${method} ${path} - ${role} 应该返回403`);
      assert(mockRes.body!.success === false, `${method} ${path} - ${role} 应该返回失败`);
      assert(mockRes.body!.error.code === 'PERMISSION_DENIED', `${method} ${path} - ${role} 错误码应该正确`);
    });
  })) { passed++; } else { failed++; }

  console.log('\n========================================');
  console.log(`  测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(console.error);
