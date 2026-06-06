import { useState, useEffect } from 'react';
import { Search, Download, Eye, Calendar, ArrowLeft, CheckCircle, XCircle, SkipForward, Undo2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBatches, getBatchDetail, exportBatchCSV, exportRevokeBatchCSV } from '@/utils/api';
import { useAuthStore } from '@/store/authStore';
import BatchRevokeModal from '@/components/BatchRevokeModal';
import {
  BatchOperation,
  BatchDetail,
  BatchListFilter,
  BatchOperationAction,
  BATCH_OPERATION_LABELS,
  CASE_STATUS_LABELS,
  BATCH_ITEM_STATUS_LABELS,
  BATCH_REVOKE_ITEM_STATUS_LABELS,
  BatchRevokeExecuteResponse
} from '../../shared/types';

export default function BatchHistory() {
  const navigate = useNavigate();
  const { batchId } = useParams();
  const { user } = useAuthStore();
  const [batches, setBatches] = useState<BatchOperation[]>([]);
  const [batchDetail, setBatchDetail] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<BatchListFilter>({});
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [revokeBatchId, setRevokeBatchId] = useState<number | null>(null);
  const [revokeBatchNo, setRevokeBatchNo] = useState('');

  const loadBatches = async () => {
    setLoading(true);
    try {
      const result = await getBatches(filter);
      if (result.success && result.data) {
        setBatches(result.data);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadBatchDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const result = await getBatchDetail(id);
      if (result.success && result.data) {
        setBatchDetail(result.data);
        setView('detail');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (batchId) {
      loadBatchDetail(batchId);
    } else {
      setView('list');
      loadBatches();
    }
  }, [filter, batchId]);

  const handleFilterChange = (key: keyof BatchListFilter, value: string) => {
    setFilter(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  const handleExport = async (batchId: number) => {
    try {
      await exportBatchCSV(batchId);
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  const handleBack = () => {
    setBatchDetail(null);
    setView('list');
    navigate('/batch');
  };

  const handleRevoke = (batch: BatchOperation) => {
    setRevokeBatchId(batch.id);
    setRevokeBatchNo(batch.batchNo);
    setRevokeModalOpen(true);
  };

  const handleRevokeSuccess = async (result: BatchRevokeExecuteResponse) => {
    setRevokeModalOpen(false);
    if (view === 'list') {
      await loadBatches();
    } else if (batchId) {
      await loadBatchDetail(batchId);
    }
  };

  const canRevokeBatch = (batch: BatchOperation): boolean => {
    if (!user || user.role !== 'cs') return false;
    if (batch.operatorId !== user.id) return false;
    if (batch.isRevoked) return false;
    if (batch.successCount === 0) return false;
    return true;
  };

  const getResultIcon = (status: 'success' | 'failed' | 'skipped' | 'pending') => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skipped':
        return <SkipForward className="w-4 h-4 text-gray-400" />;
      default:
        return <span className="w-4 h-4 rounded-full bg-gray-300" />;
    }
  };

  if (view === 'detail' && batchDetail) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-800">
                {BATCH_OPERATION_LABELS[batchDetail.action as BatchOperationAction]}
              </h1>
              {batchDetail.isRevoked && (
                <span className="text-sm px-3 py-1 bg-orange-100 text-orange-600 rounded-full font-medium">
                  已撤销
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">批次号：{batchDetail.batchNo}</p>
          </div>
          {canRevokeBatch(batchDetail) && (
            <button
              onClick={() => handleRevoke(batchDetail)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white text-sm font-medium rounded-xl hover:shadow-lg transition-all"
            >
              <Undo2 className="w-4 h-4" />
              撤销批次
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {batchDetail.isRevoked && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl">
              <p className="text-sm text-orange-700 mb-1">
                <span className="font-medium">撤销状态：</span>已撤销
              </p>
              {batchDetail.revokedAt && (
                <p className="text-sm text-orange-700 mb-1">
                  <span className="font-medium">撤销时间：</span>
                  {new Date(batchDetail.revokedAt).toLocaleString()}
                </p>
              )}
              {batchDetail.revokedByName && (
                <p className="text-sm text-orange-700 mb-1">
                  <span className="font-medium">撤销人：</span>
                  {batchDetail.revokedByName}
                </p>
              )}
              {batchDetail.revokeRemark && (
                <p className="text-sm text-orange-700">
                  <span className="font-medium">撤销备注：</span>
                  {batchDetail.revokeRemark}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-sm text-blue-600 font-medium">总计</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{batchDetail.totalCount}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-sm text-green-600 font-medium">成功</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{batchDetail.successCount}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-sm text-red-600 font-medium">失败</p>
              <p className="text-2xl font-bold text-red-700 mt-1">{batchDetail.failedCount}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 font-medium">跳过</p>
              <p className="text-2xl font-bold text-gray-700 mt-1">{batchDetail.skippedCount}</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-4">
              <p className="text-sm text-purple-600 font-medium">总金额</p>
              <p className="text-2xl font-bold text-purple-700 mt-1">
                ¥{batchDetail.totalRefundAmount.toFixed(2)}
              </p>
            </div>
            <div className="bg-indigo-50 rounded-xl p-4">
              <p className="text-sm text-indigo-600 font-medium">操作人</p>
              <p className="text-lg font-bold text-indigo-700 mt-1">{batchDetail.operatorName}</p>
            </div>
          </div>

          {batchDetail.remark && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <p className="text-sm text-yellow-700">
                <span className="font-medium">操作备注：</span>
                {batchDetail.remark}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">处理明细</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleExport(batchDetail.id)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-medium rounded-xl hover:shadow-lg transition-all"
              >
                <Download className="w-4 h-4" />
                导出CSV
              </button>
            </div>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">案件ID</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">订单号</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">退款金额</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">原状态</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">原版本</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">处理结果</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">新状态</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">撤销状态</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">错误信息</th>
                  </tr>
                </thead>
                <tbody>
                  {batchDetail.items.map((item, index) => (
                    <tr
                      key={item.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4 text-sm text-gray-800">{item.caseId}</td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-800">{item.orderNo}</td>
                      <td className="py-3 px-4 text-sm font-bold text-blue-600">
                        ¥{item.refundAmount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {CASE_STATUS_LABELS[item.originalStatus]}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">v{item.originalVersion}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {getResultIcon(item.status)}
                          <span className="text-sm text-gray-700">
                            {BATCH_ITEM_STATUS_LABELS[item.status]}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {item.newStatus ? CASE_STATUS_LABELS[item.newStatus] : '-'}
                      </td>
                      <td className="py-3 px-4">
                        {item.revokeStatus ? (
                          <div className="flex items-center gap-2">
                            {getResultIcon(item.revokeStatus)}
                            <span className="text-sm text-gray-700">
                              {BATCH_REVOKE_ITEM_STATUS_LABELS[item.revokeStatus]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-red-600 max-w-xs truncate">
                        {item.revokeErrorMessage || item.errorMessage || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <BatchRevokeModal
          isOpen={revokeModalOpen}
          onClose={() => setRevokeModalOpen(false)}
          batchId={revokeBatchId}
          batchNo={revokeBatchNo}
          onSuccess={handleRevokeSuccess}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">批量操作历史</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={filter.startDate || ''}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
          <span className="text-gray-400">至</span>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={filter.endDate || ''}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <select
            value={filter.action || ''}
            onChange={(e) => handleFilterChange('action', e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
          >
            <option value="">全部操作类型</option>
            {(Object.keys(BATCH_OPERATION_LABELS) as BatchOperationAction[]).map(action => (
              <option key={action} value={action}>{BATCH_OPERATION_LABELS[action]}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : batches.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">暂无批量操作记录</h3>
            <p className="text-gray-500">在案件列表页中选择多笔案件进行批量操作</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">批次号</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">操作类型</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">操作人</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">总计</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">成功</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">失败</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">跳过</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">金额</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">操作时间</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${batch.isRevoked ? 'bg-gray-50' : ''}`}
                    onClick={() => navigate(`/batch/${batch.id}`)}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-blue-600">{batch.batchNo}</span>
                        {batch.isRevoked && (
                          <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full">
                            已撤销
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-800">
                      {BATCH_OPERATION_LABELS[batch.action as BatchOperationAction]}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-800">{batch.operatorName}</td>
                    <td className="py-3 px-4 text-sm text-gray-800">{batch.totalCount}</td>
                    <td className="py-3 px-4 text-sm text-green-600 font-medium">{batch.successCount}</td>
                    <td className="py-3 px-4 text-sm text-red-600 font-medium">{batch.failedCount}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">{batch.skippedCount}</td>
                    <td className="py-3 px-4 text-sm font-bold text-blue-600">
                      ¥{batch.totalRefundAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {new Date(batch.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/batch/${batch.id}`)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleExport(batch.id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="导出CSV"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {canRevokeBatch(batch) && (
                          <button
                            onClick={() => handleRevoke(batch)}
                            className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="撤销批次"
                          >
                            <Undo2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BatchRevokeModal
        isOpen={revokeModalOpen}
        onClose={() => setRevokeModalOpen(false)}
        batchId={revokeBatchId}
        batchNo={revokeBatchNo}
        onSuccess={handleRevokeSuccess}
      />
    </div>
  );
}
