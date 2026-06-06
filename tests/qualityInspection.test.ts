import { db, initDatabase } from '../api/db/index.js';
import {
  CreateQualityInspectionResponse,
  QUALITY_INSPECTION_ERROR_CODES,
  ERROR_CODES
} from '../shared/types.js';
import {
  previewQualityInspection,
  createQualityInspection,
  getQualityInspectionList,
  getQualityInspectionDetail,
  getQualityInspectionItemDetail,
  inspectQualityItem,
  batchInspectQualityItems,
  exportQualityInspectionCSV,
  importQualityInspectionItems,
  getQualityInspectionOperationLogs
} from '../api/services/qualityInspectionService.js';
import { login as authLogin } from '../api/services/authService.js';

function resetDatabase() {
  db.exec('DELETE FROM compensation_commitment_operation_logs');
  db.exec('DELETE FROM compensation_commitments');
  db.exec('DELETE FROM quality_inspection_operation_logs');
  db.exec('DELETE FROM quality_inspection_reviews');
  db.exec('DELETE FROM quality_inspection_items');
  db.exec('DELETE FROM quality_inspections');
  db.exec('DELETE FROM rule_audit_logs');
  db.exec('DELETE FROM rule_hit_records');
  db.exec('DELETE FROM evidences');
  db.exec('DELETE FROM case_versions');
  db.exec('DELETE FROM batch_revoke_items');
  db.exec('DELETE FROM batch_revoke_audits');
  db.exec('DELETE FROM batch_items');
  db.exec('DELETE FROM batch_operations');
  db.exec('DELETE FROM cases');
}

function createFinishedCases() {
  const insertCase = db.prepare(`
    INSERT INTO cases (
      orderNo, caseType, productName, quantity, refundAmount,
      responsibleParty, merchantId, merchantName, description,
      status, version, createdBy, createdByName, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const insertVersion = db.prepare(`
    INSERT INTO case_versions (
      caseId, version, fromStatus, toStatus, action,
      operatorId, operatorName, operatorRole, remark, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const insertEvidence = db.prepare(`
    INSERT INTO evidences (
      caseId, version, uploaderId, evidenceType, evidenceUrl, remark
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const cases = [
    { orderNo: 'DD20260601001', status: 'refundCompleted', version: 4, refundAmount: 58.00, caseType: 'damaged', responsibleParty: 'merchant' },
    { orderNo: 'DD20260601002', status: 'refundCompleted', version: 4, refundAmount: 128.50, caseType: 'outOfStock', responsibleParty: 'platform' },
    { orderNo: 'DD20260601003', status: 'rejected', version: 4, refundAmount: 89.90, caseType: 'wrongDelivery', responsibleParty: 'logistics' },
    { orderNo: 'DD20260601004', status: 'refundCompleted', version: 4, refundAmount: 45.00, caseType: 'damaged', responsibleParty: 'merchant' },
    { orderNo: 'DD20260601005', status: 'rejected', version: 4, refundAmount: 200.00, caseType: 'damaged', responsibleParty: 'merchant' }
  ];

  const caseIds: number[] = [];
  cases.forEach((c, index) => {
    const result = insertCase.run(
      c.orderNo,
      c.caseType,
      `测试商品${index + 1}`,
      index + 1,
      c.refundAmount,
      c.responsibleParty,
      2,
      '张商家',
      '测试售后申请',
      c.status,
      c.version,
      1,
      '李团长'
    );
    const caseId = result.lastInsertRowid as number;
    caseIds.push(caseId);

    insertVersion.run(caseId, 1, null, 'pendingEvidence', 'create', 1, '李团长', 'leader', '创建申请');
    insertVersion.run(caseId, 2, 'pendingEvidence', 'merchantProcessing', 'submitEvidence', 1, '李团长', 'leader', '提交凭证');
    insertVersion.run(caseId, 3, 'merchantProcessing', 'csArbitration', 'merchantRespond', 2, '张商家', 'merchant', '商家响应');
    insertVersion.run(caseId, 4, 'csArbitration', c.status, c.status === 'refundCompleted' ? 'csRefund' : 'csReject', 3, '王客服', 'cs', `裁决：${c.status === 'refundCompleted' ? '同意退款' : '驳回'}`);

    insertEvidence.run(caseId, 2, 1, 'image', `https://example.com/evidence${caseId}.jpg`, '凭证照片');
  });

  return caseIds;
}

function login(username: string, password: string): { token: string; user: { id: number; name: string; role: 'cs' | 'merchant' | 'leader' } } {
  const result = authLogin(username, password);
  
  if (!result) {
    throw new Error(`登录失败: 用户名 ${username} 或密码错误`);
  }

  return {
    token: result.token,
    user: {
      id: result.user.id,
      name: result.user.name,
      role: result.user.role as 'cs' | 'merchant' | 'leader'
    }
  };
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

console.log('\n========================================');
console.log('  客服质检抽查模块 - 自动化测试');
console.log('========================================');

const csUser = login('cs1', '123456');
const merchantUser = login('merchant1', '123456');
const leaderUser = login('leader1', '123456');

let passed = 0;
let failed = 0;
let testInspectionId = 0;
let testInspectionNo = '';
let testItemId = 0;
let exportedCSVContent = '';

if (runTest('1. 越权调用-团长/商家创建抽查单被拒绝', () => {
  resetDatabase();
  createFinishedCases();

  const merchantResult = createQualityInspection(
    {
      title: '商家越权测试',
      startDate: '2026-06-01',
      endDate: '2026-06-06'
    },
    merchantUser.user.id,
    merchantUser.user.name,
    merchantUser.user.role
  );

  assert(merchantResult.success === false, '商家创建应该被拒绝');
  assert(merchantResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码应该是权限拒绝');
  assert(merchantResult.error!.message.includes('仅客服可执行此操作'), '错误信息应该说明仅客服可执行');

  const leaderResult = createQualityInspection(
    {
      title: '团长越权测试',
      startDate: '2026-06-01',
      endDate: '2026-06-06'
    },
    leaderUser.user.id,
    leaderUser.user.name,
    leaderUser.user.role
  );

  assert(leaderResult.success === false, '团长创建应该被拒绝');
  assert(leaderResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码应该是权限拒绝');
  assert(leaderResult.error!.message.includes('仅客服可执行此操作'), '错误信息应该说明仅客服可执行');
})) { passed++; } else { failed++; }

if (runTest('2. 成功创建质检抽查单（按条件筛选）', () => {
  resetDatabase();
  const caseIds = createFinishedCases();

  const previewResult = previewQualityInspection({
    startDate: '2026-06-01',
    endDate: '2026-06-06',
    userRole: csUser.user.role
  });

  assert(previewResult.success === true, '预览应该成功');
  assert(previewResult.data!.caseCount === 5, '应该有5个符合条件的案件');

  const createResult = createQualityInspection(
    {
      title: '2026年6月上旬质检',
      startDate: '2026-06-01',
      endDate: '2026-06-06'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(createResult.success === true, '创建应该成功');
  assert(createResult.data!.totalCount === 5, '应该有5笔案件');
  assert(createResult.data!.inspectionNo.startsWith('QI-'), '抽查单号格式应该正确');

  testInspectionId = createResult.data!.inspectionId;
  testInspectionNo = createResult.data!.inspectionNo;
})) { passed++; } else { failed++; }

if (runTest('3. 按售后类型筛选创建抽查单', () => {
  resetDatabase();
  createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '破损案件质检',
      startDate: '2026-06-01',
      endDate: '2026-06-06',
      caseType: 'damaged'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(createResult.success === true, '创建应该成功');
  assert(createResult.data!.totalCount === 3, '应该只有3笔破损案件');
})) { passed++; } else { failed++; }

if (runTest('4. 按责任方筛选创建抽查单', () => {
  resetDatabase();
  createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '商家责任案件质检',
      startDate: '2026-06-01',
      endDate: '2026-06-06',
      responsibleParty: 'merchant'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(createResult.success === true, '创建应该成功');
  assert(createResult.data!.totalCount === 3, '应该只有3笔商家责任案件');
})) { passed++; } else { failed++; }

if (runTest('5. 指定案件ID创建抽查单', () => {
  resetDatabase();
  const caseIds = createFinishedCases();
  const selectedIds = [caseIds[0], caseIds[2]];

  const createResult = createQualityInspection(
    {
      title: '指定案件质检',
      startDate: '2026-06-01',
      endDate: '2026-06-06',
      caseIds: selectedIds
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(createResult.success === true, '创建应该成功');
  assert(createResult.data!.totalCount === 2, '应该只有2笔指定案件');
})) { passed++; } else { failed++; }

if (runTest('6. 没有符合条件案件时创建失败', () => {
  resetDatabase();
  createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '空结果测试',
      startDate: '2026-07-01',
      endDate: '2026-07-06'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(createResult.success === false, '应该创建失败');
  assert(createResult.error!.code === QUALITY_INSPECTION_ERROR_CODES.NO_CASES_SELECTED, '错误码应该正确');
  assert(createResult.error!.message.includes('没有符合条件的已完成案件'), '错误信息应该正确');
})) { passed++; } else { failed++; }

resetDatabase();
{
  createFinishedCases();
  const createResult = createQualityInspection(
    {
      title: '2026年6月上旬质检',
      startDate: '2026-06-01',
      endDate: '2026-06-06'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );
  testInspectionId = createResult.data!.inspectionId;
  testInspectionNo = createResult.data!.inspectionNo;
}

if (runTest('7. 抽查单列表查询', () => {
  const listResult = getQualityInspectionList({}, csUser.user.role);

  assert(listResult.success === true, '查询应该成功');
  assert(Array.isArray(listResult.data), '应该返回数组');
  assert(listResult.data.length >= 1, '应该至少有1条记录');
  assert(listResult.data[0].inspectionNo.startsWith('QI-'), '抽查单号格式正确');
  assert(typeof listResult.data[0].totalCount === 'number', '总数应该是数字');
})) { passed++; } else { failed++; }

if (runTest('8. 抽查单详情查询（含快照信息）', () => {
  const detailResult = getQualityInspectionDetail(testInspectionNo, csUser.user.role);

  assert(detailResult.success === true, '查询应该成功');
  assert(detailResult.data!.inspectionNo === testInspectionNo, '抽查单号应该正确');
  assert(detailResult.data!.title === '2026年6月上旬质检', '标题应该正确');
  assert(detailResult.data!.items.length === 5, '应该有5笔明细');
  assert(detailResult.data!.pendingCount === 5, '应该全部是待质检状态');

  const firstItem = detailResult.data!.items[0] as any;
  assert(firstItem.status === 'pending', '状态应该是待质检');
  assert(firstItem.version === 1, '版本号应该是1');
  assert(firstItem.snapshot !== undefined, '应该包含快照');
  assert(firstItem.snapshot.orderNo !== undefined, '快照应该包含订单号');
  assert(firstItem.snapshot.originalDecision !== undefined, '快照应该包含原裁决');
  assert(Array.isArray(firstItem.snapshot.evidenceLinks), '快照应该包含证据链接数组');
  assert(firstItem.snapshot.caseStatus !== undefined, '快照应该包含案件状态');
  assert(firstItem.hasReviewHistory === false, '应该没有复核历史');

  testItemId = firstItem.id;
})) { passed++; } else { failed++; }

if (runTest('9. 质检明细详情查询（含复核轨迹）', () => {
  const detailResult = getQualityInspectionItemDetail(testItemId, csUser.user.role);

  assert(detailResult.success === true, '查询应该成功');
  assert(detailResult.data!.id === testItemId, '明细ID应该正确');
  assert(detailResult.data!.snapshot !== undefined, '应该包含快照');
  assert(Array.isArray(detailResult.data!.reviews), '应该包含复核轨迹数组');
  assert(detailResult.data!.reviews.length === 0, '初始应该没有复核记录');
})) { passed++; } else { failed++; }

if (runTest('10. 成功质检-标记通过', () => {
  const itemDetail = getQualityInspectionItemDetail(testItemId, csUser.user.role);
  const currentVersion = itemDetail.data!.version;

  const result = inspectQualityItem(
    {
      itemId: testItemId,
      version: currentVersion,
      status: 'passed',
      reason: '裁决正确，证据充分'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === true, '质检应该成功');
  assert(result.data!.status === 'passed', '状态应该是通过');
  assert(result.data!.version === currentVersion + 1, '版本号应该递增');
  assert(result.data!.reason === '裁决正确，证据充分', '原因应该正确');
  assert(result.data!.inspectorName === csUser.user.name, '质检人应该正确');
  assert(result.data!.inspectedAt !== undefined, '质检时间应该存在');
  assert(result.data!.conclusion === 'passed', '结论应该正确');

  const inspectionDetail = getQualityInspectionDetail(testInspectionNo, csUser.user.role);
  assert(inspectionDetail.data!.passedCount === 1, '通过数应该是1');
  assert(inspectionDetail.data!.pendingCount === 4, '待质检数应该是4');
})) { passed++; } else { failed++; }

if (runTest('11. 质检-标记需复核', () => {
  const detailResult = getQualityInspectionDetail(testInspectionNo, csUser.user.role);
  const pendingItems = detailResult.data!.items.filter((i: any) => i.status === 'pending');
  const targetItem = pendingItems[0];
  const currentVersion = targetItem.version;

  const result = inspectQualityItem(
    {
      itemId: targetItem.id,
      version: currentVersion,
      status: 'needsReview',
      reason: '需要再次核对证据链'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === true, '质检应该成功');
  assert(result.data!.status === 'needsReview', '状态应该是需复核');
  assert(result.data!.conclusion === 'needsReview', '结论应该正确');

  const inspectionDetail = getQualityInspectionDetail(testInspectionNo, csUser.user.role);
  assert(inspectionDetail.data!.needsReviewCount === 1, '需复核数应该是1');
})) { passed++; } else { failed++; }

if (runTest('12. 质检-标记误判', () => {
  const detailResult = getQualityInspectionDetail(testInspectionNo, csUser.user.role);
  const pendingItems = detailResult.data!.items.filter((i: any) => i.status === 'pending');
  const targetItem = pendingItems[0];
  const currentVersion = targetItem.version;

  const result = inspectQualityItem(
    {
      itemId: targetItem.id,
      version: currentVersion,
      status: 'misjudged',
      reason: '责任方判定错误，应该是物流责任'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === true, '质检应该成功');
  assert(result.data!.status === 'misjudged', '状态应该是误判');
  assert(result.data!.conclusion === 'misjudged', '结论应该正确');

  const inspectionDetail = getQualityInspectionDetail(testInspectionNo, csUser.user.role);
  assert(inspectionDetail.data!.misjudgedCount === 1, '误判数应该是1');
})) { passed++; } else { failed++; }

if (runTest('13. 并发冲突-版本号校验（防止重复修改）', () => {
  const detailResult = getQualityInspectionDetail(testInspectionNo, csUser.user.role);
  const pendingItems = detailResult.data!.items.filter((i: any) => i.status === 'pending');
  const targetItem = pendingItems[0];
  const currentVersion = targetItem.version;

  db.prepare('UPDATE quality_inspection_items SET version = ? WHERE id = ?').run(currentVersion + 10, targetItem.id);

  const result = inspectQualityItem(
    {
      itemId: targetItem.id,
      version: currentVersion,
      status: 'passed',
      reason: '测试并发冲突'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === false, '应该失败');
  assert(result.error!.code === QUALITY_INSPECTION_ERROR_CODES.VERSION_CONFLICT, '错误码应该是版本冲突');
  assert(result.error!.message.includes('已被他人处理'), '错误信息应该正确');

  db.prepare('UPDATE quality_inspection_items SET version = ? WHERE id = ?').run(currentVersion, targetItem.id);
})) { passed++; } else { failed++; }

if (runTest('14. 已有结论被再次打开时只能追加复核记录，不能覆盖历史', () => {
  const itemDetail = getQualityInspectionItemDetail(testItemId, csUser.user.role);
  assert(itemDetail.data!.status === 'passed', '初始状态应该是通过');
  const originalReason = itemDetail.data!.reason;
  const originalVersion = itemDetail.data!.version;
  const originalReviewsCount = itemDetail.data!.reviews.length;

  const result = inspectQualityItem(
    {
      itemId: testItemId,
      version: originalVersion,
      status: 'needsReview',
      reason: '复核：发现证据有疑点，需重新核实'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === true, '复核应该成功');
  assert(result.data!.status === 'needsReview', '状态应该更新');
  assert(result.data!.version === originalVersion + 1, '版本号应该递增');
  assert(result.data!.hasReviewHistory === true, '应该标记有复核历史');

  const itemDetailAfter = getQualityInspectionItemDetail(testItemId, csUser.user.role);
  assert(itemDetailAfter.data!.reviews.length === originalReviewsCount + 1, '复核记录应该增加1条');
  
  const reviewRecord = itemDetailAfter.data!.reviews[itemDetailAfter.data!.reviews.length - 1];
  assert(reviewRecord.previousStatus === 'passed', '复核记录应该包含之前状态');
  assert(reviewRecord.newStatus === 'needsReview', '复核记录应该包含新状态');
  assert(reviewRecord.reason === '复核：发现证据有疑点，需重新核实', '复核记录应该包含原因');
  assert(reviewRecord.version === originalVersion + 1, '复核记录版本号正确');
  assert(reviewRecord.inspectorName === csUser.user.name, '复核人正确');

  assert(itemDetailAfter.data!.reason !== originalReason, '当前原因应该更新');
  assert(itemDetailAfter.data!.conclusion === 'needsReview', '结论应该是最新的');
})) { passed++; } else { failed++; }

if (runTest('15. 批量质检功能', () => {
  resetDatabase();
  createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '批量质检测试',
      startDate: '2026-06-01',
      endDate: '2026-06-06'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const inspectionId = createResult.data!.inspectionId;
  const detailResult = getQualityInspectionDetail(inspectionId.toString(), csUser.user.role);
  const items = detailResult.data!.items;

  const batchItems = items.slice(0, 3).map((item: any, index: number) => ({
    itemId: item.id,
    version: item.version,
    status: ['passed', 'needsReview', 'misjudged'][index] as any,
    reason: `批量质检${index + 1}`
  }));

  const result = batchInspectQualityItems(
    { items: batchItems },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === true, '批量质检应该成功');
  assert(result.data!.totalCount === 3, '应该处理3笔');
  assert(result.data!.successCount === 3, '应该全部成功');
  assert(result.data!.failedCount === 0, '应该没有失败');

  const detailAfter = getQualityInspectionDetail(inspectionId.toString(), csUser.user.role);
  assert(detailAfter.data!.passedCount === 1, '通过数应该正确');
  assert(detailAfter.data!.needsReviewCount === 1, '需复核数应该正确');
  assert(detailAfter.data!.misjudgedCount === 1, '误判数应该正确');
  assert(detailAfter.data!.pendingCount === 2, '待质检数应该正确');
})) { passed++; } else { failed++; }

if (runTest('16. 批量质检-部分版本冲突（部分失败）', () => {
  resetDatabase();
  createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '批量质检冲突测试',
      startDate: '2026-06-01',
      endDate: '2026-06-06'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const inspectionId = createResult.data!.inspectionId;
  const detailResult = getQualityInspectionDetail(inspectionId.toString(), csUser.user.role);
  const items = detailResult.data!.items;

  const targetItem = items[1];
  db.prepare('UPDATE quality_inspection_items SET version = ? WHERE id = ?').run(999, targetItem.id);

  const batchItems = items.slice(0, 3).map((item: any, index: number) => ({
    itemId: item.id,
    version: item.id === targetItem.id ? 1 : item.version,
    status: 'passed' as const,
    reason: `批量质检${index + 1}`
  }));

  const result = batchInspectQualityItems(
    { items: batchItems },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(result.success === true, '批量质检应该返回结果');
  assert(result.data!.totalCount === 3, '应该处理3笔');
  assert(result.data!.successCount === 2, '应该成功2笔');
  assert(result.data!.failedCount === 1, '应该失败1笔');

  const failedItem = result.data!.items.find(i => !i.success);
  assert(failedItem !== undefined, '应该有失败的记录');
  assert(failedItem!.errorCode === QUALITY_INSPECTION_ERROR_CODES.VERSION_CONFLICT, '错误码应该是版本冲突');
})) { passed++; } else { failed++; }

if (runTest('17. 越权调用-团长/商家质检被拒绝', () => {
  resetDatabase();
  createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '越权质检测试',
      startDate: '2026-06-01',
      endDate: '2026-06-06'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const detailResult = getQualityInspectionDetail(createResult.data!.inspectionId.toString(), csUser.user.role);
  const targetItem = detailResult.data!.items[0] as any;

  const merchantResult = inspectQualityItem(
    {
      itemId: targetItem.id,
      version: targetItem.version,
      status: 'passed',
      reason: '商家越权测试'
    },
    merchantUser.user.id,
    merchantUser.user.name,
    merchantUser.user.role
  );

  assert(merchantResult.success === false, '商家质检应该被拒绝');
  assert(merchantResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码应该是权限拒绝');

  const leaderResult = inspectQualityItem(
    {
      itemId: targetItem.id,
      version: targetItem.version,
      status: 'passed',
      reason: '团长越权测试'
    },
    leaderUser.user.id,
    leaderUser.user.name,
    leaderUser.user.role
  );

  assert(leaderResult.success === false, '团长质检应该被拒绝');
  assert(leaderResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码应该是权限拒绝');
})) { passed++; } else { failed++; }

if (runTest('18. CSV导出结果', () => {
  resetDatabase();
  createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '导出测试',
      startDate: '2026-06-01',
      endDate: '2026-06-06'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const inspectionId = createResult.data!.inspectionId;
  const detailResult = getQualityInspectionDetail(inspectionId.toString(), csUser.user.role);
  const items = detailResult.data!.items;

  for (let i = 0; i < 3; i++) {
    const item = items[i] as any;
    inspectQualityItem(
      {
        itemId: item.id,
        version: item.version,
        status: i === 0 ? 'passed' : i === 1 ? 'needsReview' : 'misjudged',
        reason: `导出测试${i + 1}`
      },
      csUser.user.id,
      csUser.user.name,
      csUser.user.role
    );
  }

  const exportResult = exportQualityInspectionCSV(
    inspectionId,
    csUser.user.role,
    csUser.user.id,
    csUser.user.name
  );

  assert(exportResult.success === true, '导出应该成功');
  assert(typeof exportResult.data === 'string', '应该返回字符串');
  assert(exportResult.data.includes('\uFEFF'), '应该包含BOM');

  const lines = exportResult.data.trim().split('\n');
  assert(lines.length === 6, '应该有1行表头+5行数据');

  const headers = lines[0].split(',');
  assert(headers.includes('抽查单号'), '应该包含抽查单号列');
  assert(headers.includes('订单号'), '应该包含订单号列');
  assert(headers.includes('原裁决'), '应该包含原裁决列');
  assert(headers.includes('质检状态'), '应该包含质检状态列');
  assert(headers.includes('质检结论'), '应该包含质检结论列');
  assert(headers.includes('是否有复核记录'), '应该包含是否有复核记录列');
  assert(headers.includes('版本号'), '应该包含版本号列');

  assert(lines[1].includes('通过'), '应该包含通过状态');
  assert(lines[2].includes('需复核'), '应该包含需复核状态');
  assert(lines[3].includes('误判'), '应该包含误判状态');
  assert(lines[4].includes('待质检'), '应该包含待质检状态');

  exportedCSVContent = exportResult.data;
})) { passed++; } else { failed++; }

if (runTest('19. CSV导入抽查清单', () => {
  resetDatabase();
  const caseIds = createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '导入测试',
      startDate: '2026-06-01',
      endDate: '2026-06-06',
      caseIds: [caseIds[0]]
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const inspectionId = createResult.data!.inspectionId;
  const detailBefore = getQualityInspectionDetail(inspectionId.toString(), csUser.user.role);
  const countBefore = detailBefore.data!.totalCount;

  const csvContent = `案件ID,订单号\n${caseIds[1]},\n${caseIds[2]},\n99999,`;

  const importResult = importQualityInspectionItems(
    inspectionId,
    csvContent,
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  assert(importResult.success === true, '导入应该成功');
  assert(importResult.data!.successCount === 2, '应该成功导入2笔');
  assert(importResult.data!.failedCount === 1, '应该失败1笔');
  assert(importResult.data!.errors.length === 1, '应该有1条错误');
  assert(importResult.data!.errors[0].error.includes('不存在'), '错误信息应该正确');

  const detailAfter = getQualityInspectionDetail(inspectionId.toString(), csUser.user.role);
  assert(detailAfter.data!.totalCount === countBefore + 2, '总数应该增加2笔');
})) { passed++; } else { failed++; }

if (runTest('20. 操作日志落库', () => {
  resetDatabase();
  createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '日志测试',
      startDate: '2026-06-01',
      endDate: '2026-06-06'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const inspectionId = createResult.data!.inspectionId;
  const detailResult = getQualityInspectionDetail(inspectionId.toString(), csUser.user.role);
  const targetItem = detailResult.data!.items[0] as any;

  inspectQualityItem(
    {
      itemId: targetItem.id,
      version: targetItem.version,
      status: 'passed',
      reason: '日志测试'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  exportQualityInspectionCSV(inspectionId, csUser.user.role, csUser.user.id, csUser.user.name);

  const logsResult = getQualityInspectionOperationLogs(inspectionId, csUser.user.role);

  assert(logsResult.success === true, '查询日志应该成功');
  assert(logsResult.data!.length >= 3, '应该至少有3条日志（创建、质检、导出）');

  const createLog = logsResult.data!.find(l => l.operationType === 'create');
  assert(createLog !== undefined, '应该有创建日志');
  assert(createLog.detail.includes('创建质检抽查单'), '日志详情应该正确');
  assert(createLog.operatorName === csUser.user.name, '操作人应该正确');
  assert(createLog.operatorRole === 'cs', '操作角色应该正确');

  const inspectLog = logsResult.data!.find(l => l.operationType === 'inspect');
  assert(inspectLog !== undefined, '应该有质检日志');
  assert(inspectLog.detail.includes('通过'), '日志详情应该包含质检结果');

  const exportLog = logsResult.data!.find(l => l.operationType === 'export');
  assert(exportLog !== undefined, '应该有导出日志');
  assert(exportLog.detail.includes('导出'), '日志详情应该正确');
})) { passed++; } else { failed++; }

if (runTest('21. 数据持久化验证-重启后一致', () => {
  resetDatabase();
  const caseIds = createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '持久化测试',
      startDate: '2026-06-01',
      endDate: '2026-06-06'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const inspectionId = createResult.data!.inspectionId;
  const inspectionNo = createResult.data!.inspectionNo;

  const detailResult = getQualityInspectionDetail(inspectionId.toString(), csUser.user.role);
  const items = detailResult.data!.items;

  for (let i = 0; i < 2; i++) {
    const item = items[i] as any;
    inspectQualityItem(
      {
        itemId: item.id,
        version: item.version,
        status: i === 0 ? 'passed' : 'needsReview',
        reason: `持久化测试${i + 1}`
      },
      csUser.user.id,
      csUser.user.name,
      csUser.user.role
    );
  }

  const item1Detail = getQualityInspectionItemDetail((items[0] as any).id, csUser.user.role);
  inspectQualityItem(
    {
      itemId: (items[0] as any).id,
      version: item1Detail.data!.version,
      status: 'misjudged',
      reason: '复核：发现新证据'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const exportResult = exportQualityInspectionCSV(inspectionId, csUser.user.role, csUser.user.id, csUser.user.name);
  const csvBefore = exportResult.data;

  const detailBefore = getQualityInspectionDetail(inspectionNo, csUser.user.role);
  const itemDetailBefore = getQualityInspectionItemDetail((items[0] as any).id, csUser.user.role);
  const logsBefore = getQualityInspectionOperationLogs(inspectionId, csUser.user.role);

  assert(detailBefore.data!.totalCount === 5, '总数应该是5');
  assert(detailBefore.data!.passedCount === 0, '通过数应该是0');
  assert(detailBefore.data!.needsReviewCount === 1, '需复核数应该是1');
  assert(detailBefore.data!.misjudgedCount === 1, '误判数应该是1');
  assert(detailBefore.data!.pendingCount === 3, '待质检数应该是3');
  assert(itemDetailBefore.data!.reviews.length === 1, '应该有1条复核记录');
  assert(itemDetailBefore.data!.hasReviewHistory === true, '应该标记有复核历史');

  const inspectionBefore = db.prepare('SELECT * FROM quality_inspections WHERE id = ?').get(inspectionId) as any;
  const itemsBefore = db.prepare('SELECT * FROM quality_inspection_items WHERE inspectionId = ? ORDER BY id').all(inspectionId) as any[];
  const reviewsBefore = db.prepare('SELECT * FROM quality_inspection_reviews WHERE inspectionItemId = ? ORDER BY id').all((items[0] as any).id) as any[];
  const logsBeforeDb = db.prepare('SELECT * FROM quality_inspection_operation_logs WHERE inspectionId = ? ORDER BY id').all(inspectionId) as any[];

  assert(inspectionBefore.inspectionNo === inspectionNo, '抽查单号应该正确');
  assert(itemsBefore.length === 5, '明细数应该是5');
  assert(reviewsBefore.length === 1, '复核记录数应该是1');
  assert(logsBeforeDb.length >= 4, '日志数应该足够');

  const logsResultAfter = getQualityInspectionOperationLogs(undefined, csUser.user.role);
  assert(logsResultAfter.success === true, '查询全部日志应该成功');
  assert(logsResultAfter.data!.length >= logsBeforeDb.length, '全部日志数应该正确');

  const detailAfter = getQualityInspectionDetail(inspectionNo, csUser.user.role);
  assert(JSON.stringify(detailAfter.data) === JSON.stringify(detailBefore.data), '详情应该一致');

  const exportResultAfter = exportQualityInspectionCSV(inspectionId, csUser.user.role, csUser.user.id, csUser.user.name);
  assert(exportResultAfter.data === csvBefore, '导出CSV内容应该一致');
})) { passed++; } else { failed++; }

if (runTest('22. 复核记录不能覆盖历史-多次复核验证', () => {
  resetDatabase();
  createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '多次复核测试',
      startDate: '2026-06-01',
      endDate: '2026-06-06'
    },
    csUser.user.id,
    csUser.user.name,
    csUser.user.role
  );

  const detailResult = getQualityInspectionDetail(createResult.data!.inspectionId.toString(), csUser.user.role);
  const targetItem = detailResult.data!.items[0] as any;
  const itemId = targetItem.id;

  const result1 = inspectQualityItem(
    { itemId, version: 1, status: 'passed', reason: '第一次：通过' },
    csUser.user.id, csUser.user.name, csUser.user.role
  );
  assert(result1.data!.version === 2, '版本应该是2');

  const result2 = inspectQualityItem(
    { itemId, version: 2, status: 'needsReview', reason: '复核：需重新核对' },
    csUser.user.id, csUser.user.name, csUser.user.role
  );
  assert(result2.data!.version === 3, '版本应该是3');

  const result3 = inspectQualityItem(
    { itemId, version: 3, status: 'misjudged', reason: '最终：判定为误判' },
    csUser.user.id, csUser.user.name, csUser.user.role
  );
  assert(result3.data!.version === 4, '版本应该是4');
  assert(result3.data!.status === 'misjudged', '最终状态应该是误判');

  const itemDetail = getQualityInspectionItemDetail(itemId, csUser.user.role);
  assert(itemDetail.data!.reviews.length === 2, '应该有2条复核记录');
  assert(itemDetail.data!.hasReviewHistory === true, '应该标记有复核历史');

  assert(itemDetail.data!.reviews[0].previousStatus === 'passed', '第一条复核：之前状态');
  assert(itemDetail.data!.reviews[0].newStatus === 'needsReview', '第一条复核：新状态');
  assert(itemDetail.data!.reviews[0].version === 3, '第一条复核：版本号');

  assert(itemDetail.data!.reviews[1].previousStatus === 'needsReview', '第二条复核：之前状态');
  assert(itemDetail.data!.reviews[1].newStatus === 'misjudged', '第二条复核：新状态');
  assert(itemDetail.data!.reviews[1].version === 4, '第二条复核：版本号');

  assert(itemDetail.data!.reason === '最终：判定为误判', '当前原因应该是最新的');
  assert(itemDetail.data!.conclusion === 'misjudged', '结论应该是最新的');

  const allReasons = itemDetail.data!.reviews.map((r: any) => r.reason);
  assert(allReasons.includes('复核：需重新核对'), '历史原因应该保留');
  assert(allReasons.includes('最终：判定为误判'), '历史原因应该保留');
})) { passed++; } else { failed++; }

if (runTest('23. 缺少必填参数验证', () => {
  const result1 = createQualityInspection(
    { title: '', startDate: '2026-06-01', endDate: '2026-06-06' },
    csUser.user.id, csUser.user.name, csUser.user.role
  );
  assert(result1.success === false, '空标题应该失败');
  assert(result1.error!.code === ERROR_CODES.INVALID_PARAMS, '错误码正确');

  const result2 = createQualityInspection(
    { title: '测试', startDate: '', endDate: '2026-06-06' },
    csUser.user.id, csUser.user.name, csUser.user.role
  );
  assert(result2.success === false, '空开始日期应该失败');

  const result3 = inspectQualityItem(
    { itemId: 99999, version: 1, status: 'passed', reason: '' },
    csUser.user.id, csUser.user.name, csUser.user.role
  );
  assert(result3.success === false, '空原因应该失败');
  assert(result3.error!.message.includes('请填写质检原因'), '错误信息正确');

  const result4 = inspectQualityItem(
    { itemId: 99999, version: 1, status: 'invalid' as any, reason: '测试' },
    csUser.user.id, csUser.user.name, csUser.user.role
  );
  assert(result4.success === false, '无效状态应该失败');
  assert(result4.error!.code === QUALITY_INSPECTION_ERROR_CODES.INVALID_STATUS, '错误码正确');
})) { passed++; } else { failed++; }

if (runTest('24. 越权调用-团长/商家查看列表被拒绝', () => {
  const merchantResult = getQualityInspectionList({}, merchantUser.user.role);
  assert(merchantResult.success === false, '商家查看列表应该被拒绝');
  assert(merchantResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码正确');

  const leaderResult = getQualityInspectionList({}, leaderUser.user.role);
  assert(leaderResult.success === false, '团长查看列表应该被拒绝');
  assert(leaderResult.error!.code === ERROR_CODES.PERMISSION_DENIED, '错误码正确');

  const merchantDetail = getQualityInspectionDetail('1', merchantUser.user.role);
  assert(merchantDetail.success === false, '商家查看详情应该被拒绝');

  const merchantLogs = getQualityInspectionOperationLogs(undefined, merchantUser.user.role);
  assert(merchantLogs.success === false, '商家查看日志应该被拒绝');
})) { passed++; } else { failed++; }

if (runTest('25. CSV导入导出一致性验证', () => {
  resetDatabase();
  const caseIds = createFinishedCases();

  const createResult = createQualityInspection(
    {
      title: '导入导出一致性测试',
      startDate: '2026-06-01',
      endDate: '2026-06-06',
      caseIds: [caseIds[0], caseIds[1]]
    },
    csUser.user.id, csUser.user.name, csUser.user.role
  );

  const inspectionId = createResult.data!.inspectionId;

  const exportResult1 = exportQualityInspectionCSV(inspectionId, csUser.user.role, csUser.user.id, csUser.user.name);
  const csvContent1 = exportResult1.data;

  const lines = csvContent1.trim().split('\n');
  const dataLines = lines.slice(1, 3);
  const caseIdsFromCSV = dataLines.map(line => line.split(',')[1]);

  const newInspection = createQualityInspection(
    {
      title: '导入导出测试-新',
      startDate: '2026-06-01',
      endDate: '2026-06-06',
      caseIds: [caseIds[4]]
    },
    csUser.user.id, csUser.user.name, csUser.user.role
  );

  const importCSV = `案件ID\n${caseIdsFromCSV[0]}\n${caseIdsFromCSV[1]}\n99999`;
  const importResult = importQualityInspectionItems(
    newInspection.data!.inspectionId, importCSV,
    csUser.user.id, csUser.user.name, csUser.user.role
  );

  assert(importResult.data!.successCount === 2, '应该成功导入2笔');
  assert(importResult.data!.failedCount === 1, '应该失败1笔');

  const exportResult2 = exportQualityInspectionCSV(newInspection.data!.inspectionId, csUser.user.role, csUser.user.id, csUser.user.name);
  const csvContent2 = exportResult2.data;

  const lines1 = csvContent1.split('\n');
  const lines2 = csvContent2.split('\n');

  assert(lines1[0] === lines2[0], '表头应该完全一致');

  const caseIdToLine1: Record<string, string[]> = {};
  for (let i = 1; i < lines1.length; i++) {
    const line = lines1[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length > 1 && cols[1]) {
      caseIdToLine1[cols[1]] = cols;
    }
  }

  const caseIdToLine2: Record<string, string[]> = {};
  for (let i = 1; i < lines2.length; i++) {
    const line = lines2[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length > 1 && cols[1]) {
      caseIdToLine2[cols[1]] = cols;
    }
  }

  for (const caseId of [caseIdsFromCSV[0], caseIdsFromCSV[1]]) {
    const cols1 = caseIdToLine1[caseId];
    const cols2 = caseIdToLine2[caseId];
    assert(cols1 !== undefined, `第一个导出应该包含案件ID ${caseId}`);
    assert(cols2 !== undefined, `第二个导出应该包含案件ID ${caseId}`);
    assert(cols1[1] === cols2[1], `案件ID ${caseId} 应该一致`);
    assert(cols1[2] === cols2[2], `案件ID ${caseId} 订单号应该一致`);
    assert(cols1[10] === cols2[10], `案件ID ${caseId} 原裁决应该一致`);
  }
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
