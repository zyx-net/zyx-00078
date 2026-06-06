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
  BatchListFilter
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

export async function exportRefundsCSV(
  startDate: string,
  endDate: string
): Promise<void> {
  const token = getToken();
  const response = await fetch(
    `${BASE_URL}/export/refunds?startDate=${startDate}&endDate=${endDate}&format=csv`,
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
  a.download = `refund_list_${startDate}_${endDate}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
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
