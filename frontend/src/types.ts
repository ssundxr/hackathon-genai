export type CurrencyCode = 'INR' | 'USD' | 'EUR';
export type SourceFilter = 'all' | 'bank_csv' | 'excel_portal';

export interface DebtItem {
  name: string;
  balance: number;
  apr: number;
  min_payment: number;
}

export interface UserProfile {
  display_name?: string;
  currency: CurrencyCode;
  monthly_income: number;
  secondary_income: number;
  current_savings: number;
  goal_name: string;
  goal_target: number;
  risk_tolerance: 'conservative' | 'moderate' | 'growth';
  income_stability: 'stable' | 'variable';
  preferred_input_mode: 'portal' | 'excel';
  debts: DebtItem[];
}

export interface ExcelColumnMap {
  date?: string;
  name: string;
  category?: string;
  amount: string;
  type?: string;
  recurring?: string;
}

export interface SavedExcelMapping {
  sheet_name: string;
  filename: string;
  column_map: ExcelColumnMap;
  updated_at?: number;
}

export interface LedgerItem {
  tx_id: string;
  date: string;
  month: string;
  name: string;
  category: string;
  bucket: 'needs' | 'wants' | 'savings' | 'income';
  amount: number;
  tx_type: 'income' | 'expense';
  source: 'bank_csv' | 'excel_import' | 'portal_entry';
  recurring: boolean;
}

export interface CategoryBreakdownItem {
  category: string;
  amount: number;
  pct_of_income: number;
  sources: string[];
}

export interface AlertItem {
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

export interface CutOpportunity {
  category: string;
  current_monthly: number;
  suggested_25pct_cut: number;
  annual_savings: number;
}

export interface DebtSimulationResult {
  strategy: string;
  months: number;
  total_interest: number;
  total_paid: number;
  timeline: Array<{ month: number; remaining_balance: number }>;
  payoff_order: Array<{ name: string; month: number }>;
}

export interface SavingsPoint {
  year: number;
  balance: number;
  contributed: number;
  interest_earned: number;
}

export interface MonthlySeriesPoint {
  month: string;
  income: number;
  needs: number;
  wants: number;
  savings: number;
  debt_balance: number;
  savings_pct: number;
  health_score: number;
}

export interface AnalyticsResult {
  month: string;
  source_filter: SourceFilter;
  currency: CurrencyCode;
  source_breakdown: {
    bank_csv: number;
    excel_import: number;
    portal_entry: number;
  };
  summary: {
    total_income: number;
    total_needs: number;
    total_wants: number;
    explicit_savings: number;
    effective_monthly_savings: number;
    net_surplus: number;
    total_debt_balance: number;
    debt_min_payments: number;
    current_savings: number;
    emergency_runway_months: number;
    recommended_emergency_fund: number;
  };
  ratios: {
    needs_pct: number;
    wants_pct: number;
    savings_pct: number;
    dti_pct: number;
  };
  health_score: {
    overall: number;
    tier: string;
    pillars: {
      savings_rate: number;
      needs_control: number;
      emergency_runway: number;
      debt_health: number;
    };
  };
  recommended_50_30_20: {
    needs_target: number;
    wants_target: number;
    savings_target: number;
    needs_actual: number;
    wants_actual: number;
    savings_actual: number;
  };
  category_breakdown: CategoryBreakdownItem[];
  alerts: AlertItem[];
  cut_opportunities: CutOpportunity[];
  goal_analysis: {
    goal_name: string;
    goal_target: number;
    current_savings: number;
    progress_pct: number;
    months_to_goal_current: number | null;
    months_to_goal_optimized: number | null;
    risk_tolerance: string;
    income_stability: string;
  };
  debt_simulation: {
    extra_monthly_applied: number;
    baseline: DebtSimulationResult;
    avalanche: DebtSimulationResult;
    snowball: DebtSimulationResult;
    interest_saved_avalanche: number;
    months_saved_avalanche: number;
  };
  savings_projection: {
    current_path: SavingsPoint[];
    optimized_path: SavingsPoint[];
  };
  historical_trends: {
    monthly_series: MonthlySeriesPoint[];
    mom: {
      has_prior: boolean;
      previous_month?: string;
      health_score_delta?: number;
      wants_delta?: number;
      needs_delta?: number;
      savings_delta?: number;
      savings_pct_delta?: number;
      debt_delta?: number;
      top_category_changes?: Array<{
        category: string;
        previous: number;
        current: number;
        delta: number;
        delta_pct: number;
      }>;
      prior_ai_summary?: string;
      prior_commitments?: string[];
    };
  };
  daily_spending_curve: Array<{
    day: string;
    current: number;
    previous: number | null;
  }>;
  recurring_summary: {
    items: Array<{
      name: string;
      category: string;
      bucket: string;
      amount: number;
      date: string;
      source: string;
    }>;
    total_monthly: number;
  };
}

export interface AiAdvice {
  mode: string;
  model_id: string;
  executive_diagnosis: string;
  history_reflection: string;
  budgeting_suggestions: string[];
  savings_strategy: string;
  action_plan_30_60_90: Array<{ window: string; action: string; impact: string }>;
  literacy_cards: Array<{
    concept: string;
    relevance: string;
    explanation: string;
    formula_example: string;
  }>;
  disclaimer?: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  ts?: number;
}

export interface UploadedFileRecord {
  file_id: string;
  filename: string;
  file_type: 'bank_csv' | 'excel_import';
  uploaded_at: number;
  months_covered: string[];
  row_count: number;
  total_income: number;
  total_expense: number;
  sheet_name?: string;
  column_mapping?: ExcelColumnMap;
  extracted_rows: LedgerItem[];
}

export interface WorkspaceState {
  user_id: string;
  month: string;
  available_months: string[];
  profile: UserProfile;
  excel_mapping: SavedExcelMapping | null;
  uploaded_files: UploadedFileRecord[];
  ledger: LedgerItem[];
  analytics: AnalyticsResult;
  ai_advice: AiAdvice | null;
  chat_history: ChatTurn[];
}
