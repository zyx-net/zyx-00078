import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Eye, RefreshCw, CheckSquare, Square, CheckCircle, XCircle, Layers } from 'lucide-react';
import { getCases } from '@/utils/api';
import { useAuthStore } from '@/store/authStore';
import { StatusBadge, TypeBadge, PartyBadge } from '@/components/StatusBadge';
import BatchOperationModal from '@/components/BatchOperationModal';
import {
  Case,
  CaseType,
  CaseStatus,
  ResponsibleParty,
  CaseListFilter,
  BatchOperationAction,
  BatchExecuteResponse,
  CASE_TYPE_LABELS,
  CASE_STATUS_LABELS,
  RESPONSIBLE_PARTY_LABELS
} from '../../shared/types';

export default function CaseList() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<CaseListFilter>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchAction, setBatchAction] = useState<BatchOperationAction>('csRefund');

  const loadCases = async () => {
    setLoading(true);
    try {
      const result = await getCases(filter);
      if (result.success && result.data) {
        setCases(result.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, [filter]);

  const handleFilterChange = (key: keyof CaseListFilter, value: string) => {
    setFilter(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  const handleReset = () => {
    setFilter({});
    setSelectedIds(new Set());
  };

  const handleSelectAll = () => {
    if (selectedIds.size === csArbitrationCases.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(csArbitrationCases.map(c => c.id)));
    }
  };

  const handleSelectCase = (caseId: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(caseId)) {
      newSelected.delete(caseId);
    } else {
      newSelected.add(caseId);
    }
    setSelectedIds(newSelected);
  };

  const openBatchModal = (action: BatchOperationAction) => {
    setBatchAction(action);
    setBatchModalOpen(true);
  };

  const handleBatchSuccess = (result: BatchExecuteResponse) => {
    loadCases();
    setSelectedIds(new Set());
  };

  const csArbitrationCases = cases.filter(c => c.status === 'csArbitration');
  const selectedCases = cases.filter(c => selectedIds.has(c.id));
  const selectedTotalAmount = selectedCases.reduce((sum, c) => sum + c.refundAmount, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索订单号、商品名称、描述..."
                value={filter.keyword || ''}
                onChange={(e) => handleFilterChange('keyword', e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <select
            value={filter.caseType || ''}
            onChange={(e) => handleFilterChange('caseType', e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
          >
            <option value="">全部类型</option>
            {(Object.keys(CASE_TYPE_LABELS) as CaseType[]).map(type => (
              <option key={type} value={type}>{CASE_TYPE_LABELS[type]}</option>
            ))}
          </select>

          <select
            value={filter.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
          >
            <option value="">全部状态</option>
            {(Object.keys(CASE_STATUS_LABELS) as CaseStatus[]).map(status => (
              <option key={status} value={status}>{CASE_STATUS_LABELS[status]}</option>
            ))}
          </select>

          <select
            value={filter.responsibleParty || ''}
            onChange={(e) => handleFilterChange('responsibleParty', e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
          >
            <option value="">全部责任方</option>
            {(Object.keys(RESPONSIBLE_PARTY_LABELS) as ResponsibleParty[]).map(party => (
              <option key={party} value={party}>{RESPONSIBLE_PARTY_LABELS[party]}</option>
            ))}
          </select>

          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            重置
          </button>

          {user?.role === 'leader' && (
            <button
              onClick={() => navigate('/cases/new')}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              新建申请
            </button>
          )}

          {user?.role === 'cs' && csArbitrationCases.length > 0 && (
            <>
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 px-4 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all border border-gray-200"
              >
                {selectedIds.size === csArbitrationCases.length ? (
                  <CheckSquare className="w-4 h-4 text-blue-600" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {selectedIds.size === csArbitrationCases.length ? '取消全选' : '全选待仲裁'}
              </button>

              <button
                onClick={() => openBatchModal('csRefund')}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-medium rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <CheckCircle className="w-4 h-4" />
                批量同意退款
              </button>

              <button
                onClick={() => openBatchModal('csReject')}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-medium rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <XCircle className="w-4 h-4" />
                批量驳回
              </button>

              <button
                onClick={() => navigate('/batch')}
                className="flex items-center gap-2 px-4 py-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-blue-200"
              >
                <Layers className="w-4 h-4" />
                批量历史
              </button>
            </>
          )}
        </div>

        {user?.role === 'cs' && selectedIds.size > 0 && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-blue-700 font-medium">
                已选择 <span className="text-xl font-bold">{selectedIds.size}</span> 笔案件
              </span>
              <span className="text-blue-600">
                合计金额：<span className="font-bold">¥{selectedTotalAmount.toFixed(2)}</span>
              </span>
            </div>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              清空选择
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      ) : cases.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">暂无案件</h3>
          <p className="text-gray-500">
            {user?.role === 'leader' ? '点击右上角按钮创建新的售后申请' : '没有符合条件的案件'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cases.map((caseItem, index) => (
            <div
              key={caseItem.id}
              className={`bg-white rounded-2xl shadow-sm border p-5 hover:shadow-lg transition-all duration-300 ${
                user?.role === 'cs' && caseItem.status === 'csArbitration'
                  ? 'cursor-pointer group border-gray-100 hover:border-blue-200'
                  : 'border-gray-100 cursor-pointer hover:border-blue-200'
              } ${
                selectedIds.has(caseItem.id)
                  ? 'ring-2 ring-blue-500 border-blue-500'
                  : ''
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => navigate(`/cases/${caseItem.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-3">
                  {user?.role === 'cs' && caseItem.status === 'csArbitration' && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectCase(caseItem.id);
                      }}
                      className="mt-1 cursor-pointer"
                    >
                      {selectedIds.has(caseItem.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-300 hover:text-gray-400" />
                      )}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <TypeBadge type={caseItem.caseType} />
                      <StatusBadge status={caseItem.status} />
                    </div>
                    <p className="text-lg font-bold text-gray-800">{caseItem.orderNo}</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-blue-600">¥{caseItem.refundAmount.toFixed(2)}</span>
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-gray-700 font-medium truncate">{caseItem.productName}</p>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>数量：{caseItem.quantity}</span>
                  <span>·</span>
                  <PartyBadge party={caseItem.responsibleParty} />
                </div>
                <p className="text-sm text-gray-500">商家：{caseItem.merchantName}</p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="text-sm text-gray-400">
                  <span>v{caseItem.version}</span>
                  <span className="mx-2">·</span>
                  <span>{new Date(caseItem.createdAt).toLocaleDateString()}</span>
                </div>
                <button className="flex items-center gap-1 text-blue-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  <Eye className="w-4 h-4" />
                  查看详情
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BatchOperationModal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        selectedCases={selectedCases}
        action={batchAction}
        onSuccess={handleBatchSuccess}
      />
    </div>
  );
}
