import { ExcelColumnMap, LedgerItem, SourceFilter, UserProfile, WorkspaceState } from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  createFreshAccount: (payload: {
    display_name: string;
    currency: string;
    monthly_income?: number;
    current_savings?: number;
    goal_name?: string;
    goal_target?: number;
    month?: string;
  }) =>
    request<WorkspaceState>('/api/account/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getWorkspace: (userId: string, month: string, source: SourceFilter = 'all') =>
    request<WorkspaceState>(
      `/api/workspace?userId=${encodeURIComponent(userId)}&month=${encodeURIComponent(month)}&source=${encodeURIComponent(source)}`
    ),

  saveProfile: (user_id: string, month: string, profile: Partial<UserProfile>) =>
    request<WorkspaceState>('/api/profile', {
      method: 'POST',
      body: JSON.stringify({ user_id, month, profile }),
    }),

  ingestBankCsv: (user_id: string, month: string, csv_text: string, filename?: string, replace_existing = true) =>
    request<WorkspaceState & { ingested_count?: number }>('/api/ingest/csv', {
      method: 'POST',
      body: JSON.stringify({ user_id, month, csv_text, filename, replace_existing }),
    }),

  carryForwardMonth: (user_id: string, source_month: string, target_month: string) =>
    request<WorkspaceState & { carried_count?: number }>('/api/month/carry-forward', {
      method: 'POST',
      body: JSON.stringify({ user_id, source_month, target_month }),
    }),

  ingestExcelRows: (payload: {
    user_id: string;
    month: string;
    rows: Array<Record<string, unknown>>;
    column_map: ExcelColumnMap;
    sheet_name: string;
    filename: string;
    save_mapping: boolean;
    replace_existing: boolean;
  }) =>
    request<WorkspaceState & { ingested_count?: number }>('/api/ingest/excel', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  upsertLedgerItem: (user_id: string, month: string, item: Partial<LedgerItem>) =>
    request<WorkspaceState>('/api/ledger', {
      method: 'POST',
      body: JSON.stringify({ user_id, month, item }),
    }),

  deleteLedgerItem: (userId: string, month: string, txId: string) =>
    request<WorkspaceState>(
      `/api/ledger?userId=${encodeURIComponent(userId)}&month=${encodeURIComponent(month)}&txId=${encodeURIComponent(txId)}`,
      { method: 'DELETE' }
    ),

  analyzeFinances: (user_id: string, month: string, source: SourceFilter = 'all') =>
    request<WorkspaceState>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ user_id, month, source }),
    }),

  chatWithCoach: (user_id: string, month: string, question: string) =>
    request<{ reply: string; mode: string; model_id: string; chat_history: WorkspaceState['chat_history'] }>(
      '/api/chat',
      {
        method: 'POST',
        body: JSON.stringify({ user_id, month, question }),
      }
    ),

  loadDemoPersona: (persona: string, user_id: string) =>
    request<WorkspaceState>('/api/demo/load', {
      method: 'POST',
      body: JSON.stringify({ persona, user_id }),
    }),

  exportWorkspace: (userId: string) =>
    request<Record<string, unknown>>(`/api/export?userId=${encodeURIComponent(userId)}`),

  importWorkspace: (user_id: string, month: string, bundle: Record<string, unknown>) =>
    request<WorkspaceState>('/api/import', {
      method: 'POST',
      body: JSON.stringify({ user_id, month, bundle }),
    }),
};
