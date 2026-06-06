import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  User,
  FileText,
  Image,
  Video,
  File,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Send,
  Settings,
  History,
  ShieldAlert
} from 'lucide-react';
import { getCaseDetail, executeCaseAction, getCaseRuleInfo, overrideRuleHit, getCaseRuleAuditLogs } from '@/utils/api';
import { useAuthStore } from '@/store/authStore';
import { StatusBadge, TypeBadge, PartyBadge, ActionBadge } from '@/components/StatusBadge';
import {
  CaseDetail as CaseDetailType,
  CaseAction,
  CaseActionRequest,
  CaseStatus,
  UserRole,
  ERROR_CODES,
  CASE_STATUS_LABELS,
  USER_ROLE_LABELS,
  RuleHitRecord,
  ArbitrationRule,
  RuleAuditLog,
  RULE_SUGGESTED_ACTION_LABELS,
  RULE_OPERATION_TYPE_LABELS
} from '../../shared/types';

interface StateTransition {
  action: CaseAction;
  role: UserRole;
  targetStatus: CaseStatus;
  requireEvidence: boolean;
}

const stateTransitions: Record<CaseStatus, StateTransition[]> = {
  pendingEvidence: [
    { action: 'submitEvidence', role: 'leader', targetStatus: 'merchantProcessing', requireEvidence: true }
  ],
  merchantProcessing: [
    { action: 'merchantRespond', role: 'merchant', targetStatus: 'csArbitration', requireEvidence: false }
  ],
  csArbitration: [
    { action: 'csRefund', role: 'cs', targetStatus: 'refundCompleted', requireEvidence: false },
    { action: 'csReject', role: 'cs', targetStatus: 'rejected', requireEvidence: false }
  ],
  refundCompleted: [],
  rejected: []
};

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [caseData, setCaseData] = useState<CaseDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    action: '' as CaseAction | '',
    remark: '',
    evidenceType: 'image' as 'image' | 'video' | 'other',
    evidenceUrl: ''
  });

  const [ruleHit, setRuleHit] = useState<(RuleHitRecord & { rule?: ArbitrationRule }) | null>(null);
  const [ruleAuditLogs, setRuleAuditLogs] = useState<RuleAuditLog[]>([]);
  const [ruleLoading, setRuleLoading] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideRemark, setOverrideRemark] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [showAuditLogsModal, setShowAuditLogsModal] = useState(false);

  const loadCaseDetail = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await getCaseDetail(parseInt(id));
      if (result.success && result.data) {
        setCaseData(result.data);
      } else {
        setError(result.error?.message || '加载失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadRuleInfo = async () => {
    if (!id) return;
    setRuleLoading(true);
    try {
      const result = await getCaseRuleInfo(parseInt(id));
      if (result.success) {
        setRuleHit(result.data || null);
      }
    } finally {
      setRuleLoading(false);
    }
  };

  const loadRuleAuditLogs = async () => {
    if (!id) return;
    try {
      const result = await getCaseRuleAuditLogs(parseInt(id));
      if (result.success && result.data) {
        setRuleAuditLogs(result.data);
      }
    } catch (e) {
      // ignore
    }
  };

  const loadAllData = async () => {
    await Promise.all([loadCaseDetail(), loadRuleInfo()]);
  };

  useEffect(() => {
    loadAllData();
  }, [id]);

  const handleOverride = async () => {
    if (!id || !overrideRemark.trim()) return;
    setOverrideLoading(true);
    setError('');
    try {
      const result = await overrideRuleHit(parseInt(id), overrideRemark.trim());
      if (result.success) {
        setSuccess('规则覆盖成功！');
        setShowOverrideModal(false);
        setOverrideRemark('');
        await loadRuleInfo();
        await loadRuleAuditLogs();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.error?.message || '覆盖失败');
      }
    } finally {
      setOverrideLoading(false);
    }
  };

  if (!user || !caseData) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      );
    }
    if (error) {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">{error}</h3>
          <button
            onClick={() => navigate('/cases')}
            className="text-blue-600 hover:text-blue-700"
          >
            返回列表
          </button>
        </div>
      );
    }
    return null;
  }

  const availableActions = stateTransitions[caseData.status].filter(t => t.role === user.role);
  const isTerminal = caseData.status === 'refundCompleted' || caseData.status === 'rejected';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.action) return;

    setActionLoading(true);
    setError('');
    setSuccess('');

    const actionData: CaseActionRequest = {
      action: formData.action as CaseAction,
      version: caseData.version,
      remark: formData.remark,
      evidenceType: formData.evidenceType,
      evidenceUrl: formData.evidenceUrl || undefined
    };

    try {
      const result = await executeCaseAction(parseInt(id!), actionData);
      if (result.success && result.data) {
        setSuccess('操作成功！');
        setFormData({ action: '', remark: '', evidenceType: 'image', evidenceUrl: '' });
        await loadCaseDetail();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        let errorMsg = result.error?.message || '操作失败';
        if (result.error?.code === ERROR_CODES.VERSION_CONFLICT) {
          errorMsg = '案件版本不匹配，请刷新页面后重试';
          setTimeout(() => loadCaseDetail(), 1500);
        }
        setError(errorMsg);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const getEvidenceIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      default: return <File className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/cases')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        返回列表
      </button>

      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
          <CheckCircle2 className="w-5 h-5" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <XCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-gray-800">{caseData.orderNo}</h1>
                  <StatusBadge status={caseData.status} />
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <TypeBadge type={caseData.caseType} />
                  <PartyBadge party={caseData.responsibleParty} />
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    v{caseData.version}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500 mb-1">退款金额</p>
                <p className="text-3xl font-bold text-blue-600">¥{caseData.refundAmount.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">商品名称</p>
                <p className="font-medium text-gray-800">{caseData.productName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">数量</p>
                <p className="font-medium text-gray-800">{caseData.quantity}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">商家</p>
                <p className="font-medium text-gray-800">{caseData.merchantName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">申请人</p>
                <p className="font-medium text-gray-800">{caseData.createdByName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">创建时间</p>
                <p className="font-medium text-gray-800">{new Date(caseData.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">更新时间</p>
                <p className="font-medium text-gray-800">{new Date(caseData.updatedAt).toLocaleString()}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500 mb-2">问题描述</p>
              <p className="text-gray-700 bg-gray-50 p-4 rounded-xl">{caseData.description}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              版本历史
            </h3>
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gray-200"></div>
              <div className="space-y-4">
                {[...caseData.versions].reverse().map((version, index) => (
                  <div key={version.id} className="relative pl-10">
                    <div className={`absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center ${
                      index === 0 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {version.version}
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <ActionBadge action={version.action} role={version.operatorRole} />
                        <span className="text-sm text-gray-500">{version.operatorName}</span>
                      </div>
                      {version.remark && (
                        <p className="text-gray-700 mb-2">{version.remark}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>
                          {version.fromStatus && `${CASE_STATUS_LABELS[version.fromStatus]} → `}
                          {CASE_STATUS_LABELS[version.toStatus]}
                        </span>
                        <span>{new Date(version.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600" />
                仲裁规则建议
              </h3>
              {user?.role === 'cs' && ruleHit && !ruleHit.isOverridden && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { loadRuleAuditLogs(); setShowAuditLogsModal(true); }}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <History className="w-4 h-4" />
                    审计日志
                  </button>
                  <button
                    onClick={() => setShowOverrideModal(true)}
                    className="px-3 py-1.5 text-sm text-amber-600 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    人工覆盖
                  </button>
                </div>
              )}
              {user?.role === 'cs' && ruleHit?.isOverridden && (
                <button
                  onClick={() => { loadRuleAuditLogs(); setShowAuditLogsModal(true); }}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
                >
                  <History className="w-4 h-4" />
                  审计日志
                </button>
              )}
            </div>

            {ruleLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            ) : ruleHit ? (
              <div className="space-y-4">
                {ruleHit.isOverridden && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-sm text-amber-700 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4" />
                      规则建议已被人工覆盖
                    </p>
                    <p className="text-sm text-amber-600 mt-1">
                      操作人：{ruleHit.overriddenByName} · {new Date(ruleHit.overriddenAt!).toLocaleString()}
                    </p>
                    {ruleHit.overrideRemark && (
                      <p className="text-sm text-amber-600 mt-1">
                        覆盖备注：{ruleHit.overrideRemark}
                      </p>
                    )}
                  </div>
                )}

                {ruleHit.rule && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-sm text-gray-500 mb-1">规则优先级</p>
                      <p className="font-medium text-gray-800">#{ruleHit.rule.priority}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-sm text-gray-500 mb-1">建议动作</p>
                      <p className={`font-medium ${
                        ruleHit.suggestedAction === 'csRefund' ? 'text-green-600' :
                        ruleHit.suggestedAction === 'csReject' ? 'text-red-600' : 'text-blue-600'
                      }`}>
                        {RULE_SUGGESTED_ACTION_LABELS[ruleHit.suggestedAction]}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-sm text-gray-500 mb-1">分派客服</p>
                      <p className="font-medium text-gray-800">
                        {ruleHit.assignedCsName || '未指定'}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-sm text-gray-500 mb-1">规则状态</p>
                      <p className={`font-medium ${ruleHit.rule.isEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                        {ruleHit.rule.isEnabled ? '已启用' : '已禁用'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-600 font-medium mb-2">命中原因</p>
                  <p className="text-gray-700">{ruleHit.hitReason}</p>
                </div>

                {ruleHit.rule?.remark && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm text-gray-500 mb-1">规则备注</p>
                    <p className="text-gray-700">{ruleHit.rule.remark}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Settings className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p>暂未匹配到仲裁规则</p>
                <p className="text-sm mt-1">案件提交或商家响应后系统会自动匹配</p>
              </div>
            )}
          </div>

          {caseData.evidences.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                凭证列表
              </h3>
              <div className="space-y-3">
                {caseData.evidences.map((evidence) => (
                  <div key={evidence.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                      {getEvidenceIcon(evidence.evidenceType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{evidence.evidenceUrl}</p>
                      <p className="text-sm text-gray-500">
                        v{evidence.version} · {evidence.remark || '无备注'} · {new Date(evidence.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <a
                      href={evidence.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      查看
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {!isTerminal && availableActions.length > 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-24">
              <h3 className="text-lg font-bold text-gray-800 mb-6">执行操作</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">选择操作</label>
                  <select
                    value={formData.action}
                    onChange={(e) => setFormData(prev => ({ ...prev, action: e.target.value as CaseAction }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                    required
                  >
                    <option value="">请选择操作</option>
                    {availableActions.map((action) => (
                      <option key={action.action} value={action.action}>
                        {action.action === 'submitEvidence' ? '提交凭证' :
                         action.action === 'merchantRespond' ? '商家响应' :
                         action.action === 'csRefund' ? '同意退款' : '驳回申请'}
                        {' → '}
                        {CASE_STATUS_LABELS[action.targetStatus]}
                      </option>
                    ))}
                  </select>
                </div>

                {formData.action && stateTransitions[caseData.status].find(t => t.action === formData.action)?.requireEvidence && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">凭证类型</label>
                      <select
                        value={formData.evidenceType}
                        onChange={(e) => setFormData(prev => ({ ...prev, evidenceType: e.target.value as 'image' | 'video' | 'other' }))}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                      >
                        <option value="image">图片</option>
                        <option value="video">视频</option>
                        <option value="other">其他</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">凭证URL *</label>
                      <input
                        type="url"
                        value={formData.evidenceUrl}
                        onChange={(e) => setFormData(prev => ({ ...prev, evidenceUrl: e.target.value }))}
                        placeholder="https://example.com/evidence.jpg"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        required
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
                  <textarea
                    value={formData.remark}
                    onChange={(e) => setFormData(prev => ({ ...prev, remark: e.target.value }))}
                    placeholder="请输入操作备注..."
                    rows={3}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                  />
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm text-amber-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    当前版本 v{caseData.version}，提交后将自动递增
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={actionLoading || !formData.action}
                  className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      处理中...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      提交操作
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
              {isTerminal ? (
                <>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                    caseData.status === 'refundCompleted' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {caseData.status === 'refundCompleted' ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2">
                    {caseData.status === 'refundCompleted' ? '退款已完成' : '申请已驳回'}
                  </h3>
                  <p className="text-gray-500">该案件已结束，无法进行任何操作</p>
                </>
              ) : (
                <>
                  <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-800 mb-2">等待处理</h3>
                  <p className="text-gray-500">当前角色无可用操作，请等待其他角色处理</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
                人工覆盖规则建议
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                覆盖后将忽略系统自动匹配的规则建议，并记录审计日志
              </p>
            </div>
            <div className="p-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  覆盖原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={overrideRemark}
                  onChange={(e) => setOverrideRemark(e.target.value)}
                  placeholder="请输入覆盖规则建议的原因..."
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all resize-none"
                  required
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleOverride}
                disabled={overrideLoading || !overrideRemark.trim()}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {overrideLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    处理中...
                  </>
                ) : (
                  '确认覆盖'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAuditLogsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                规则审计日志
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {ruleAuditLogs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p>暂无审计日志</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {ruleAuditLogs.map((log) => (
                    <div key={log.id} className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          log.operationType === 'hit' ? 'bg-blue-100 text-blue-700' :
                          log.operationType === 'override' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {RULE_OPERATION_TYPE_LABELS[log.operationType]}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-1">
                        操作人：{log.operatorName} ({USER_ROLE_LABELS[log.operatorRole]})
                      </p>
                      {log.remark && (
                        <p className="text-sm text-gray-600">
                          备注：{log.remark}
                        </p>
                      )}
                      {log.beforeChange && (
                        <p className="text-xs text-gray-500 mt-2">
                          变更前：{log.beforeChange}
                        </p>
                      )}
                      {log.afterChange && (
                        <p className="text-xs text-gray-500">
                          变更后：{log.afterChange}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowAuditLogsModal(false)}
                className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
