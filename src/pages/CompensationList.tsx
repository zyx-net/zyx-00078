import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getCompensations, createCompensation, updateCompensation, fulfillCompensation, cancelCompensation, exportCompensationsCSV, importCompensationsCSV } from '../utils/api';
import { CompensationCommitment, CompensationCommitmentStatus, CompensationCommitmentType, COMPENSATION_COMMITMENT_STATUS_LABELS, COMPENSATION_COMMITMENT_TYPE_LABELS, CompensationCommitmentListFilter, CreateCompensationCommitmentRequest, UpdateCompensationCommitmentRequest, USER_ROLE_LABELS } from '../../shared/types';
import { useAuthStore } from '../store/authStore';
import { CompensationStatusBadge, CompensationTypeBadge } from '../components/StatusBadge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { toast } from 'sonner';

const STATUS_OPTIONS: { value: CompensationCommitmentStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'pendingFulfillment', label: COMPENSATION_COMMITMENT_STATUS_LABELS.pendingFulfillment },
  { value: 'fulfilled', label: COMPENSATION_COMMITMENT_STATUS_LABELS.fulfilled },
  { value: 'overdue', label: COMPENSATION_COMMITMENT_STATUS_LABELS.overdue },
  { value: 'cancelled', label: COMPENSATION_COMMITMENT_STATUS_LABELS.cancelled }
];

const TYPE_OPTIONS: { value: CompensationCommitmentType | 'all'; label: string }[] = [
  { value: 'all', label: '全部类型' },
  { value: 'cash', label: COMPENSATION_COMMITMENT_TYPE_LABELS.cash },
  { value: 'coupon', label: COMPENSATION_COMMITMENT_TYPE_LABELS.coupon },
  { value: 'reship', label: COMPENSATION_COMMITMENT_TYPE_LABELS.reship },
  { value: 'offline', label: COMPENSATION_COMMITMENT_TYPE_LABELS.offline }
];

export default function CompensationList() {
  const { user } = useAuthStore();
  const [commitments, setCommitments] = useState<CompensationCommitment[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<CompensationCommitmentListFilter>({
    status: undefined,
    type: undefined,
    startDate: '',
    endDate: '',
    keyword: ''
  });
  const [showModal, setShowModal] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<CompensationCommitment | null>(null);
  const [showFulfillModal, setShowFulfillModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState<CompensationCommitment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fulfillRemark, setFulfillRemark] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [formData, setFormData] = useState<Partial<CreateCompensationCommitmentRequest>>({
    caseId: 0,
    type: 'cash',
    amount: 0,
    dueDate: '',
    remark: '',
    attachment: '',
    couponName: '',
    couponValue: 0,
    productName: '',
    productQuantity: 0,
    offlineDetails: ''
  });

  const isCS = user?.role === 'cs';

  const filteredCommitments = useMemo(() => {
    let result = [...commitments];
    
    if (filter.status) {
      result = result.filter(c => c.status === filter.status);
    }
    if (filter.type) {
      result = result.filter(c => c.type === filter.type);
    }
    if (filter.startDate) {
      result = result.filter(c => c.createdAt >= filter.startDate!);
    }
    if (filter.endDate) {
      result = result.filter(c => c.createdAt <= filter.endDate!);
    }
    if (filter.keyword) {
      const keyword = filter.keyword.toLowerCase();
      result = result.filter(c =>
        c.commitmentNo.toLowerCase().includes(keyword) ||
        c.remark?.toLowerCase().includes(keyword)
      );
    }
    
    return result;
  }, [commitments, filter]);

  const stats = useMemo(() => {
    return {
      total: commitments.length,
      pending: commitments.filter(c => c.status === 'pendingFulfillment').length,
      fulfilled: commitments.filter(c => c.status === 'fulfilled').length,
      overdue: commitments.filter(c => c.status === 'overdue').length,
      cancelled: commitments.filter(c => c.status === 'cancelled').length
    };
  }, [commitments]);

  async function loadCommitments() {
    setLoading(true);
    try {
      const response = await getCompensations();
      if (response.code === 0 && Array.isArray(response.data)) {
        setCommitments(response.data);
      }
    } catch (error) {
      toast.error('加载赔付承诺失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCommitments();
  }, []);

  function handleOpenCreate() {
    setEditingCommitment(null);
    setFormData({
      caseId: 0,
      type: 'cash',
      amount: 0,
      dueDate: '',
      remark: '',
      attachment: '',
      couponName: '',
      couponValue: 0,
      productName: '',
      productQuantity: 0,
      offlineDetails: ''
    });
    setShowModal(true);
  }

  function handleOpenEdit(commitment: CompensationCommitment) {
    setEditingCommitment(commitment);
    setFormData({
      caseId: commitment.caseId,
      type: commitment.type,
      amount: commitment.amount,
      dueDate: commitment.dueDate || '',
      remark: commitment.remark || '',
      attachment: commitment.attachment || '',
      couponName: commitment.couponName || '',
      couponValue: commitment.couponValue || 0,
      productName: commitment.productName || '',
      productQuantity: commitment.productQuantity || 0,
      offlineDetails: commitment.offlineDetails || ''
    });
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!formData.caseId || formData.caseId <= 0) {
      toast.error('请输入有效的案件ID');
      return;
    }
    if (!formData.dueDate) {
      toast.error('请选择履约截止日期');
      return;
    }

    if (formData.type === 'coupon') {
      if (!formData.couponName) {
        toast.error('请输入优惠券名称');
        return;
      }
      if (!formData.couponValue || formData.couponValue <= 0) {
        toast.error('请输入有效的优惠券面值');
        return;
      }
    } else if (formData.type === 'reship') {
      if (!formData.productName) {
        toast.error('请输入补寄商品名称');
        return;
      }
      if (!formData.productQuantity || formData.productQuantity <= 0) {
        toast.error('请输入有效的商品数量');
        return;
      }
    } else if (formData.type === 'offline') {
      if (!formData.offlineDetails) {
        toast.error('请输入线下承诺详情');
        return;
      }
    }

    try {
      if (editingCommitment) {
        const response = await updateCompensation(editingCommitment.id, {
          ...formData as UpdateCompensationCommitmentRequest,
          version: editingCommitment.version
        });
        if (response.code === 0) {
          toast.success('更新成功');
          setShowModal(false);
          loadCommitments();
        } else if (response.code === 40901) {
          toast.error(`版本冲突：${response.message}，请刷新后重试`);
        } else {
          toast.error(response.message || '更新失败');
        }
      } else {
        const response = await createCompensation(formData as CreateCompensationCommitmentRequest);
        if (response.code === 0) {
          toast.success('创建成功');
          setShowModal(false);
          loadCommitments();
        } else {
          toast.error(response.message || '创建失败');
        }
      }
    } catch (error) {
      toast.error('操作失败');
    }
  }

  function handleOpenFulfill(commitment: CompensationCommitment) {
    setSelectedCommitment(commitment);
    setFulfillRemark('');
    setShowFulfillModal(true);
  }

  async function handleFulfill() {
    if (!selectedCommitment) return;
    
    try {
      const response = await fulfillCompensation(selectedCommitment.id, {
        remark: fulfillRemark,
        version: selectedCommitment.version
      });
      if (response.code === 0) {
        toast.success('标记履约成功');
        setShowFulfillModal(false);
        loadCommitments();
      } else if (response.code === 40901) {
        toast.error(`版本冲突：${response.message}，请刷新后重试`);
      } else {
        toast.error(response.message || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    }
  }

  function handleOpenCancel(commitment: CompensationCommitment) {
    setSelectedCommitment(commitment);
    setCancelReason('');
    setShowCancelModal(true);
  }

  async function handleCancel() {
    if (!selectedCommitment) return;
    if (!cancelReason.trim()) {
      toast.error('请输入取消原因');
      return;
    }
    
    try {
      const response = await cancelCompensation(selectedCommitment.id, {
        cancelReason,
        version: selectedCommitment.version
      });
      if (response.code === 0) {
        toast.success('取消成功');
        setShowCancelModal(false);
        loadCommitments();
      } else if (response.code === 40901) {
        toast.error(`版本冲突：${response.message}，请刷新后重试`);
      } else {
        toast.error(response.message || '操作失败');
      }
    } catch (error) {
      toast.error('操作失败');
    }
  }

  async function handleExport() {
    try {
      await exportCompensationsCSV(filter);
      toast.success('导出成功');
    } catch (error) {
      toast.error('导出失败');
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      try {
        const response = await importCompensationsCSV(content);
        if (response.code === 0 && response.data) {
          const result = response.data;
          toast.success(`导入完成：成功 ${result.successCount} 条，失败 ${result.failCount} 条`);
          if (result.errors.length > 0) {
            console.error('导入错误:', result.errors);
          }
          loadCommitments();
        } else {
          toast.error(response.message || '导入失败');
        }
      } catch (error) {
        toast.error('导入失败');
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  function getDisplayValue(commitment: CompensationCommitment) {
    switch (commitment.type) {
      case 'cash':
        return `¥${commitment.amount.toFixed(2)}`;
      case 'coupon':
        return `${commitment.couponName || '-'} (¥${commitment.couponValue?.toFixed(2) || '0.00'})`;
      case 'reship':
        return `${commitment.productName || '-'} × ${commitment.productQuantity || 0}`;
      case 'offline':
        return commitment.offlineDetails || '-';
      default:
        return '-';
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">赔付承诺跟踪</h1>
        <p className="text-sm text-gray-500 mt-1">管理和跟踪所有售后赔付承诺的履约状态</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">全部</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-amber-500">
          <div className="text-sm text-gray-500">待履约</div>
          <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="text-sm text-gray-500">已履约</div>
          <div className="text-2xl font-bold text-green-600">{stats.fulfilled}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <div className="text-sm text-gray-500">已逾期</div>
          <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-400">
          <div className="text-sm text-gray-500">已取消</div>
          <div className="text-2xl font-bold text-gray-600">{stats.cancelled}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-wrap gap-4 items-center">
            <select
              value={filter.status || 'all'}
              onChange={(e) => setFilter({ ...filter, status: e.target.value === 'all' ? undefined : e.target.value as CompensationCommitmentStatus })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={filter.type || 'all'}
              onChange={(e) => setFilter({ ...filter, type: e.target.value === 'all' ? undefined : e.target.value as CompensationCommitmentType })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <input
              type="date"
              value={filter.startDate || ''}
              onChange={(e) => setFilter({ ...filter, startDate: e.target.value })}
              placeholder="开始日期"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />

            <input
              type="date"
              value={filter.endDate || ''}
              onChange={(e) => setFilter({ ...filter, endDate: e.target.value })}
              placeholder="结束日期"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />

            <input
              type="text"
              value={filter.keyword || ''}
              onChange={(e) => setFilter({ ...filter, keyword: e.target.value })}
              placeholder="搜索承诺编号或备注"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[200px]"
            />

            <div className="flex-1" />

            {isCS && (
              <>
                <button
                  onClick={handleImportClick}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                >
                  批量导入
                </button>
                <button
                  onClick={handleExport}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  导出CSV
                </button>
                <button
                  onClick={handleOpenCreate}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  新建承诺
                </button>
              </>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />

        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">承诺编号</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">关联案件</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">赔付内容</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">履约截止</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建人</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCommitments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                      暂无赔付承诺记录
                    </td>
                  </tr>
                ) : (
                  filteredCommitments.map(commitment => (
                    <tr key={commitment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <span className="font-mono text-sm text-blue-600">{commitment.commitmentNo}</span>
                      </td>
                      <td className="px-4 py-4">
                        <Link to={`/cases/${commitment.caseId}`} className="text-blue-600 hover:text-blue-800 text-sm">
                          案件 #{commitment.caseId}
                        </Link>
                      </td>
                      <td className="px-4 py-4">
                        <CompensationTypeBadge type={commitment.type} />
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-900">{getDisplayValue(commitment)}</span>
                      </td>
                      <td className="px-4 py-4">
                        <CompensationStatusBadge status={commitment.status} />
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-500">{commitment.dueDate || '-'}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm">
                          <div className="text-gray-900">{commitment.creatorName}</div>
                          <div className="text-gray-500 text-xs">{USER_ROLE_LABELS[commitment.creatorRole as keyof typeof USER_ROLE_LABELS]}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {isCS && commitment.status !== 'cancelled' && (
                            <>
                              {commitment.status !== 'fulfilled' && (
                                <button
                                  onClick={() => handleOpenEdit(commitment)}
                                  className="text-blue-600 hover:text-blue-800 text-sm"
                                >
                                  编辑
                                </button>
                              )}
                              {(commitment.status === 'pendingFulfillment' || commitment.status === 'overdue') && (
                                <button
                                  onClick={() => handleOpenFulfill(commitment)}
                                  className="text-green-600 hover:text-green-800 text-sm"
                                >
                                  标记履约
                                </button>
                              )}
                              {(commitment.status === 'pendingFulfillment' || commitment.status === 'overdue') && (
                                <button
                                  onClick={() => handleOpenCancel(commitment)}
                                  className="text-red-600 hover:text-red-800 text-sm"
                                >
                                  取消
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingCommitment ? '编辑赔付承诺' : '新建赔付承诺'}
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">关联案件ID *</label>
                  <input
                    type="number"
                    value={formData.caseId || ''}
                    onChange={(e) => setFormData({ ...formData, caseId: parseInt(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">承诺类型 *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as CompensationCommitmentType })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="cash">{COMPENSATION_COMMITMENT_TYPE_LABELS.cash}</option>
                    <option value="coupon">{COMPENSATION_COMMITMENT_TYPE_LABELS.coupon}</option>
                    <option value="reship">{COMPENSATION_COMMITMENT_TYPE_LABELS.reship}</option>
                    <option value="offline">{COMPENSATION_COMMITMENT_TYPE_LABELS.offline}</option>
                  </select>
                </div>
              </div>

              {formData.type === 'cash' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">赔付金额（元）*</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount || ''}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {formData.type === 'coupon' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">优惠券名称 *</label>
                    <input
                      type="text"
                      value={formData.couponName || ''}
                      onChange={(e) => setFormData({ ...formData, couponName: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">优惠券面值（元）*</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.couponValue || ''}
                      onChange={(e) => setFormData({ ...formData, couponValue: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {formData.type === 'reship' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">补寄商品名称 *</label>
                    <input
                      type="text"
                      value={formData.productName || ''}
                      onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">商品数量 *</label>
                    <input
                      type="number"
                      value={formData.productQuantity || ''}
                      onChange={(e) => setFormData({ ...formData, productQuantity: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {formData.type === 'offline' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">线下承诺详情 *</label>
                  <textarea
                    value={formData.offlineDetails || ''}
                    onChange={(e) => setFormData({ ...formData, offlineDetails: e.target.value })}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">履约截止日期 *</label>
                  <input
                    type="date"
                    value={formData.dueDate || ''}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">附件链接</label>
                <input
                  type="text"
                  value={formData.attachment || ''}
                  onChange={(e) => setFormData({ ...formData, attachment: e.target.value })}
                  placeholder="相关凭证或附件链接"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={formData.remark || ''}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  rows={3}
                  placeholder="协商内容或其他说明"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingCommitment ? '保存修改' : '创建承诺'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFulfillModal && selectedCommitment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">标记履约</h2>
              <p className="text-sm text-gray-500 mt-1">承诺编号: {selectedCommitment.commitmentNo}</p>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">履约备注</label>
              <textarea
                value={fulfillRemark}
                onChange={(e) => setFulfillRemark(e.target.value)}
                rows={3}
                placeholder="请输入履约说明（可选）"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowFulfillModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleFulfill}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                确认履约
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && selectedCommitment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">取消承诺</h2>
              <p className="text-sm text-gray-500 mt-1">承诺编号: {selectedCommitment.commitmentNo}</p>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">取消原因 *</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="请输入取消原因"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                确认取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
