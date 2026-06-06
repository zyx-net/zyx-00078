import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, AlertCircle, Send } from 'lucide-react';
import { getMerchants, createCase } from '@/utils/api';
import { useAuthStore } from '@/store/authStore';
import {
  CaseType,
  ResponsibleParty,
  CreateCaseRequest,
  CASE_TYPE_LABELS,
  RESPONSIBLE_PARTY_LABELS,
  User
} from '../../shared/types';

export default function NewCase() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [merchants, setMerchants] = useState<Array<Omit<User, 'passwordHash'>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<CreateCaseRequest>({
    orderNo: '',
    caseType: 'damaged',
    productName: '',
    quantity: 1,
    refundAmount: 0,
    responsibleParty: 'merchant',
    merchantId: 0,
    description: ''
  });

  useEffect(() => {
    const loadMerchants = async () => {
      const result = await getMerchants();
      if (result.success && result.data) {
        setMerchants(result.data);
        if (result.data.length > 0) {
          setFormData(prev => ({ ...prev, merchantId: result.data![0].id }));
        }
      }
    };
    loadMerchants();
  }, []);

  if (user?.role !== 'leader') {
    navigate('/cases');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await createCase(formData);
      if (result.success && result.data) {
        navigate(`/cases/${result.data.id}`);
      } else {
        setError(result.error?.message || '创建失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof CreateCaseRequest, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button
        onClick={() => navigate('/cases')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        返回列表
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">新建售后申请</h1>
            <p className="text-gray-500">请填写售后相关信息</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 mb-6">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                订单号 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.orderNo}
                onChange={(e) => handleChange('orderNo', e.target.value)}
                placeholder="请输入订单号"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                售后类型 <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.caseType}
                onChange={(e) => handleChange('caseType', e.target.value as CaseType)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                required
              >
                {(Object.keys(CASE_TYPE_LABELS) as CaseType[]).map(type => (
                  <option key={type} value={type}>{CASE_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                商品名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.productName}
                onChange={(e) => handleChange('productName', e.target.value)}
                placeholder="请输入商品名称"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                数量 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                退款金额 (元) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={formData.refundAmount || ''}
                onChange={(e) => handleChange('refundAmount', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                责任方 <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.responsibleParty}
                onChange={(e) => handleChange('responsibleParty', e.target.value as ResponsibleParty)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                required
              >
                {(Object.keys(RESPONSIBLE_PARTY_LABELS) as ResponsibleParty[]).map(party => (
                  <option key={party} value={party}>{RESPONSIBLE_PARTY_LABELS[party]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                商家 <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.merchantId}
                onChange={(e) => handleChange('merchantId', parseInt(e.target.value))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                required
              >
                {merchants.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              问题描述 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="请详细描述售后问题..."
              rows={4}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
              required
            />
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-sm text-blue-700">
                <strong>温馨提示：</strong>提交后案件将进入「待举证」状态，您需要上传凭证后才能进入下一流程。
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/cases')}
              className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  创建中...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  提交申请
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
