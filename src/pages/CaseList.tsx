import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Eye, RefreshCw } from 'lucide-react';
import { getCases } from '@/utils/api';
import { useAuthStore } from '@/store/authStore';
import { StatusBadge, TypeBadge, PartyBadge } from '@/components/StatusBadge';
import {
  Case,
  CaseType,
  CaseStatus,
  ResponsibleParty,
  CaseListFilter,
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
  };

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
        </div>
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
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-lg hover:border-blue-200 transition-all duration-300 cursor-pointer group"
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => navigate(`/cases/${caseItem.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TypeBadge type={caseItem.caseType} />
                    <StatusBadge status={caseItem.status} />
                  </div>
                  <p className="text-lg font-bold text-gray-800">{caseItem.orderNo}</p>
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
    </div>
  );
}
