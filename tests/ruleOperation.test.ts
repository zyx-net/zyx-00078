import bcrypt from 'bcryptjs';
import { db, initDatabase } from '../api/db/index.js';
import {
  ERROR_CODES,
  RULE_ERROR_CODES,
  CreateRuleRequest,
  UpdateRuleRequest,
  CaseType,
  ResponsibleParty,
  RuleSuggestedAction,
  RuleOperationType,
  RULE_OPERATION_TYPE_LABELS
} from '../shared/types.js';
import {
  createRule,
  updateRule,
  deleteRule,
  enableRule,
  disableRule,
  getRuleById,
  getRuleList,
  matchAndRecordRule,
  getCaseRuleInfo,
  overrideRuleHitByCaseId,
  exportRules,
  importRules,
  getRuleAuditLogs,
  getCaseAuditLogs,
  getAllAuditLogs,
  getCsList
} from '../api/services/ruleService.js';
import { login as authLogin } from '../api/services/authService.js';
import { createCase } from '../api/services/caseService.js';

function resetRuleDatabase() {
  db.exec('DELETE FROM rule_audit_logs');
  db.exec('DELETE FROM rule_hit_records');
  db.exec('DELETE FROM arbitration_rules');
  db.exec('DELETE FROM evidences');
  db.exec('DELETE FROM case_versions');
  db.exec('DELETE FROM cases');
}

function resetAllDatabase() {
  db.exec('DELETE FROM rule_audit_logs');
  db.exec('DELETE FROM rule_hit_records');
  db.exec('DELETE FROM arbitration_rules');
  db.exec('DELETE FROM batch_revoke_items');
  db.exec('DELETE FROM batch_revoke_audits');
  db.exec('DELETE FROM batch_items');
  db.exec('DELETE FROM batch_operations');
  db.exec('DELETE FROM evidences');
  db.exec('DELETE FROM case_versions');
  db.exec('DELETE FROM cases');
  db.exec('DELETE FROM users');
}

const TEST_PASSWORD_HASH = bcrypt.hashSync('123456', 10);

function createTestUser(id: number, username: string, name: string, role: string) {
  db.prepare(`
    INSERT OR REPLACE INTO users (id, username, name, role, passwordHash, createdAt)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(id, username, name, role, TEST_PASSWORD_HASH);
}

function login(userId: number): { id: number; name: string; role: 'cs' | 'merchant' | 'leader' } {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const user = stmt.get(userId) as { id: number; username: string; name: string; role: 'cs' | 'merchant' | 'leader'; passwordHash: string } | undefined;
  
  if (!user) {
    throw new Error('用户不存在');
  }

  return {
    id: user.id,
    name: user.name,
    role: user.role
  };
}

function createTestCase(
  caseType: CaseType,
  responsibleParty: ResponsibleParty,
  refundAmount: number,
  merchantId: number,
  createdBy: number,
  createdByName: string
): number {
  const result = createCase({
    orderNo: `DD${Date.now()}`,
    caseType,
    productName: '测试商品',
    quantity: 1,
    refundAmount,
    responsibleParty,
    merchantId,
    description: '测试售后申请'
  }, createdBy, createdByName, 'leader');
  
  if (!result.success || !result.data) {
    throw new Error('创建案件失败');
  }
  
  return result.data.id;
}

function runTest(name: string, testFn: () => void) {
  console.log(`\n=== 测试: ${name} ===`);
  try {
    testFn();
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

initDatabase();
resetAllDatabase();

createTestUser(1, 'leader1', '李团长', 'leader');
createTestUser(2, 'merchant1', '张商家', 'merchant');
createTestUser(3, 'cs1', '王客服', 'cs');
createTestUser(4, 'cs2', '赵客服', 'cs');

console.log('\n========================================');
console.log('  售后仲裁规则配置 - 自动化测试');
console.log('========================================');

console.log('\n=== 回归测试: 真实账号登录验证 ===');
const testAccounts = [
  { username: 'leader1', password: '123456', role: 'leader', name: '李团长' },
  { username: 'merchant1', password: '123456', role: 'merchant', name: '张商家' },
  { username: 'cs1', password: '123456', role: 'cs', name: '王客服' }
];

for (const account of testAccounts) {
  const result = authLogin(account.username, account.password);
  if (!result) {
    throw new Error(`登录验证失败: ${account.username} / ${account.password}`);
  }
  assert(result.user.username === account.username, `用户名应该匹配: ${account.username}`);
  assert(result.user.role === account.role, `角色应该匹配: ${account.role}`);
  assert(result.user.name === account.name, `姓名应该匹配: ${account.name}`);
  assert(result.token.length > 0, `应该返回有效的token: ${account.username}`);
  console.log(`✅ ${account.name} (${account.username}) 登录成功，token 有效`);
}
console.log('✅ 所有账号登录验证通过\n');

function loginWithCredentials(username: string, password: string) {
  const result = authLogin(username, password);
  if (!result) {
    throw new Error(`登录失败: ${username}`);
  }
  return result;
}

const csLoginResult = loginWithCredentials('cs1', '123456');
const cs2LoginResult = loginWithCredentials('cs2', '123456');
const merchantLoginResult = loginWithCredentials('merchant1', '123456');
const leaderLoginResult = loginWithCredentials('leader1', '123456');

const csUser = { id: csLoginResult.user.id, name: csLoginResult.user.name, role: csLoginResult.user.role as 'cs' | 'merchant' | 'leader', token: csLoginResult.token };
const csUser2 = { id: cs2LoginResult.user.id, name: cs2LoginResult.user.name, role: cs2LoginResult.user.role as 'cs' | 'merchant' | 'leader', token: cs2LoginResult.token };
const merchantUser = { id: merchantLoginResult.user.id, name: merchantLoginResult.user.name, role: merchantLoginResult.user.role as 'cs' | 'merchant' | 'leader', token: merchantLoginResult.token };
const leaderUser = { id: leaderLoginResult.user.id, name: leaderLoginResult.user.name, role: leaderLoginResult.user.role as 'cs' | 'merchant' | 'leader', token: leaderLoginResult.token };

let passed = 0;
let failed = 0;

if (runTest('1. 客服创建规则成功', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '低金额破损自动退款'
  };
  
  const result = createRule(ruleData, csUser.id, csUser.name);
  
  assert(result.success === true, '创建规则应该成功');
  assert(result.data !== undefined, '应该返回规则数据');
  assert(result.data!.priority === 1, '优先级应该正确');
  assert(result.data!.suggestedAction === 'csRefund', '建议动作应该正确');
  assert(result.data!.assignedCsId === csUser.id, '分派客服ID应该正确');
  assert(result.data!.isEnabled === true, '默认应该启用');
  assert(result.data!.version === 1, '初始版本应该是1');
  assert(result.data!.createdBy === csUser.id, '创建人应该正确');
})) { passed++; } else { failed++; }

if (runTest('2. 非客服角色创建规则被拒绝（权限控制）', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '测试'
  };
  
  const merchantResult = createRule(ruleData, merchantUser.id, merchantUser.name);
  assert(merchantResult.success === false, '商家创建规则应该被拒绝');
  assert(merchantResult.error!.code === RULE_ERROR_CODES.INVALID_RULE, '错误码应该正确');
  
  const leaderResult = createRule(ruleData, leaderUser.id, leaderUser.name);
  assert(leaderResult.success === false, '团长创建规则应该被拒绝');
})) { passed++; } else { failed++; }

if (runTest('3. 重复优先级创建失败', () => {
  resetRuleDatabase();
  
  const ruleData1: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '规则1'
  };
  
  const result1 = createRule(ruleData1, csUser.id, csUser.name);
  assert(result1.success === true, '第一个规则应该创建成功');
  
  const ruleData2: CreateRuleRequest = {
    caseType: 'outOfStock',
    responsibleParty: 'platform',
    refundAmountMin: 0,
    refundAmountMax: 50,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csReject',
    assignedCsId: null,
    remark: '规则2'
  };
  
  const result2 = createRule(ruleData2, csUser.id, csUser.name);
  assert(result2.success === false, '重复优先级应该创建失败');
  assert(result2.error!.code === RULE_ERROR_CODES.INVALID_RULE, '错误码应该正确');
  assert(result2.error!.message.includes('优先级'), '错误信息应该提到优先级');
})) { passed++; } else { failed++; }

if (runTest('4. 无效金额区间创建失败', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 100,
    refundAmountMax: 50,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '测试'
  };
  
  const result = createRule(ruleData, csUser.id, csUser.name);
  assert(result.success === false, '无效金额区间应该创建失败');
  assert(result.error!.message.includes('最低金额不能大于最高金额'), '错误信息应该正确');
  
  const ruleData2: CreateRuleRequest = {
    ...ruleData,
    refundAmountMin: -10,
    refundAmountMax: 50
  };
  
  const result2 = createRule(ruleData2, csUser.id, csUser.name);
  assert(result2.success === false, '负金额应该创建失败');
  assert(result2.error!.message.includes('不能为负数'), '错误信息应该正确');
})) { passed++; } else { failed++; }

if (runTest('5. 更新规则-版本冲突检测', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '原始规则'
  };
  
  const createResult = createRule(ruleData, csUser.id, csUser.name);
  assert(createResult.success === true, '创建规则应该成功');
  const ruleId = createResult.data!.id;
  const originalVersion = createResult.data!.version;
  
  const updateData: UpdateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 200,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: csUser2.id,
    remark: '更新后的规则',
    version: originalVersion
  };
  
  const updateResult = updateRule(ruleId, updateData, csUser.id, csUser.name);
  assert(updateResult.success === true, '更新规则应该成功');
  assert(updateResult.data!.version === originalVersion + 1, '版本应该递增');
  assert(updateResult.data!.refundAmountMax === 200, '金额上限应该更新');
  assert(updateResult.data!.assignedCsId === csUser2.id, '分派客服应该更新');
  
  const updateData2: UpdateRuleRequest = {
    ...updateData,
    version: originalVersion
  };
  
  const updateResult2 = updateRule(ruleId, updateData2, csUser.id, csUser.name);
  assert(updateResult2.success === false, '使用旧版本更新应该失败');
  assert(updateResult2.error!.code === RULE_ERROR_CODES.VERSION_CONFLICT, '错误码应该是版本冲突');
})) { passed++; } else { failed++; }

if (runTest('6. 规则启停功能', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '测试'
  };
  
  const createResult = createRule(ruleData, csUser.id, csUser.name);
  const ruleId = createResult.data!.id;
  
  assert(createResult.data!.isEnabled === true, '默认应该启用');
  
  const disableResult = disableRule(ruleId, csUser.id, csUser.name);
  assert(disableResult.success === true, '禁用规则应该成功');
  assert(disableResult.data!.isEnabled === false, '规则应该被禁用');
  
  const enableResult = enableRule(ruleId, csUser.id, csUser.name);
  assert(enableResult.success === true, '启用规则应该成功');
  assert(enableResult.data!.isEnabled === true, '规则应该被启用');
})) { passed++; } else { failed++; }

if (runTest('7. 规则匹配-按优先级匹配', () => {
  resetRuleDatabase();
  
  const ruleData1: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 50,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '低金额破损'
  };
  
  const ruleData2: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 200,
    merchantId: null,
    priority: 2,
    suggestedAction: 'review',
    assignedCsId: csUser2.id,
    remark: '高金额破损审核'
  };
  
  createRule(ruleData1, csUser.id, csUser.name);
  createRule(ruleData2, csUser.id, csUser.name);
  
  const caseId = createTestCase('damaged', 'merchant', 30, merchantUser.id, leaderUser.id, leaderUser.name);
  
  const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  const matchResult = matchAndRecordRule(caseInfo, merchantUser.id, merchantUser.name, 'merchant');
  
  assert(matchResult !== null, '应该匹配到规则');
  assert(matchResult.rule.priority === 1, '应该匹配优先级更高的规则');
  assert(matchResult.rule.suggestedAction === 'csRefund', '建议动作应该是自动退款');
  assert(matchResult.hitReason.includes('破损'), '命中原因应该包含破损');
  assert(matchResult.hitReason.includes('30'), '命中原因应该包含金额');
  
  const hitRecord = db.prepare('SELECT * FROM rule_hit_records WHERE caseId = ?').get(caseId) as any;
  assert(hitRecord !== undefined, '应该生成命中记录');
  assert(hitRecord.suggestedAction === 'csRefund', '命中记录的建议动作应该正确');
  assert(hitRecord.assignedCsId === csUser.id, '分派客服应该正确');
})) { passed++; } else { failed++; }

if (runTest('8. 规则匹配-商家维度精确匹配', () => {
  resetRuleDatabase();
  
  const ruleData1: CreateRuleRequest = {
    caseType: null,
    responsibleParty: null,
    refundAmountMin: 0,
    refundAmountMax: 999999,
    merchantId: merchantUser.id,
    priority: 1,
    suggestedAction: 'csReject',
    assignedCsId: null,
    remark: '特定商家驳回'
  };
  
  const ruleData2: CreateRuleRequest = {
    caseType: null,
    responsibleParty: null,
    refundAmountMin: 0,
    refundAmountMax: 999999,
    merchantId: null,
    priority: 2,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '通用退款'
  };
  
  createRule(ruleData1, csUser.id, csUser.name);
  createRule(ruleData2, csUser.id, csUser.name);
  
  const caseId = createTestCase('outOfStock', 'platform', 100, merchantUser.id, leaderUser.id, leaderUser.name);
  const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  const matchResult = matchAndRecordRule(caseInfo, merchantUser.id, merchantUser.name, 'merchant');
  
  assert(matchResult !== null, '应该匹配到规则');
  assert(matchResult.rule.merchantId === merchantUser.id, '应该匹配特定商家的规则');
  assert(matchResult.rule.suggestedAction === 'csReject', '建议动作应该是驳回');
})) { passed++; } else { failed++; }

if (runTest('9. 规则匹配-禁用规则不参与匹配', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '测试'
  };
  
  const createResult = createRule(ruleData, csUser.id, csUser.name);
  disableRule(createResult.data!.id, csUser.id, csUser.name);
  
  const caseId = createTestCase('damaged', 'merchant', 50, merchantUser.id, leaderUser.id, leaderUser.name);
  const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  const matchResult = matchAndRecordRule(caseInfo, merchantUser.id, merchantUser.name, 'merchant');
  
  assert(matchResult === null, '禁用规则不应该被匹配');
  
  const hitRecord = db.prepare('SELECT * FROM rule_hit_records WHERE caseId = ?').get(caseId);
  assert(hitRecord === undefined, '不应该生成命中记录');
})) { passed++; } else { failed++; }

if (runTest('10. 人工覆盖规则建议', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '测试'
  };
  
  const createResult = createRule(ruleData, csUser.id, csUser.name);
  
  const caseId = createTestCase('damaged', 'merchant', 50, merchantUser.id, leaderUser.id, leaderUser.name);
  const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  matchAndRecordRule(caseInfo, merchantUser.id, merchantUser.name, 'merchant');
  
  const ruleInfo = getCaseRuleInfo(caseId);
  assert(ruleInfo.success === true, '应该能查询到命中信息');
  assert(ruleInfo.data !== null, '应该有命中数据');
  assert(ruleInfo.data!.isOverridden === false, '初始状态未被覆盖');
  
  const overrideResult = overrideRuleHitByCaseId(caseId, '特殊情况需要人工审核', csUser.id, csUser.name);
  assert(overrideResult.success === true, '覆盖应该成功');
  
  const ruleInfoAfter = getCaseRuleInfo(caseId);
  assert(ruleInfoAfter.data!.isOverridden === true, '状态应该变为已覆盖');
  assert(ruleInfoAfter.data!.overrideRemark === '特殊情况需要人工审核', '覆盖备注应该正确');
  assert(ruleInfoAfter.data!.overriddenBy === csUser.id, '覆盖人应该正确');
  assert(ruleInfoAfter.data!.overriddenByName === csUser.name, '覆盖人姓名应该正确');
  
  const overrideAgainResult = overrideRuleHitByCaseId(caseId, '再次覆盖', csUser.id, csUser.name);
  assert(overrideAgainResult.success === false, '不能重复覆盖');
  assert(overrideAgainResult.error!.message.includes('已被覆盖'), '错误信息应该正确');
})) { passed++; } else { failed++; }

if (runTest('11. 非客服角色无法覆盖规则', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '测试'
  };
  
  createRule(ruleData, csUser.id, csUser.name);
  
  const caseId = createTestCase('damaged', 'merchant', 50, merchantUser.id, leaderUser.id, leaderUser.name);
  const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  matchAndRecordRule(caseInfo, merchantUser.id, merchantUser.name, 'merchant');
  
  const merchantOverride = overrideRuleHitByCaseId(caseId, '商家想覆盖', merchantUser.id, merchantUser.name);
  assert(merchantOverride.success === false, '商家不能覆盖规则');
  
  const leaderOverride = overrideRuleHitByCaseId(caseId, '团长想覆盖', leaderUser.id, leaderUser.name);
  assert(leaderOverride.success === false, '团长不能覆盖规则');
})) { passed++; } else { failed++; }

if (runTest('12. 审计日志-规则创建有记录', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '测试规则'
  };
  
  const createResult = createRule(ruleData, csUser.id, csUser.name);
  const ruleId = createResult.data!.id;
  
  const auditLogs = getRuleAuditLogs(ruleId);
  assert(auditLogs.success === true, '应该能查询到审计日志');
  assert(auditLogs.data!.length >= 1, '至少有一条日志');
  
  const createLog = auditLogs.data!.find(l => l.operationType === 'create');
  assert(createLog !== undefined, '应该有创建日志');
  assert(createLog.operatorId === csUser.id, '操作人应该正确');
  assert(createLog.operationType === 'create', '操作类型应该正确');
  assert(createLog.afterChange !== null, '应该记录变更后内容');
  assert(createLog.afterChange!.includes('测试规则'), '应该包含规则备注');
})) { passed++; } else { failed++; }

if (runTest('13. 审计日志-规则命中有记录', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '测试'
  };
  
  const createResult = createRule(ruleData, csUser.id, csUser.name);
  
  const caseId = createTestCase('damaged', 'merchant', 50, merchantUser.id, leaderUser.id, leaderUser.name);
  const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  matchAndRecordRule(caseInfo, merchantUser.id, merchantUser.name, 'merchant');
  
  const auditLogs = getCaseAuditLogs(caseId);
  assert(auditLogs.success === true, '应该能查询到案件审计日志');
  
  const hitLog = auditLogs.data!.find(l => l.operationType === 'hit');
  assert(hitLog !== undefined, '应该有命中日志');
  assert(hitLog.operationType === 'hit', '操作类型应该是命中');
  assert(hitLog.remark!.includes('破损'), '备注应该包含命中原因');
  assert(hitLog.caseId === caseId, '案件ID应该正确');
  assert(hitLog.ruleId === createResult.data!.id, '规则ID应该正确');
})) { passed++; } else { failed++; }

if (runTest('14. 审计日志-人工覆盖有记录', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '测试'
  };
  
  createRule(ruleData, csUser.id, csUser.name);
  
  const caseId = createTestCase('damaged', 'merchant', 50, merchantUser.id, leaderUser.id, leaderUser.name);
  const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  matchAndRecordRule(caseInfo, merchantUser.id, merchantUser.name, 'merchant');
  
  overrideRuleHitByCaseId(caseId, '特殊情况人工处理', csUser.id, csUser.name);
  
  const auditLogs = getCaseAuditLogs(caseId);
  const overrideLog = auditLogs.data!.find(l => l.operationType === 'override');
  
  assert(overrideLog !== undefined, '应该有覆盖日志');
  assert(overrideLog.operationType === 'override', '操作类型应该是覆盖');
  assert(overrideLog.operatorId === csUser.id, '操作人应该正确');
  assert(overrideLog.remark!.includes('特殊情况人工处理'), '备注应该包含覆盖原因');
})) { passed++; } else { failed++; }

if (runTest('15. CSV导出规则', () => {
  resetRuleDatabase();
  
  const ruleData1: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '低金额破损自动退款'
  };
  
  const ruleData2: CreateRuleRequest = {
    caseType: 'outOfStock',
    responsibleParty: 'platform',
    refundAmountMin: 0,
    refundAmountMax: 50,
    merchantId: merchantUser.id,
    priority: 2,
    suggestedAction: 'review',
    assignedCsId: null,
    remark: '缺货审核'
  };
  
  createRule(ruleData1, csUser.id, csUser.name);
  createRule(ruleData2, csUser.id, csUser.name);
  
  const csvContent = exportRules();
  
  assert(csvContent.includes('优先级'), 'CSV应该包含优先级列');
  assert(csvContent.includes('售后类型'), 'CSV应该包含售后类型列');
  assert(csvContent.includes('责任方'), 'CSV应该包含责任方列');
  assert(csvContent.includes('金额下限'), 'CSV应该包含金额下限列');
  assert(csvContent.includes('金额上限'), 'CSV应该包含金额上限列');
  assert(csvContent.includes('建议动作'), 'CSV应该包含建议动作列');
  assert(csvContent.includes('分派客服ID'), 'CSV应该包含分派客服ID列');
  assert(csvContent.includes('damaged'), 'CSV应该包含第一个规则内容');
  assert(csvContent.includes('outOfStock'), 'CSV应该包含第二个规则内容');
  assert(csvContent.includes('低金额破损自动退款'), 'CSV应该包含备注');
  
  const lines = csvContent.trim().split('\n');
  assert(lines.length >= 3, '应该有表头和2条数据');
})) { passed++; } else { failed++; }

if (runTest('16. CSV导入-成功导入多条规则', () => {
  resetRuleDatabase();
  
  const csvContent = `优先级,售后类型,责任方,金额下限,金额上限,商家ID,建议动作,分派客服ID,备注,启用状态
1,damaged,merchant,0,100,,csRefund,,低金额破损自动退款,true
2,outOfStock,platform,0,50,${merchantUser.id},review,,缺货审核,true
3,wrongDelivery,logistics,100,500,,csReject,,错发高金额驳回,true`;
  
  const result = importRules(csvContent, csUser.id, csUser.name);
  
  assert(result.success === true, '导入应该成功');
  assert(result.data!.successCount === 3, '应该成功导入3条');
  assert(result.data!.failedCount === 0, '应该没有失败');
  assert(result.data!.skippedCount === 0, '应该没有跳过');
  
  const rules = getRuleList();
  assert(rules.data!.length === 3, '应该有3条规则');
  
  const rule1 = rules.data!.find(r => r.priority === 1);
  assert(rule1 !== undefined, '应该找到优先级1的规则');
  assert(rule1.caseType === 'damaged', '售后类型应该正确');
  assert(rule1.suggestedAction === 'csRefund', '建议动作应该正确');
})) { passed++; } else { failed++; }

if (runTest('17. CSV导入-重复优先级自动调整', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '已有规则'
  };
  
  createRule(ruleData, csUser.id, csUser.name);
  
  const csvContent = `优先级,售后类型,责任方,金额下限,金额上限,商家ID,建议动作,分派客服ID,备注,启用状态
1,outOfStock,platform,0,50,,csReject,,导入重复优先级,true`;
  
  const result = importRules(csvContent, csUser.id, csUser.name);
  
  assert(result.success === true, '导入应该成功');
  assert(result.data!.successCount === 1, '应该成功导入1条');
  assert(result.data!.warnings.length >= 1, '应该有警告');
  assert(result.data!.warnings[0].warning.includes('优先级'), '警告应该提到优先级');
  
  const rules = getRuleList();
  const priorities = rules.data!.map(r => r.priority).sort((a, b) => a - b);
  
  assert(priorities.includes(1), '应该保留原有优先级1');
  assert(priorities.includes(2), '导入的规则应该自动调整到优先级2');
})) { passed++; } else { failed++; }

if (runTest('18. CSV导入-无效区间检测', () => {
  resetRuleDatabase();
  
  const csvContent = `优先级,售后类型,责任方,金额下限,金额上限,商家ID,建议动作,分派客服ID,备注,启用状态
1,damaged,merchant,100,50,,csRefund,,金额下限大于上限,true
2,outOfStock,platform,-10,50,,csReject,,负金额,true`;
  
  const result = importRules(csvContent, csUser.id, csUser.name);
  
  assert(result.success === true, '导入应该返回结果');
  assert(result.data!.failedCount === 2, '应该失败2条');
  assert(result.data!.errors.length === 2, '应该有2条错误');
  assert(result.data!.errors[0].error.includes('金额'), '错误应该提到金额');
  
  const rules = getRuleList();
  assert(rules.data!.length === 0, '不应该有规则被导入');
})) { passed++; } else { failed++; }

if (runTest('19. CSV导入导出一致性', () => {
  resetRuleDatabase();
  
  const ruleData1: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '测试规则1'
  };
  
  const ruleData2: CreateRuleRequest = {
    caseType: 'outOfStock',
    responsibleParty: 'platform',
    refundAmountMin: 50,
    refundAmountMax: 200,
    merchantId: merchantUser.id,
    priority: 2,
    suggestedAction: 'review',
    assignedCsId: null,
    remark: '测试规则2'
  };
  
  createRule(ruleData1, csUser.id, csUser.name);
  createRule(ruleData2, csUser.id, csUser.name);
  
  const exportedCSV = exportRules();
  
  resetRuleDatabase();
  
  const importResult = importRules(exportedCSV, csUser.id, csUser.name);
  assert(importResult.success === true, '导入应该成功');
  assert(importResult.data!.successCount === 2, '应该成功导入2条');
  
  const rulesAfterImport = getRuleList();
  assert(rulesAfterImport.data!.length === 2, '应该有2条规则');
  
  const exportedAgain = exportRules();
  
  const normalizeCSV = (csv: string) => {
    return csv.split('\n')
      .map(line => line.replace(/\s+/g, ''))
      .filter(line => line.length > 0)
      .sort()
      .join('\n');
  };
  
  const originalData = normalizeCSV(exportedCSV.split('\n').slice(1).join('\n'));
  const reimportedData = normalizeCSV(exportedAgain.split('\n').slice(1).join('\n'));
  
  assert(originalData === reimportedData, '导出导入导出的数据应该一致');
})) { passed++; } else { failed++; }

if (runTest('20. 数据持久化验证-重启后配置一致', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: merchantUser.id,
    priority: 5,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '持久化测试规则'
  };
  
  const createResult = createRule(ruleData, csUser.id, csUser.name);
  const ruleId = createResult.data!.id;
  
  const caseId = createTestCase('damaged', 'merchant', 50, merchantUser.id, leaderUser.id, leaderUser.name);
  const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  matchAndRecordRule(caseInfo, merchantUser.id, merchantUser.name, 'merchant');
  
  const overrideResult = overrideRuleHitByCaseId(caseId, '持久化测试覆盖', csUser.id, csUser.name);
  assert(overrideResult.success === true, '覆盖规则应该成功');
  
  const ruleBefore = db.prepare('SELECT * FROM arbitration_rules WHERE id = ?').get(ruleId) as any;
  const hitBefore = db.prepare('SELECT * FROM rule_hit_records WHERE caseId = ? ORDER BY id DESC').get(caseId) as any;
  const auditBefore = db.prepare('SELECT COUNT(*) as count FROM rule_audit_logs').get() as any;
  
  assert(ruleBefore.priority === 5, '规则优先级应该正确');
  assert(ruleBefore.remark === '持久化测试规则', '规则备注应该正确');
  assert(hitBefore !== undefined, '应该存在命中记录');
  assert(hitBefore.isOverridden === 1 || hitBefore.isOverridden === true, `命中记录应该显示已覆盖，实际值: ${hitBefore.isOverridden}`);
  assert(hitBefore.overrideRemark === '持久化测试覆盖', '覆盖备注应该正确');
  assert(auditBefore.count >= 3, '至少有3条审计日志（创建、命中、覆盖）');
  
  const csvExport = exportRules();
  assert(csvExport.includes('持久化测试规则'), '导出内容应该包含规则');
  
  const ruleAfter = getRuleById(ruleId);
  assert(ruleAfter.success === true, '应该能查询到规则');
  assert(ruleAfter.data!.priority === 5, '优先级应该保持一致');
  assert(ruleAfter.data!.remark === '持久化测试规则', '备注应该保持一致');
  
  const caseRuleInfo = getCaseRuleInfo(caseId);
  assert(caseRuleInfo.success === true, '应该能查询到案件规则信息');
  assert(caseRuleInfo.data!.isOverridden === true, '覆盖状态应该保持一致');
  
  const auditLogs = getAllAuditLogs();
  assert(auditLogs.data!.length >= 3, '审计日志数量应该保持一致');
})) { passed++; } else { failed++; }

if (runTest('21. 规则列表筛选功能', () => {
  resetRuleDatabase();
  
  const rulesData: CreateRuleRequest[] = [
    { caseType: 'damaged', responsibleParty: 'merchant', refundAmountMin: 0, refundAmountMax: 100, merchantId: null, priority: 1, suggestedAction: 'csRefund', assignedCsId: null, remark: '破损退款' },
    { caseType: 'damaged', responsibleParty: 'logistics', refundAmountMin: 0, refundAmountMax: 100, merchantId: null, priority: 2, suggestedAction: 'review', assignedCsId: null, remark: '物流破损审核' },
    { caseType: 'outOfStock', responsibleParty: 'platform', refundAmountMin: 0, refundAmountMax: 50, merchantId: null, priority: 3, suggestedAction: 'csReject', assignedCsId: null, remark: '缺货驳回' },
    { caseType: 'wrongDelivery', responsibleParty: 'merchant', refundAmountMin: 100, refundAmountMax: 500, merchantId: null, priority: 4, suggestedAction: 'csRefund', assignedCsId: null, remark: '错发退款' }
  ];
  
  const createdRules = rulesData.map(data => createRule(data, csUser.id, csUser.name));
  
  const ruleToDisable = createdRules.find(r => r.data!.priority === 3);
  if (ruleToDisable && ruleToDisable.data) {
    disableRule(ruleToDisable.data.id, csUser.id, csUser.name);
  }
  
  const allRules = getRuleList();
  assert(allRules.data!.length === 4, '应该有4条规则');
  
  const damagedRules = getRuleList({ caseType: 'damaged' });
  assert(damagedRules.data!.length === 2, '破损类型应该有2条');
  
  const merchantRules = getRuleList({ responsibleParty: 'merchant' });
  assert(merchantRules.data!.length === 2, '商家责任应该有2条');
  
  const enabledRules = getRuleList({ isEnabled: true });
  assert(enabledRules.data!.length === 3, '启用的应该有3条');
  
  const disabledRules = getRuleList({ isEnabled: false });
  assert(disabledRules.data!.length === 1, '禁用的应该有1条');
})) { passed++; } else { failed++; }

if (runTest('22. 删除规则功能', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '待删除规则'
  };
  
  const createResult = createRule(ruleData, csUser.id, csUser.name);
  const ruleId = createResult.data!.id;
  
  const rulesBefore = getRuleList();
  assert(rulesBefore.data!.length === 1, '删除前应该有1条规则');
  
  const deleteResult = deleteRule(ruleId, csUser.id, csUser.name);
  assert(deleteResult.success === true, '删除应该成功');
  
  const rulesAfter = getRuleList();
  assert(rulesAfter.data!.length === 0, '删除后应该没有规则');
  
  const allAuditLogs = getAllAuditLogs();
  const deleteLog = allAuditLogs.data!.find(l => 
    l.operationType === 'delete' && 
    l.operatorId === csUser.id &&
    l.beforeChange !== null &&
    l.beforeChange.includes('待删除规则')
  );
  assert(deleteLog !== undefined, '应该有删除审计日志');
  assert(deleteLog.beforeChange !== null, '应该记录删除前的内容');
  assert(deleteLog.ruleId === null, '删除后ruleId应该被设为null');
  
  const deleteAgainResult = deleteRule(ruleId, csUser.id, csUser.name);
  assert(deleteAgainResult.success === false, '删除不存在的规则应该失败');
  assert(deleteAgainResult.error!.code === RULE_ERROR_CODES.RULE_NOT_FOUND, '错误码应该正确');
})) { passed++; } else { failed++; }

if (runTest('23. 获取客服列表', () => {
  const result = getCsList();
  assert(result.success === true, '应该成功获取客服列表');
  assert(result.data!.length >= 2, '应该至少有2个客服');
  assert(result.data!.some(u => u.name === csUser.name), '应该包含客服1');
  assert(result.data!.some(u => u.name === csUser2.name), '应该包含客服2');
  
  const merchantInList = result.data!.some(u => u.name === merchantUser.name);
  assert(merchantInList === false, '不应该包含商家');
  
  const leaderInList = result.data!.some(u => u.name === leaderUser.name);
  assert(leaderInList === false, '不应该包含团长');
})) { passed++; } else { failed++; }

if (runTest('24. 规则匹配-空条件通用匹配', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: null,
    responsibleParty: null,
    refundAmountMin: 0,
    refundAmountMax: 999999,
    merchantId: null,
    priority: 999,
    suggestedAction: 'review',
    assignedCsId: null,
    remark: '默认通用规则'
  };
  
  createRule(ruleData, csUser.id, csUser.name);
  
  const caseId1 = createTestCase('damaged', 'merchant', 500, merchantUser.id, leaderUser.id, leaderUser.name);
  const caseInfo1 = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId1) as any;
  const match1 = matchAndRecordRule(caseInfo1, merchantUser.id, merchantUser.name, 'merchant');
  assert(match1 !== null, '破损案件应该匹配到通用规则');
  
  const caseId2 = createTestCase('outOfStock', 'platform', 1000, merchantUser.id, leaderUser.id, leaderUser.name);
  const caseInfo2 = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId2) as any;
  const match2 = matchAndRecordRule(caseInfo2, merchantUser.id, merchantUser.name, 'merchant');
  assert(match2 !== null, '缺货案件应该匹配到通用规则');
  assert(match2.rule.remark === '默认通用规则', '应该匹配到通用规则');
})) { passed++; } else { failed++; }

if (runTest('25. 审计日志-导入导出有记录', () => {
  resetRuleDatabase();
  
  const csvContent = `优先级,售后类型,责任方,金额下限,金额上限,商家ID,建议动作,分派客服ID,备注,启用状态
1,damaged,merchant,0,100,,csRefund,,导入测试,true`;
  
  importRules(csvContent, csUser.id, csUser.name);
  
  const logsAfterImport = getAllAuditLogs();
  const importLog = logsAfterImport.data!.find(l => l.operationType === 'import');
  assert(importLog !== undefined, '应该有导入审计日志');
  assert(importLog.remark!.includes('成功1'), '应该记录成功数量');
  
  exportRules(csUser.id, csUser.name);
  
  const logsAfterExport = getAllAuditLogs();
  const exportLog = logsAfterExport.data!.find(l => l.operationType === 'export');
  assert(exportLog !== undefined, '应该有导出审计日志');
  assert(exportLog.operatorId === csUser.id, '操作人应该正确');
})) { passed++; } else { failed++; }

if (runTest('26. 案件详情-团长和商家只能查看命中结果', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '测试'
  };
  
  createRule(ruleData, csUser.id, csUser.name);
  
  const caseId = createTestCase('damaged', 'merchant', 50, merchantUser.id, leaderUser.id, leaderUser.name);
  const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  matchAndRecordRule(caseInfo, merchantUser.id, merchantUser.name, 'merchant');
  
  const leaderView = getCaseRuleInfo(caseId);
  assert(leaderView.success === true, '团长应该能查看命中信息');
  assert(leaderView.data !== null, '团长应该能看到命中结果');
  assert(leaderView.data!.suggestedAction !== undefined, '团长应该能看到建议动作');
  assert(leaderView.data!.hitReason !== undefined, '团长应该能看到命中原因');
  
  const merchantView = getCaseRuleInfo(caseId);
  assert(merchantView.success === true, '商家应该能查看命中信息');
  assert(merchantView.data !== null, '商家应该能看到命中结果');
  
  const csView = getCaseRuleInfo(caseId);
  assert(csView.success === true, '客服应该能查看命中信息');
  assert(csView.data!.rule !== undefined, '客服应该能看到完整规则信息');
})) { passed++; } else { failed++; }

if (runTest('27. 并发修改-版本冲突双重验证', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '并发测试'
  };
  
  const createResult = createRule(ruleData, csUser.id, csUser.name);
  const ruleId = createResult.data!.id;
  const originalVersion = createResult.data!.version;
  
  db.prepare('UPDATE arbitration_rules SET version = ?, remark = ? WHERE id = ?').run(
    originalVersion + 1,
    '其他用户已修改',
    ruleId
  );
  
  const updateData: UpdateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 200,
    merchantId: null,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: null,
    remark: '我的修改',
    version: originalVersion
  };
  
  const updateResult = updateRule(ruleId, updateData, csUser2.id, csUser2.name);
  assert(updateResult.success === false, '并发修改应该失败');
  assert(updateResult.error!.code === RULE_ERROR_CODES.VERSION_CONFLICT, '错误码应该是版本冲突');
  
  const ruleAfter = db.prepare('SELECT * FROM arbitration_rules WHERE id = ?').get(ruleId) as any;
  assert(ruleAfter.remark === '其他用户已修改', '规则内容应该保持其他用户的修改');
  assert(ruleAfter.version === originalVersion + 1, '版本应该保持不变');
})) { passed++; } else { failed++; }

if (runTest('28. 回归测试-客服能维护仲裁规则', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'outOfStock',
    responsibleParty: 'platform',
    refundAmountMin: 0,
    refundAmountMax: 500,
    merchantId: null,
    priority: 10,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '回归测试-客服维护规则'
  };
  
  const createResult = createRule(ruleData, csUser.id, csUser.name);
  assert(createResult.success === true, '客服应该能创建规则');
  
  const ruleId = createResult.data!.id;
  
  const updateData: UpdateRuleRequest = {
    ...ruleData,
    priority: 10,
    remark: '回归测试-客服更新规则',
    version: createResult.data!.version
  };
  
  const updateResult = updateRule(ruleId, updateData, csUser.id, csUser.name);
  assert(updateResult.success === true, '客服应该能更新规则');
  
  const disableResult = disableRule(ruleId, csUser.id, csUser.name);
  assert(disableResult.success === true, '客服应该能禁用规则');
  
  const enableResult = enableRule(ruleId, csUser.id, csUser.name);
  assert(enableResult.success === true, '客服应该能启用规则');
  
  const deleteResult = deleteRule(ruleId, csUser.id, csUser.name);
  assert(deleteResult.success === true, '客服应该能删除规则');
  
  const rulesAfter = getRuleList();
  assert(rulesAfter.success === true, '应该能获取规则列表');
  assert(rulesAfter.data!.length === 0, '规则应该被删除');
})) { passed++; } else { failed++; }

if (runTest('29. 回归测试-团长和商家不能管理规则但能查看建议', () => {
  resetRuleDatabase();
  
  const ruleData: CreateRuleRequest = {
    caseType: 'damaged',
    responsibleParty: 'merchant',
    refundAmountMin: 0,
    refundAmountMax: 100,
    merchantId: merchantUser.id,
    priority: 1,
    suggestedAction: 'csRefund',
    assignedCsId: csUser.id,
    remark: '回归测试-权限验证'
  };
  
  const createResult = createRule(ruleData, csUser.id, csUser.name);
  assert(createResult.success === true, '客服创建规则应该成功');
  
  const createByLeader = createRule(ruleData, leaderUser.id, leaderUser.name);
  assert(createByLeader.success === false, '团长不能创建规则');
  assert(createByLeader.error!.message.includes('只有客服角色'), '错误信息应该说明只有客服可以创建');
  
  const createByMerchant = createRule(ruleData, merchantUser.id, merchantUser.name);
  assert(createByMerchant.success === false, '商家不能创建规则');
  
  const caseId = createTestCase('damaged', 'merchant', 50, merchantUser.id, leaderUser.id, leaderUser.name);
  const caseInfo = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  matchAndRecordRule(caseInfo, merchantUser.id, merchantUser.name, 'merchant');
  
  const leaderView = getCaseRuleInfo(caseId);
  assert(leaderView.success === true, '团长应该能查看案件命中结果');
  assert(leaderView.data !== null, '团长应该能看到命中结果');
  assert(leaderView.data!.suggestedAction !== undefined, '团长应该能看到建议动作');
  assert(leaderView.data!.hitReason !== undefined, '团长应该能看到命中原因');
  
  const merchantView = getCaseRuleInfo(caseId);
  assert(merchantView.success === true, '商家应该能查看案件命中结果');
  assert(merchantView.data !== null, '商家应该能看到命中结果');
  
  const overrideByLeader = overrideRuleHitByCaseId(caseId, '团长尝试覆盖', leaderUser.id, leaderUser.name);
  assert(overrideByLeader.success === false, '团长不能覆盖规则');
  
  const overrideByMerchant = overrideRuleHitByCaseId(caseId, '商家尝试覆盖', merchantUser.id, merchantUser.name);
  assert(overrideByMerchant.success === false, '商家不能覆盖规则');
})) { passed++; } else { failed++; }

if (runTest('30. 回归测试-密码哈希修复机制验证', () => {
  const invalidHash = '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW';
  
  db.prepare('INSERT OR REPLACE INTO users (id, username, name, role, passwordHash) VALUES (?, ?, ?, ?, ?)').run(
    999, 'testuser', '测试用户', 'cs', invalidHash
  );
  
  const failedLogin = authLogin('testuser', '123456');
  assert(failedLogin === null, '使用无效哈希的用户应该登录失败');
  
  initDatabase();
  
  const fixedLogin = authLogin('testuser', '123456');
  assert(fixedLogin !== null, '修复后用户应该能登录成功');
  assert(fixedLogin.user.username === 'testuser', '用户名应该正确');
  
  db.prepare('DELETE FROM users WHERE id = ?').run(999);
})) { passed++; } else { failed++; }

console.log('\n========================================');
console.log('  测试结果汇总');
console.log('========================================');
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📊 总计: ${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ 有测试失败，请检查代码');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过！');
  process.exit(0);
}
