import { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, XCircle, SkipForward, Loader2, Clock } from 'lucide-react';
import { previewBatch, executeBatch } from '@/utils/api';
import {
  BatchPreviewResponse,
  BatchExecuteResponse,
  BatchOperationAction,
  BatchItemStatus,
  Case,
  BATCH_OPERATION_LABELS,
  CASE_STATUS_LABELS,
  BATCH_ITEM_STATUS_LABELS
} from '../../shared/types';

interface BatchOperationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCases: Case[];
  action: BatchOperationAction;
  onSuccess: (result: BatchExecuteResponse) => void;
}

export default function BatchOperationModal({
  isOpen,
  onClose,
  selectedCases,
  action,
  onSuccess
}: BatchOperationModalProps) {
  const [step, setStep] = useState<'preview' | 'confirm' | 'result'>('preview');
  const [previewData, setPreviewData] = useState<BatchPreviewResponse | null>(null);
  const [resultData, setResultData] = useState<BatchExecuteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && selectedCases.length > 0) {
      setStep('preview');
      setPreviewData(null);
      setResultData(null);
      setError('');
      setRemark('');
      loadPreview();
    }
  }, [isOpen, selectedCases, action]);

  const loadPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await previewBatch({
        caseIds: selectedCases.map(c => c.id),
        action
      });
      if (result.success && result.data) {
        setPreviewData(result.data);
      } else {
        setError(result.error?.message || '预览失败');
      }
    } catch {
      setError('预览失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!previewData) return;
    
    setLoading(true);
    setError('');
    try {
      const versions: Record<number, number> = {};
      previewData.items.forEach(item => {
        versions[item.caseId] = item.currentVersion;
      });

      const result = await executeBatch({
        caseIds: previewData.items.filter(i => i.canProcess).map(i => i.caseId),
        action,
        remark,
        versions
      });
      if (result.success && result.data) {
        setResultData(result.data);
        setStep('result');
        onSuccess(result.data);
      } else {
        setError(result.error?.message || '批量操作失败');
      }
    } catch {
      setError('批量操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getStatusIcon = (canProcess: boolean, reason?: string) => {
    if (canProcess) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (reason?.includes('版本') || reason?.includes('已被')) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    return <SkipForward className="w-5 h-5 text-gray-400" />;
  };

  const getResultIcon = (status: BatchItemStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'skipped':
        return <SkipForward className="w-5 h-5 text-gray-400" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {BATCH_OPERATION_LABELS[action]}
            </h2>
            {step === 'preview' && (
              <p className="text-sm text-gray-500 mt-1">
                共选择 {selectedCases.length} 笔案件
              </p>
            )}
            {step === 'result' && resultData && (
              <p className="text-sm text-gray-500 mt-1">
                批次号：{resultData.batchNo}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {step === 'preview' && previewData && (
          <>
            <div className="p-6 border-b border-gray-100">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-600 font-medium">总案件数</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">
                    {previewData.totalCount}
                  </p>
                </div>
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-sm text-green-600 font-medium">可处理</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">
                    {previewData.processableCount}
                  </p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4">
                  <p className="text-sm text-orange-600 font-medium">不可处理</p>
                  <p className="text-2xl font-bold text-orange-700 mt-1">
                    {previewData.unprocessableCount}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-sm text-purple-600 font-medium">可处理金额</p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">
                    ¥{previewData.processableRefundAmount.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {previewData.unprocessableCount > 0 && (
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800">
                      存在 {previewData.unprocessableCount} 笔不可处理的案件
                    </p>
                    <p className="text-sm text-yellow-700 mt-1">
                      这些案件将被自动跳过，请查看下方列表了解原因
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {previewData.items.map((item, index) => (
                  <div
                    key={item.caseId}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                      item.canProcess
                        ? 'bg-gray-50 border-gray-100'
                        : 'bg-red-50 border-red-100'
                    }`}
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="flex items-center gap-4">
                      {getStatusIcon(item.canProcess, item.reason)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">
                            {item.orderNo}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                            v{item.currentVersion}
                          </span>
                          <span className="text-sm text-gray-500">
                            {CASE_STATUS_LABELS[item.currentStatus]}
                          </span>
                        </div>
                        {!item.canProcess && item.reason && (
                          <p className="text-sm text-red-600 mt-1">{item.reason}</p>
                        )}
                      </div>
                    </div>
                    <span className="font-bold text-blue-600">
                      ¥{item.refundAmount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  操作备注
                </label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="请输入操作备注（选填）"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={() => setStep('confirm')}
                  disabled={loading || previewData.processableCount === 0}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      加载中...
                    </span>
                  ) : (
                    '确认处理'
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle className="w-10 h-10 text-yellow-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-3">
                  确认执行{BATCH_OPERATION_LABELS[action]}？
                </h3>
                <p className="text-gray-500 mb-6">
                  即将对 <span className="font-bold text-blue-600">{previewData?.processableCount}</span> 笔案件执行
                  {BATCH_OPERATION_LABELS[action]}，
                  涉及金额 <span className="font-bold text-blue-600">¥{previewData?.processableRefundAmount.toFixed(2)}</span>。
                  此操作不可撤销，请确认。
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('preview')}
                    className="flex-1 px-6 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all"
                  >
                    返回
                  </button>
                  <button
                    onClick={handleExecute}
                    disabled={loading}
                    className={`flex-1 px-6 py-3 text-white font-medium rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                      action === 'csRefund'
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600'
                        : 'bg-gradient-to-r from-orange-600 to-red-600'
                    }`}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        处理中...
                      </span>
                    ) : (
                      '确认提交'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 'result' && resultData && (
          <>
            <div className="p-6 border-b border-gray-100">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-600 font-medium">总计</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">
                    {resultData.totalCount}
                  </p>
                </div>
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-sm text-green-600 font-medium">成功</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">
                    {resultData.successCount}
                  </p>
                </div>
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="text-sm text-red-600 font-medium">失败</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">
                    {resultData.failedCount}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-600 font-medium">跳过</p>
                  <p className="text-2xl font-bold text-gray-700 mt-1">
                    {resultData.skippedCount}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-sm text-purple-600 font-medium">成功金额</p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">
                    ¥{resultData.successRefundAmount.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-2">
                {resultData.items.map((item, index) => (
                  <div
                    key={item.caseId}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                      item.status === 'success'
                        ? 'bg-green-50 border-green-100'
                        : item.status === 'failed'
                        ? 'bg-red-50 border-red-100'
                        : 'bg-gray-50 border-gray-100'
                    }`}
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="flex items-center gap-4">
                      {getResultIcon(item.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">
                            {item.orderNo}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                            v{item.currentVersion}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded">
                            {BATCH_ITEM_STATUS_LABELS[item.status]}
                          </span>
                        </div>
                        {item.errorMessage && (
                          <p className="text-sm text-red-600 mt-1">
                            {item.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="font-bold text-blue-600">
                      ¥{item.refundAmount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-gray-100">
              <button
                onClick={onClose}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all"
              >
                完成
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
