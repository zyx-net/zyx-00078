import { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, XCircle, SkipForward, Loader2, Clock, Undo2 } from 'lucide-react';
import { previewRevokeBatch, executeRevokeBatch } from '@/utils/api';
import {
  BatchRevokePreviewResponse,
  BatchRevokeExecuteResponse,
  BatchItemStatus,
  CaseStatus,
  CASE_STATUS_LABELS,
  BATCH_REVOKE_ITEM_STATUS_LABELS,
  ERROR_CODES
} from '../../shared/types';

interface BatchRevokeModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: number | null;
  batchNo: string;
  onSuccess: (result: BatchRevokeExecuteResponse) => void;
}

export default function BatchRevokeModal({
  isOpen,
  onClose,
  batchId,
  batchNo,
  onSuccess
}: BatchRevokeModalProps) {
  const [step, setStep] = useState<'preview' | 'confirm' | 'result'>('preview');
  const [previewData, setPreviewData] = useState<BatchRevokePreviewResponse | null>(null);
  const [resultData, setResultData] = useState<BatchRevokeExecuteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && batchId !== null) {
      setStep('preview');
      setPreviewData(null);
      setResultData(null);
      setError('');
      setRemark('');
      loadPreview();
    }
  }, [isOpen, batchId]);

  const loadPreview = async () => {
    if (batchId === null) return;

    setLoading(true);
    setError('');
    try {
      const result = await previewRevokeBatch({
        batchId
      });
      if (result.success && result.data) {
        setPreviewData(result.data);
      } else {
        setError(result.error?.message || '撤销预览失败');
      }
    } catch {
      setError('撤销预览失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!previewData || batchId === null) return;

    setLoading(true);
    setError('');
    try {
      const versions: Record<number, number> = {};
      previewData.items.forEach(item => {
        versions[item.caseId] = item.currentVersion;
      });

      const result = await executeRevokeBatch({
        batchId,
        remark,
        versions
      });
      if (result.success && result.data) {
        setResultData(result.data);
        setStep('result');
        onSuccess(result.data);
      } else {
        setError(result.error?.message || '撤销失败');
      }
    } catch {
      setError('撤销失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getStatusIcon = (canRevoke: boolean, reason?: string) => {
    if (canRevoke) {
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Undo2 className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">
                撤销批次
              </h2>
              {step === 'preview' && (
                <p className="text-sm text-gray-500 mt-1">
                  批次号：{batchNo}
                </p>
              )}
              {step === 'result' && resultData && (
                <p className="text-sm text-gray-500 mt-1">
                  撤销记录ID：{resultData.revokeId}
                </p>
              )}
            </div>
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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-600 font-medium">总案件数</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">
                    {previewData.totalCount}
                  </p>
                </div>
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-sm text-green-600 font-medium">可撤销</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">
                    {previewData.revocableCount}
                  </p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4">
                  <p className="text-sm text-orange-600 font-medium">不可撤销</p>
                  <p className="text-2xl font-bold text-orange-700 mt-1">
                    {previewData.unrevocableCount}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-sm text-purple-600 font-medium">涉及金额</p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">
                    ¥{previewData.totalRefundAmount.toFixed(2)}
                  </p>
                </div>
                <div className="bg-indigo-50 rounded-xl p-4">
                  <p className="text-sm text-indigo-600 font-medium">可撤销金额</p>
                  <p className="text-2xl font-bold text-indigo-700 mt-1">
                    ¥{previewData.revocableRefundAmount.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {previewData.unrevocableCount > 0 && (
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800">
                      存在 {previewData.unrevocableCount} 笔不可撤销的案件
                    </p>
                    <p className="text-sm text-yellow-700 mt-1">
                      这些案件已被后续处理或状态已变更，将被自动跳过，请查看下方列表了解原因
                    </p>
                  </div>
                </div>
              )}

              {!previewData.canRevokeBatch && previewData.batchNotRevocableReason && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800">
                      无法撤销该批次
                    </p>
                    <p className="text-sm text-red-700 mt-1">
                      {previewData.batchNotRevocableReason}
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">撤销明细</h3>
                <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
                  <p className="mb-2"><span className="font-medium">说明：</span>撤销操作将把可撤销的案件状态回滚到批次执行前的状态，版本号会递增。</p>
                  <p><span className="font-medium">注意：</span>已经被单独处理或再次批量处理过的案件无法撤销。</p>
                </div>
              </div>

              <div className="space-y-2">
                {previewData.items.map((item, index) => (
                  <div
                    key={item.caseId}
                    className={`p-4 rounded-xl border transition-all ${
                      item.canRevoke
                        ? 'bg-gray-50 border-gray-100'
                        : 'bg-red-50 border-red-100'
                    }`}
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        {getStatusIcon(item.canRevoke, item.revokeReason)}
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="font-medium text-gray-800">
                              {item.orderNo}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                              当前 v{item.currentVersion}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded">
                              批次后 v{item.originalVersion}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded">
                              目标 v{item.targetVersion}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">当前状态：</span>
                              <span className="font-medium text-gray-700">
                                {CASE_STATUS_LABELS[item.currentStatus as CaseStatus]}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">批次后状态：</span>
                              <span className="font-medium text-blue-600">
                                {CASE_STATUS_LABELS[item.originalStatus as CaseStatus]}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">撤销目标：</span>
                              <span className="font-medium text-green-600">
                                {CASE_STATUS_LABELS[item.targetStatus as CaseStatus]}
                              </span>
                            </div>
                          </div>
                          {!item.canRevoke && item.revokeReason && (
                            <p className="text-sm text-red-600 mt-2">
                              <XCircle className="w-3.5 h-3.5 inline mr-1" />
                              {item.revokeReason}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="font-bold text-blue-600">
                        ¥{item.refundAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  撤销备注
                </label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="请输入撤销备注（选填）"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all resize-none"
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
                  disabled={loading || !previewData.canRevokeBatch}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white font-medium rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      加载中...
                    </span>
                  ) : (
                    '确认撤销'
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
                <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle className="w-10 h-10 text-orange-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-3">
                  确认撤销该批次？
                </h3>
                <p className="text-gray-500 mb-6">
                  即将撤销批次 <span className="font-bold text-orange-600">{batchNo}</span>，
                  将对 <span className="font-bold text-orange-600">{previewData?.revocableCount}</span> 笔案件执行撤销，
                  涉及金额 <span className="font-bold text-orange-600">¥{previewData?.revocableRefundAmount.toFixed(2)}</span>。
                  撤销后案件状态将回滚，版本号会递增，请确认。
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
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white font-medium rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        撤销中...
                      </span>
                    ) : (
                      '确认提交撤销'
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
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-600 font-medium">总计</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">{resultData.totalCount}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-sm text-green-600 font-medium">撤销成功</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">{resultData.successCount}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="text-sm text-red-600 font-medium">撤销失败</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{resultData.failedCount}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-600 font-medium">跳过</p>
                  <p className="text-2xl font-bold text-gray-700 mt-1">{resultData.skippedCount}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-sm text-purple-600 font-medium">涉及金额</p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">
                    ¥{resultData.totalRefundAmount.toFixed(2)}
                  </p>
                </div>
                <div className="bg-indigo-50 rounded-xl p-4">
                  <p className="text-sm text-indigo-600 font-medium">成功金额</p>
                  <p className="text-2xl font-bold text-indigo-700 mt-1">
                    ¥{resultData.successRefundAmount.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">撤销结果明细</h3>
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
                          <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded">
                            {BATCH_REVOKE_ITEM_STATUS_LABELS[item.status]}
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
                className="w-full px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all"
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
