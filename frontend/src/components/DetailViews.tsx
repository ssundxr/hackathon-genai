import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Download,
  History,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCategoryLabel, formatMoney } from '../format';
import { AiAdvice, AnalyticsResult, CurrencyCode, DebtItem, UserProfile } from '../types';

const TOOLTIP_STYLE = {
  background: '#FFFFFF',
  border: '1px solid #C9C1B1',
  borderRadius: 10,
  fontSize: '0.82rem',
};

export const SpendingView: React.FC<{ analytics: AnalyticsResult }> = ({ analytics }) => {
  const { category_breakdown, alerts, historical_trends, currency } = analytics;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Monthly spending trend</h2>
          <span className="pill">Multi-month history</span>
        </div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={historical_trends.monthly_series}>
              <CartesianGrid stroke="#E2DDD3" vertical={false} />
              <XAxis dataKey="month" stroke="#52555A" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#52555A" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend />
              <Line type="monotone" dataKey="needs" name="Essentials" stroke="#14171A" strokeWidth={2} />
              <Line type="monotone" dataKey="wants" name="Lifestyle Wants" stroke="#FFB162" strokeWidth={2.5} />
              <Line type="monotone" dataKey="savings" name="Saved" stroke="#1B7A56" strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">All spending categories</h2>
          </div>
          <div className="row-list">
            {category_breakdown.map((c) => (
              <div key={c.category} className="row-item">
                <div>
                  <div style={{ fontWeight: 500 }}>{formatCategoryLabel(c.category)}</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>{c.pct_of_income}% of income</div>
                </div>
                <strong className="tabular">{formatMoney(c.amount, currency)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Insights & spending alerts</h2>
          </div>
          {alerts.length === 0 ? (
            <p className="muted">Your spending ratios look healthy this month.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map((a, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 14,
                    background: a.severity === 'high' ? 'var(--caution-soft)' : 'var(--bg-soft)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4 }}>
                    <AlertCircle size={15} color="#3985E8" /> {a.title}
                  </div>
                  <div className="muted" style={{ color: 'var(--text-primary)' }}>{a.detail}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const RecurringView: React.FC<{ analytics: AnalyticsResult }> = ({ analytics }) => {
  const { recurring_summary, currency } = analytics;
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Recurring payments & bills</h2>
          <div className="muted">
            Combined monthly recurring commitments:{' '}
            <strong className="tabular" style={{ color: 'var(--text-primary)' }}>
              {formatMoney(recurring_summary.total_monthly, currency)}
            </strong>
          </div>
        </div>
      </div>
      {recurring_summary.items.length === 0 ? (
        <p className="muted">No recurring bills or subscriptions found in this month.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service / Bill</th>
                <th>Category</th>
                <th>Bucket</th>
                <th>Monthly Charge</th>
              </tr>
            </thead>
            <tbody>
              {recurring_summary.items.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td>{formatCategoryLabel(r.category)}</td>
                  <td><span className="pill">{r.bucket}</span></td>
                  <td className="tabular" style={{ fontWeight: 600 }}>{formatMoney(r.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const BudgetsView: React.FC<{ analytics: AnalyticsResult }> = ({ analytics }) => {
  const { recommended_50_30_20, health_score, cut_opportunities, currency } = analytics;
  const chartData = [
    { name: 'Essentials (50%)', Actual: recommended_50_30_20.needs_actual, Target: recommended_50_30_20.needs_target },
    { name: 'Wants (30%)', Actual: recommended_50_30_20.wants_actual, Target: recommended_50_30_20.wants_target },
    { name: 'Savings (20%)', Actual: recommended_50_30_20.savings_actual, Target: recommended_50_30_20.savings_target },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">50 / 30 / 20 Budget Check</h2>
            <span className="pill pill-blue">Score: {health_score.overall}/100 ({health_score.tier})</span>
          </div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid stroke="#E2DDD3" vertical={false} />
                <XAxis dataKey="name" stroke="#52555A" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#52555A" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMoney(v, currency)} />
                <Legend />
                <Bar dataKey="Actual" fill="#14171A" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Target" fill="#FFB162" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Quick savings opportunities</h2>
          </div>
          {cut_opportunities.length === 0 ? (
            <p className="muted">No high discretionary trim opportunities found right now.</p>
          ) : (
            <div className="row-list">
              {cut_opportunities.map((c) => (
                <div key={c.category} className="row-item">
                  <div>
                    <div style={{ fontWeight: 500 }}>Trim {formatCategoryLabel(c.category)} by 25%</div>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      Current: {formatMoney(c.current_monthly, currency)}/mo
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="tabular" style={{ color: 'var(--positive)', fontWeight: 600 }}>
                      +{formatMoney(c.suggested_25pct_cut, currency)}/mo
                    </div>
                    <div className="muted" style={{ fontSize: '0.74rem' }}>
                      {formatMoney(c.annual_savings, currency)}/yr
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const DebtPlannerView: React.FC<{ analytics: AnalyticsResult; profile: UserProfile }> = ({
  analytics,
  profile,
}) => {
  const debtSim = analytics.debt_simulation;
  const currency = analytics.currency;
  const merged = useMemo(() => {
    const len = Math.max(debtSim.baseline.timeline.length, debtSim.avalanche.timeline.length);
    const rows = [];
    for (let i = 0; i < len; i++) {
      const b = debtSim.baseline.timeline[i];
      const a = debtSim.avalanche.timeline[i];
      rows.push({
        month: `M${b?.month ?? a?.month ?? i}`,
        MinimumsOnly: b?.remaining_balance ?? 0,
        AvalanchePlan: a?.remaining_balance ?? 0,
      });
    }
    return rows;
  }, [debtSim]);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Debt payoff planner (Avalanche vs Minimums)</h2>
          <div className="muted">
            Paying high-interest debt first saves{' '}
            <strong className="tabular" style={{ color: 'var(--positive)' }}>
              {formatMoney(debtSim.interest_saved_avalanche, currency)}
            </strong>{' '}
            and finishes <strong>{debtSim.months_saved_avalanche} months</strong> earlier.
          </div>
        </div>
      </div>

      {profile.debts.length === 0 ? (
        <p className="muted">No active debts entered. You can add credit cards or loans under Settings.</p>
      ) : (
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={merged}>
              <CartesianGrid stroke="#E2DDD3" vertical={false} />
              <XAxis dataKey="month" stroke="#52555A" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#52555A" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMoney(v, currency)} />
              <Legend />
              <Area type="monotone" dataKey="MinimumsOnly" name="Minimums Only" stroke="#767A80" fill="#EEE9DF" />
              <Area type="monotone" dataKey="AvalanchePlan" name="Avalanche Strategy" stroke="#1A2B3C" fill="rgba(255, 177, 98, 0.25)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export const SavingsGoalsView: React.FC<{ analytics: AnalyticsResult }> = ({ analytics }) => {
  const [wantsCutPct, setWantsCutPct] = useState(20);
  const currency = analytics.currency;
  const freed = Math.round((analytics.summary.total_wants * wantsCutPct) / 100);
  const monthlySave = Math.max(0, analytics.summary.effective_monthly_savings + freed);

  const projection = useMemo(() => {
    const start = analytics.summary.current_savings;
    const rate = 0.08 / 12;
    let base = start;
    let sim = start;
    const out = [{ year: 'Now', Current: Math.round(start), WithCuts: Math.round(start) }];
    for (let y = 1; y <= 5; y++) {
      for (let m = 0; m < 12; m++) {
        base = base * (1 + 0.06 / 12) + Math.max(0, analytics.summary.effective_monthly_savings);
        sim = sim * (1 + rate) + monthlySave;
      }
      out.push({ year: `Yr ${y}`, Current: Math.round(base), WithCuts: Math.round(sim) });
    }
    return out;
  }, [analytics, monthlySave]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{analytics.goal_analysis.goal_name}</h2>
            <div className="muted tabular">
              Saved {formatMoney(analytics.goal_analysis.current_savings, currency)} of{' '}
              {formatMoney(analytics.goal_analysis.goal_target, currency)} ({analytics.goal_analysis.progress_pct}%)
            </div>
          </div>
          <span className="pill pill-positive tabular">{analytics.goal_analysis.progress_pct}% funded</span>
        </div>
        <div className="bar-track" style={{ height: 10, marginBottom: 16 }}>
          <div className="bar-fill" style={{ width: `${analytics.goal_analysis.progress_pct}%`, background: '#259B70' }} />
        </div>

        <div style={{ background: 'var(--bg-soft)', padding: 14, borderRadius: 14, border: '1px solid var(--border)' }}>
          <label style={{ fontSize: '0.84rem', fontWeight: 500, display: 'block', marginBottom: 6 }}>
            What if I trim non-essential wants by {wantsCutPct}%? (+{formatMoney(freed, currency)}/mo)
          </label>
          <input
            type="range"
            min={0}
            max={50}
            step={5}
            value={wantsCutPct}
            onChange={(e) => setWantsCutPct(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#3985E8' }}
          />
          <div className="muted tabular" style={{ marginTop: 6 }}>
            New monthly savings capacity: <strong style={{ color: 'var(--positive)' }}>{formatMoney(monthlySave, currency)}/mo</strong>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">5-year savings projection</h2>
        </div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <AreaChart data={projection}>
              <CartesianGrid stroke="#E2DDD3" vertical={false} />
              <XAxis dataKey="year" stroke="#52555A" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#52555A" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatMoney(v, currency)} />
              <Legend />
              <Area type="monotone" dataKey="Current" stroke="#767A80" fill="#EEE9DF" />
              <Area type="monotone" dataKey="WithCuts" name="With Adjusted Budget" stroke="#1B7A56" fill="rgba(27,122,86,0.16)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export const ReportsPlanView: React.FC<{
  advice: AiAdvice | null;
  analyzing: boolean;
  onGenerateStrategy: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => Promise<void>;
}> = ({ advice, analyzing, onGenerateStrategy, onExportBackup, onImportBackup }) => {
  const fileRef = React.useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="card-title">Personalized Strategy & Financial Literacy</h2>
          <div className="muted">30-60-90 day roadmap and plain-English explanations tailored to your numbers.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={onExportBackup}>
            <Download size={14} /> Backup JSON
          </button>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            Restore JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await onImportBackup(f);
            }}
          />
          <button className="btn btn-blue btn-sm" onClick={onGenerateStrategy} disabled={analyzing}>
            <Sparkles size={14} /> {analyzing ? 'Updating...' : 'Refresh AI Plan'}
          </button>
        </div>
      </div>

      {advice && (
        <>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Summary & Month-over-Month Check-In</h3>
              <span className="pill">{advice.model_id}</span>
            </div>
            <p style={{ marginTop: 0, lineHeight: 1.6 }}>{advice.executive_diagnosis}</p>
            <div style={{ background: 'var(--bg-soft)', padding: 12, borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.85rem' }}>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <History size={14} color="#3985E8" /> Historical memory:
              </strong>{' '}
              {advice.history_reflection}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">30-60-90 Day Action Plan</h3>
            </div>
            <div className="grid-3">
              {(advice.action_plan_30_60_90 || []).map((step, idx) => (
                <div key={idx} style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="pill pill-blue">{step.window}</span>
                    <CheckCircle2 size={16} color="#259B70" />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 4 }}>{step.action}</div>
                  <div className="muted" style={{ fontSize: '0.78rem' }}>{step.impact}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <BookOpen size={17} color="#3985E8" /> Financial Literacy Explained Simply
              </h3>
            </div>
            <div className="grid-3">
              {(advice.literacy_cards || []).map((c, i) => (
                <div key={i} style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{c.concept}</div>
                  <div style={{ fontSize: '0.78rem', color: '#2161b8', marginBottom: 8 }}>{c.relevance}</div>
                  <p style={{ margin: '0 0 8px', fontSize: '0.83rem', lineHeight: 1.5 }}>{c.explanation}</p>
                  <div className="muted" style={{ fontSize: '0.76rem' }}><strong>Your math:</strong> {c.formula_example}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const SettingsView: React.FC<{
  profile: UserProfile;
  onSaveProfile: (p: Partial<UserProfile>) => Promise<void>;
}> = ({ profile, onSaveProfile }) => {
  const [income, setIncome] = useState(profile.monthly_income);
  const [savings, setSavings] = useState(profile.current_savings);
  const [goalName, setGoalName] = useState(profile.goal_name);
  const [goalTarget, setGoalTarget] = useState(profile.goal_target);
  const [currency, setCurrency] = useState<CurrencyCode>(profile.currency);
  const [debts, setDebts] = useState<DebtItem[]>(profile.debts);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIncome(profile.monthly_income);
    setSavings(profile.current_savings);
    setGoalName(profile.goal_name);
    setGoalTarget(profile.goal_target);
    setCurrency(profile.currency);
    setDebts(profile.debts);
  }, [profile]);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Profile, Currency & Debt Settings</h2>
        <button
          className="btn btn-dark btn-sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSaveProfile({
                monthly_income: Number(income) || 0,
                current_savings: Number(savings) || 0,
                goal_name: goalName,
                goal_target: Number(goalTarget) || 0,
                currency,
                debts,
              });
            } finally {
              setSaving(false);
            }
          }}
        >
          <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div>
          <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Monthly Income</label>
          <input type="number" value={income} onChange={(e) => setIncome(Number(e.target.value))} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Current Liquid Savings</label>
          <input type="number" value={savings} onChange={(e) => setSavings(Number(e.target.value))} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Savings Goal Name</label>
          <input type="text" value={goalName} onChange={(e) => setGoalName(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Savings Goal Target</label>
          <input type="number" value={goalTarget} onChange={(e) => setGoalTarget(Number(e.target.value))} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Preferred Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} style={{ width: '100%' }}>
            <option value="INR">Indian Rupee (INR)</option>
            <option value="USD">US Dollar (USD)</option>
            <option value="EUR">Euro (EUR)</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="muted" style={{ fontWeight: 600 }}>Loans & Credit Cards</span>
        <button
          className="btn btn-sm"
          onClick={() => setDebts([...debts, { name: 'Credit Card / Loan', balance: 25000, apr: 18, min_payment: 1500 }])}
        >
          <Plus size={14} /> Add Debt
        </button>
      </div>
      {debts.map((d, idx) => (
        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
          <input value={d.name} onChange={(e) => { const next = [...debts]; next[idx] = { ...d, name: e.target.value }; setDebts(next); }} placeholder="Name" />
          <input type="number" value={d.balance} onChange={(e) => { const next = [...debts]; next[idx] = { ...d, balance: Number(e.target.value) }; setDebts(next); }} placeholder="Balance" />
          <input type="number" value={d.apr} onChange={(e) => { const next = [...debts]; next[idx] = { ...d, apr: Number(e.target.value) }; setDebts(next); }} placeholder="APR %" />
          <input type="number" value={d.min_payment} onChange={(e) => { const next = [...debts]; next[idx] = { ...d, min_payment: Number(e.target.value) }; setDebts(next); }} placeholder="Min Payment" />
          <button className="btn btn-sm" onClick={() => setDebts(debts.filter((_, i) => i !== idx))} aria-label="Remove debt">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export const InsightsTrendsView: React.FC<{ analytics: AnalyticsResult }> = ({ analytics }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <SpendingView analytics={analytics} />
    <RecurringView analytics={analytics} />
  </div>
);

export const PlanGoalsView: React.FC<{ analytics: AnalyticsResult; profile: UserProfile }> = ({
  analytics,
  profile,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <BudgetsView analytics={analytics} />
    <SavingsGoalsView analytics={analytics} />
    <DebtPlannerView analytics={analytics} profile={profile} />
  </div>
);

export const HelpView: React.FC = () => (
  <div className="card">
    <h2 className="card-title">Quick Guide to Using FinWise AI</h2>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, lineHeight: 1.6 }}>
      <div>
        <strong>1. Start with your Bank CSV or Excel Sheet:</strong> Open <em>Transactions &amp; Upload</em> in the left menu. Drop your bank CSV or your existing <code>.xlsx</code> sheet once — FinWise maps your columns and saves the layout.
      </div>
      <div>
        <strong>2. Choose your ongoing habit:</strong> Continue adding expenses right inside the portal table, or drop next month&apos;s Excel file anytime.
      </div>
      <div>
        <strong>3. Track progress over months:</strong> FinWise remembers previous months&apos; summaries so you and your AI Financial Advisor can compare spending, savings, and debt progress side by side.
      </div>
    </div>
  </div>
);
