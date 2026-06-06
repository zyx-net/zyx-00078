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
  Send
} from 'lucide-react';
import { getCaseDetail, executeCaseAction } from '@/utils/api';
import { useAuthStore } from '@/store/authStore';
import { StatusBadge, TypeBadge, PartyBadge, ActionBadge } from '@/components/StatusBadge';
import {
  CaseDetail as CaseDetailType,
  CaseAction,
  CaseActionRequest,
  CaseStatus,
  UserRole,
  ERROR_CODES,
  CASE_STATUS_LABELS
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

  useEffect(() => {
    loadCaseDetail();
  }, [id]);

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
    </div>
  );
}
