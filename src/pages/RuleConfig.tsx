import { useState, useEffect } from 'react';
import {
  Plus,
  Download,
  Upload,
  Edit2,
  Trash2,
  Power,
  PowerOff,
  Search,
  X,
  Check,
  AlertCircle,
  History,
  FileText,
  ChevronDown
} from 'lucide-react';
import {
  getRules,
  createRule,
  updateRule,
  deleteRule,
  enableRule,
  disableRule,
  exportRulesCSV,
  importRulesCSV,
  getCsList,
  getMerchants,
  getRuleAuditLogs
} from '@/utils/api';
import {
  ArbitrationRule,
  CreateRuleRequest,
  UpdateRuleRequest,
  CaseType,
  ResponsibleParty,
  RuleSuggestedAction,
  CASE_TYPE_LABELS,
  RESPONSIBLE_PARTY_LABELS,
  RULE_SUGGESTED_ACTION_LABELS,
  RULE_OPERATION_TYPE_LABELS,
  RuleAuditLog,
  RULE_ERROR_CODES
} from '../../shared/types';

interface FormData {
  caseType: CaseType | null;
  responsibleParty: ResponsibleParty | null;
  refundAmountMin: number;
  refundAmountMax: number;
  merchantId: number | null;
  priority: number;
  suggestedAction: RuleSuggestedAction;
  assignedCsId: number | null;
  remark: string | null;
}

const initialFormData: FormData = {
  caseType: null,
  responsibleParty: null,
  refundAmountMin: 0,
  refundAmountMax: 999999.99,
  merchantId: null,
  priority: 1,
  suggestedAction: 'review',
  assignedCsId: null,
  remark: null
};

export default function RuleConfig() {
  const [rules, setRules] = useState<ArbitrationRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<ArbitrationRule | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [csList, setCsList] = useState<Array<{ id: number; name: string }>>([]);
  const [merchantList, setMerchantList] = useState<Array<{ id: number; name: string }>>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<RuleAuditLog[]>([]);
  const [selectedRule, setSelectedRule] = useState<ArbitrationRule | null>(null);
  const [filter, setFilter] = useState({
    caseType: '' as CaseType | '',
    responsibleParty: '' as ResponsibleParty | '',
    isEnabled: '' as string,
    keyword: ''
  });
  const [showImportModal, setShowImportModal] = useState(false);
  const [importContent, setImportContent] = useState('');
  const [importResult, setImportResult] = useState<any>(null);

  useEffect(() => {
    loadData();
    loadSelectOptions();
  }, []);

  useEffect(() => {
    loadRules();
  }, [filter]);

  const loadData = async () => {
    await loadRules();
  };

  const loadRules = async () => {
    setLoading(true);
    try {
      const filterParams: any = {};
      if (filter.caseType) filterParams.caseType = filter.caseType;
      if (filter.responsibleParty) filterParams.responsibleParty = filter.responsibleParty;
      if (filter.isEnabled !== '') filterParams.isEnabled = filter.isEnabled === 'true';
      if (filter.keyword) filterParams.keyword = filter.keyword;

      const result = await getRules(filterParams);
      if (result.success && result.data) {
        setRules(result.data);
      }
    } catch (err: any) {
      setError(err.message || '加载规则列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadSelectOptions = async () => {
    try {
      const [csResult, merchantResult] = await Promise.all([
        getCsList(),
        getMerchants()
      ]);
      
      if (csResult.success && csResult.data) {
        setCsList(csResult.data);
      }
      if (merchantResult.success && merchantResult.data) {
        setMerchantList(merchantResult.data);
      }
    } catch (err: any) {
      console.error('加载选项失败:', err);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (formData.priority <= 0) {
      errors.priority = '优先级必须大于0';
    }
    if (formData.refundAmountMin < 0 || formData.refundAmountMax < 0) {
      errors.refundAmount = '退款金额不能为负数';
    }
    if (formData.refundAmountMin > formData.refundAmountMax) {
      errors.refundAmount = '最低金额不能大于最高金额';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleOpenCreate = () => {
    setEditingRule(null);
    setFormData(initialFormData);
    setFormErrors({});
    setShowModal(true);
  };

  const handleEdit = (rule: ArbitrationRule) => {
    setEditingRule(rule);
    setFormData({
      caseType: rule.caseType,
      responsibleParty: rule.responsibleParty,
      refundAmountMin: rule.refundAmountMin,
      refundAmountMax: rule.refundAmountMax,
      merchantId: rule.merchantId,
      priority: rule.priority,
      suggestedAction: rule.suggestedAction,
      assignedCsId: rule.assignedCsId,
      remark: rule.remark
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');
    try {
      const requestData: CreateRuleRequest = {
        ...formData
      };

      let result;
      if (editingRule) {
        const updateData: UpdateRuleRequest = {
          ...requestData,
          version: editingRule.version
        };
        result = await updateRule(editingRule.id, updateData);
      } else {
        result = await createRule(requestData);
      }

      if (result.success) {
        setSuccess(editingRule ? '规则更新成功' : '规则创建成功');
        setShowModal(false);
        await loadRules();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        if (result.error?.code === RULE_ERROR_CODES.VERSION_CONFLICT) {
          setError('规则版本冲突，请刷新后重试');
        } else if (result.error?.code === RULE_ERROR_CODES.DUPLICATE_PRIORITY) {
          setError('优先级 ' + formData.priority + ' 已被使用，请选择其他优先级');
        } else {
          setError(result.error?.message || '保存失败');
        }
      }
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (rule: ArbitrationRule) => {
    if (!confirm('确定要删除规则 #' + rule.id + ' 吗？')) return;

    try {
      const result = await deleteRule(rule.id);
      if (result.success) {
        setSuccess('规则删除成功');
        await loadRules();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.error?.message || '删除失败');
      }
    } catch (err: any) {
      setError(err.message || '删除失败');
    }
  };

  const handleToggleStatus = async (rule: ArbitrationRule) => {
    try {
      const result = rule.isEnabled 
        ? await disableRule(rule.id)
        : await enableRule(rule.id);
      
      if (result.success) {
        setSuccess(rule.isEnabled ? '规则已禁用' : '规则已启用');
        await loadRules();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.error?.message || '操作失败');
      }
    } catch (err: any) {
      setError(err.message || '操作失败');
    }
  };

  const handleViewAudit = async (rule: ArbitrationRule) => {
    setSelectedRule(rule);
    try {
      const result = await getRuleAuditLogs(rule.id);
      if (result.success && result.data) {
        setAuditLogs(result.data);
        setShowAuditModal(true);
      }
    } catch (err: any) {
      setError(err.message || '加载审计日志失败');
    }
  };

  const handleExport = async () => {
    try {
      await exportRulesCSV();
      setSuccess('规则导出成功');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '导出失败');
    }
  };

  const handleImport = async () => {
    if (!importContent.trim()) {
      setError('请输入CSV内容');
      return;
    }

    setLoading(true);
    try {
      const result = await importRulesCSV(importContent);
      if (result.success && result.data) {
        setImportResult(result.data);
        if (result.data.successCount > 0) {
          setSuccess('导入成功: ' + result.data.successCount + ' 条规则');
          await loadRules();
          setTimeout(() => setSuccess(''), 3000);
        }
        if (result.data.failedCount > 0) {
          setError('导入失败: ' + result.data.failedCount + ' 条规则');
        }
      } else {
          setError(result.error?.message || '导入失败');
        }
    } catch (err: any) {
      setError(err.message || '导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImportContent(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const getStatusBadgeClass = (isEnabled: boolean) => {
    return isEnabled
      ? 'bg-green-100 text-green-700'
      : 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-6">
      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
          <Check className="w-5 h-5" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">规则配置</h1>
          <p className="text-sm text-gray-500 mt-1">管理售后仲裁规则，支持按多维度匹配和自动分派</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            导入CSV
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            导出CSV
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
          >
            <Plus className="w-4 h-4" />
            新建规则
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">售后类型</label>
            <select
              value={filter.caseType}
              onChange={(e) => setFilter(prev => ({ ...prev, caseType: e.target.value as CaseType | '' }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="">全部</option>
              {Object.entries(CASE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">责任方</label>
            <select
              value={filter.responsibleParty}
              onChange={(e) => setFilter(prev => ({ ...prev, responsibleParty: e.target.value as ResponsibleParty | '' }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="">全部</option>
              {Object.entries(RESPONSIBLE_PARTY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
            <select
              value={filter.isEnabled}
              onChange={(e) => setFilter(prev => ({ ...prev, isEnabled: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="">全部</option>
              <option value="true">启用</option>
              <option value="false">禁用</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">关键词</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={filter.keyword}
                onChange={(e) => setFilter(prev => ({ ...prev, keyword: e.target.value }))}
                placeholder="搜索建议动作或备注"
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      )}

      {!loading && rules.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">暂无规则</h3>
          <p className="text-gray-500 mb-4">点击「新建规则」创建第一条仲裁规则</p>
        </div>
      )}

      {!loading && rules.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    优先级
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    售后类型
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    责任方
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    金额区间
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    商家
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    建议动作
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    分派客服
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-700 rounded-lg font-bold">
                        {rule.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {rule.caseType ? CASE_TYPE_LABELS[rule.caseType] : '全部'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {rule.responsibleParty ? RESPONSIBLE_PARTY_LABELS[rule.responsibleParty] : '全部'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ¥{rule.refundAmountMin.toFixed(2)} - ¥{rule.refundAmountMax.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {rule.merchantId 
                        ? merchantList.find(m => m.id === rule.merchantId)?.name || '未知'
                        : '全部'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={'inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ' + (
                        rule.suggestedAction === 'csRefund' ? 'bg-green-100 text-green-700' :
                        rule.suggestedAction === 'csReject' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      )}>
                        {RULE_SUGGESTED_ACTION_LABELS[rule.suggestedAction]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {rule.assignedCsName || '未分派'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={'inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ' + getStatusBadgeClass(rule.isEnabled)}>
                        {rule.isEnabled ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleStatus(rule)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title={rule.isEnabled ? '禁用' : '启用'}
                        >
                          {rule.isEnabled ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleEdit(rule)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleViewAudit(rule)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="审计日志"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(rule)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-800">
                {editingRule ? '编辑规则' : '新建规则'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">优先级 *</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.priority}
                    onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 1 }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {formErrors.priority && (
                    <p className="text-red-500 text-sm mt-1">{formErrors.priority}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">建议动作 *</label>
                  <select
                    value={formData.suggestedAction}
                    onChange={(e) => setFormData(prev => ({ ...prev, suggestedAction: e.target.value as RuleSuggestedAction }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    {Object.entries(RULE_SUGGESTED_ACTION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">售后类型</label>
                  <select
                    value={formData.caseType || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, caseType: (e.target.value as CaseType) || null }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">全部</option>
                    {Object.entries(CASE_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">责任方</label>
                  <select
                    value={formData.responsibleParty || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, responsibleParty: (e.target.value as ResponsibleParty) || null }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">全部</option>
                    {Object.entries(RESPONSIBLE_PARTY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最低金额 (¥)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.refundAmountMin}
                    onChange={(e) => setFormData(prev => ({ ...prev, refundAmountMin: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最高金额 (¥)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.refundAmountMax}
                    onChange={(e) => setFormData(prev => ({ ...prev, refundAmountMax: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {formErrors.refundAmount && (
                  <div className="sm:col-span-2">
                    <p className="text-red-500 text-sm">{formErrors.refundAmount}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">指定商家</label>
                  <select
                    value={formData.merchantId || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, merchantId: e.target.value ? parseInt(e.target.value) : null }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">全部</option>
                    {merchantList.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">分派客服</label>
                  <select
                    value={formData.assignedCsId || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, assignedCsId: e.target.value ? parseInt(e.target.value) : null }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="">不指定</option>
                    {csList.map(cs => (
                      <option key={cs.id} value={cs.id}>{cs.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={formData.remark || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, remark: e.target.value || null }))}
                  placeholder="输入规则备注..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAuditModal && selectedRule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-800">
                规则 #{selectedRule.id} 审计日志
              </h3>
              <button
                onClick={() => setShowAuditModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {auditLogs.length === 0 ? (
                <div className="text-center py-8">
                  <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">暂无审计记录</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {RULE_OPERATION_TYPE_LABELS[log.operationType]}
                        </span>
                        <span className="text-sm text-gray-500">{log.operatorName}</span>
                      </div>
                      {log.remark && (
                        <p className="text-gray-700 text-sm mb-2">{log.remark}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-800">导入规则CSV</h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportContent('');
                  setImportResult(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">选择CSV文件</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">或粘贴CSV内容</label>
                <textarea
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  placeholder="粘贴CSV内容，第一行为表头..."
                  rows={10}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
              </div>
              {importResult && (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-green-600">{importResult.successCount}</p>
                      <p className="text-sm text-gray-500">成功</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-600">{importResult.failedCount}</p>
                      <p className="text-sm text-gray-500">失败</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-600">{importResult.skippedCount}</p>
                      <p className="text-sm text-gray-500">跳过</p>
                    </div>
                  </div>
                  {importResult.errors?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-sm font-medium text-gray-700 mb-2">错误详情:</p>
                      <ul className="text-sm text-red-600 space-y-1 max-h-32 overflow-y-auto">
                        {importResult.errors.map((err: any, idx: number) => (
                          <li key={idx}>第{err.row}行: {err.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {importResult.warnings?.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-sm font-medium text-gray-700 mb-2">警告:</p>
                      <ul className="text-sm text-yellow-600 space-y-1 max-h-32 overflow-y-auto">
                        {importResult.warnings.map((warn: any, idx: number) => (
                          <li key={idx}>第{warn.row}行: {warn.warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportContent('');
                  setImportResult(null);
                }}
                className="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={handleImport}
                disabled={loading || !importContent.trim()}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '导入中...' : '导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
