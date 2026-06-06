import {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  CreateCaseRequest,
  CaseActionRequest,
  Case,
  CaseDetail,
  CaseListFilter,
  User,
  BatchPreviewRequest,
  BatchPreviewResponse,
  BatchExecuteRequest,
  BatchExecuteResponse,
  BatchOperation,
  BatchDetail,
  BatchListFilter,
  BatchRevokePreviewRequest,
  BatchRevokePreviewResponse,
  BatchRevokeExecuteRequest,
  BatchRevokeExecuteResponse,
  ArbitrationRule,
  CreateRuleRequest,
  UpdateRuleRequest,
  RuleListFilter,
  RuleImportResult,
  RuleHitRecord,
  RuleAuditLog,
  RuleMatchResult,
  ExportRecord,
  ExportRecordListFilter,
  CreateExportResponse
} from '../../shared/types.js';

const BASE_URL = '/api';

function getToken(): string | null {
  const authData = localStorage.getItem('auth-storage');
  if (authData) {
    try {
      const parsed = JSON.parse(authData);
      return parsed.state?.token || null;
    } catch {
      return null;
    }
  }
  return null;
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${BASE_URL}${url}`, {
      ...options,
      headers
    });

    const data = await response.json();
    return data as ApiResponse<T>;
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '网络请求失败'
      }
    };
  }
}

export async function login(data: LoginRequest): Promise<ApiResponse<LoginResponse>> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function logout(): Promise<ApiResponse<{ message: string }>> {
  return request<{ message: string }>('/auth/logout', {
    method: 'POST'
  });
}

export async function getMerchants(): Promise<ApiResponse<Array<Omit<User, 'passwordHash'>>>> {
  return request<Array<Omit<User, 'passwordHash'>>>('/cases/merchants');
}

export async function getCases(filter: CaseListFilter = {}): Promise<ApiResponse<Case[]>> {
  const params = new URLSearchParams();
  if (filter.caseType) params.append('caseType', filter.caseType);
  if (filter.status) params.append('status', filter.status);
  if (filter.responsibleParty) params.append('responsibleParty', filter.responsibleParty);
  if (filter.keyword) params.append('keyword', filter.keyword);

  const query = params.toString();
  return request<Case[]>(`/cases${query ? `?${query}` : ''}`);
}

export async function getCaseDetail(id: number): Promise<ApiResponse<CaseDetail>> {
  return request<CaseDetail>(`/cases/${id}`);
}

export async function createCase(data: CreateCaseRequest): Promise<ApiResponse<Case>> {
  return request<Case>('/cases', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function executeCaseAction(
  id: number,
  data: CaseActionRequest
): Promise<ApiResponse<Case>> {
  return request<Case>(`/cases/${id}/action`, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function getRefunds(
  startDate: string,
  endDate: string
): Promise<ApiResponse<Case[]>> {
  return request<Case[]>(`/export/refunds?startDate=${startDate}&endDate=${endDate}`);
}

export async function createExportRecord(
  startDate: string,
  endDate: string
): Promise<ApiResponse<CreateExportResponse>> {
  return request<CreateExportResponse>('/export/refunds', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate })
  });
}

export async function downloadExportCSV(exportId: number): Promise<void> {
  const token = getToken();
  const response = await fetch(
    `${BASE_URL}/export/records/${exportId}/download`,
    {
      headers: {
        'Authorization': `Bearer ${token || ''}`
      }
    }
  );

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `refund_export_${exportId}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function getExportRecords(
  filter: ExportRecordListFilter = {}
): Promise<ApiResponse<ExportRecord[]>> {
  const params = new URLSearchParams();
  if (filter.startDate) params.append('startDate', filter.startDate);
  if (filter.endDate) params.append('endDate', filter.endDate);
  if (filter.operatorId !== undefined) params.append('operatorId', filter.operatorId.toString());

  const query = params.toString();
  return request<ExportRecord[]>(`/export/records${query ? `?${query}` : ''}`);
}

export async function getExportRecordDetail(
  id: number
): Promise<ApiResponse<ExportRecord>> {
  return request<ExportRecord>(`/export/records/${id}`);
}

export async function getExportOperators(): Promise<ApiResponse<Array<{ id: number; name: string }>>> {
  return request<Array<{ id: number; name: string }>>('/export/operators');
}

export async function previewBatch(
  data: BatchPreviewRequest): Promise<ApiResponse<BatchPreviewResponse>> {
  return request<BatchPreviewResponse>('/batch/preview', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function executeBatch(
  data: BatchExecuteRequest): Promise<ApiResponse<BatchExecuteResponse>> {
  return request<BatchExecuteResponse>('/batch/execute', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function getBatches(
  filter: BatchListFilter = {}
): Promise<ApiResponse<BatchOperation[]>> {
  const params = new URLSearchParams();
  if (filter.startDate) params.append('startDate', filter.startDate);
  if (filter.endDate) params.append('endDate', filter.endDate);
  if (filter.action) params.append('action', filter.action);

  const query = params.toString();
  return request<BatchOperation[]>(`/batch${query ? `?${query}` : ''}`);
}

export async function getBatchDetail(
  batchIdOrNo: string
): Promise<ApiResponse<BatchDetail>> {
  return request<BatchDetail>(`/batch/${batchIdOrNo}`);
}

export async function exportBatchCSV(
  batchId: number
): Promise<void> {
  const token = getToken();
  const response = await fetch(
    `${BASE_URL}/batch/${batchId}/export`,
    {
      headers: {
        'Authorization': `Bearer ${token || ''}`
      }
    }
  );

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `batch_${batchId}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function previewRevokeBatch(
  data: BatchRevokePreviewRequest
): Promise<ApiResponse<BatchRevokePreviewResponse>> {
  return request<BatchRevokePreviewResponse>('/batch/revoke/preview', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function executeRevokeBatch(
  data: BatchRevokeExecuteRequest
): Promise<ApiResponse<BatchRevokeExecuteResponse>> {
  return request<BatchRevokeExecuteResponse>('/batch/revoke/execute', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function exportRevokeBatchCSV(
  revokeId: number
): Promise<void> {
  const token = getToken();
  const response = await fetch(
    `${BASE_URL}/batch/revoke/${revokeId}/export`,
    {
      headers: {
        'Authorization': `Bearer ${token || ''}`
      }
    }
  );

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `revoke_batch_${revokeId}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function getCsList(): Promise<ApiResponse<Array<{ id: number; name: string }>>> {
  return request<Array<{ id: number; name: string }>>('/rules/cs-list');
}

export async function getRules(filter: RuleListFilter = {}): Promise<ApiResponse<ArbitrationRule[]>> {
  const params = new URLSearchParams();
  if (filter.caseType) params.append('caseType', filter.caseType);
  if (filter.responsibleParty) params.append('responsibleParty', filter.responsibleParty);
  if (filter.isEnabled !== undefined) params.append('isEnabled', filter.isEnabled.toString());
  if (filter.keyword) params.append('keyword', filter.keyword);

  const query = params.toString();
  return request<ArbitrationRule[]>(`/rules${query ? `?${query}` : ''}`);
}

export async function getRule(id: number): Promise<ApiResponse<ArbitrationRule>> {
  return request<ArbitrationRule>(`/rules/${id}`);
}

export async function createRule(data: CreateRuleRequest): Promise<ApiResponse<ArbitrationRule>> {
  return request<ArbitrationRule>('/rules', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function updateRule(id: number, data: UpdateRuleRequest): Promise<ApiResponse<ArbitrationRule>> {
  return request<ArbitrationRule>(`/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export async function deleteRule(id: number): Promise<ApiResponse<void>> {
  return request<void>(`/rules/${id}`, {
    method: 'DELETE'
  });
}

export async function enableRule(id: number): Promise<ApiResponse<ArbitrationRule>> {
  return request<ArbitrationRule>(`/rules/${id}/enable`, {
    method: 'POST'
  });
}

export async function disableRule(id: number): Promise<ApiResponse<ArbitrationRule>> {
  return request<ArbitrationRule>(`/rules/${id}/disable`, {
    method: 'POST'
  });
}

export async function getCaseRuleInfo(caseId: number): Promise<ApiResponse<(RuleHitRecord & { rule?: ArbitrationRule }) | null>> {
  return request<(RuleHitRecord & { rule?: ArbitrationRule }) | null>(`/rules/case/${caseId}/rule-info`);
}

export async function overrideRuleHit(caseId: number, overrideRemark: string): Promise<ApiResponse<void>> {
  return request<void>(`/rules/case/${caseId}/override`, {
    method: 'POST',
    body: JSON.stringify({ overrideRemark })
  });
}

export async function exportRulesCSV(): Promise<void> {
  const token = getToken();
  const response = await fetch(
    `${BASE_URL}/rules/export/csv`,
    {
      headers: {
        'Authorization': `Bearer ${token || ''}`
      }
    }
  );

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arbitration_rules_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function importRulesCSV(csvContent: string): Promise<ApiResponse<RuleImportResult>> {
  return request<RuleImportResult>('/rules/import/csv', {
    method: 'POST',
    body: JSON.stringify({ csvContent })
  });
}

export async function getRuleAuditLogs(ruleId: number): Promise<ApiResponse<RuleAuditLog[]>> {
  return request<RuleAuditLog[]>(`/rules/${ruleId}/audit-logs`);
}

export async function getCaseRuleAuditLogs(caseId: number): Promise<ApiResponse<RuleAuditLog[]>> {
  return request<RuleAuditLog[]>(`/rules/case/${caseId}/audit-logs`);
}

export async function getAllRuleAuditLogs(filter: {
  operationType?: string;
  operatorId?: number;
  startDate?: string;
  endDate?: string;
} = {}): Promise<ApiResponse<RuleAuditLog[]>> {
  const params = new URLSearchParams();
  if (filter.operationType) params.append('operationType', filter.operationType);
  if (filter.operatorId) params.append('operatorId', filter.operatorId.toString());
  if (filter.startDate) params.append('startDate', filter.startDate);
  if (filter.endDate) params.append('endDate', filter.endDate);

  const query = params.toString();
  return request<RuleAuditLog[]>(`/rules/audit-logs/all${query ? `?${query}` : ''}`);
}
