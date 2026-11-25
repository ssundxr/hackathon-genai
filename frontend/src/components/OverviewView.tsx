import React from 'react';
import {
  ArrowRight,
  Database,
  History,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCategoryLabel, formatMoney } from '../format';
import { AnalyticsResult, LedgerItem, UploadedFileRecord } from '../types';
import { NavSection } from './Sidebar';

interface Props {
  analytics: AnalyticsResult;
  ledger: LedgerItem[];
  uploadedFiles: UploadedFileRecord[];
  month: string;
  availableMonths: string[];
  onChangeMonth: (m: string) => void;
  onNavigate: (sec: NavSection) => void;
  onAskAdvisor: (prompt: string) => void;
}

export const OverviewView: React.FC<Props> = ({
  analytics,
  ledger,
  uploadedFiles,
  month,
  availableMonths,
  onChangeMonth,
  onNavigate,
  onAskAdvisor,
}) => {
  const {
    summary,
    ratios,
    health_score,
    cut_opportunities,
    debt_simulation,
    daily_spending_curve,
    historical_trends,
    currency,
  } = analytics;

  const totalSpentThisMonth = Math.round(summary.total_needs + summary.total_wants);
  const budgetCap = Math.round(
    summary.total_income > 0 ? summary.total_income * 0.8 : totalSpentThisMonth * 1.15
  );
  const mom = historical_trends.mom;
  const recentTxns = ledger.slice(0, 5);

  const expensesDelta = (mom.needs_delta ?? 0) + (mom.wants_delta ?? 0);
  const prevTotalSpent =
    mom.has_prior && totalSpentThisMonth - expensesDelta > 0
      ? totalSpentThisMonth - expensesDelta
      : 0;
  const spentPctChange =
    prevTotalSpent > 0 ? Math.round((expensesDelta / prevTotalSpent) * 100) : null;

  const totalPotentialMonthlySave = cut_opportunities
    .slice(0, 2)
    .reduce((acc, c) => acc + c.suggested_25pct_cut, 0);

  const isBrandNewEmpty = ledger.length === 0 && summary.total_income === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {isBrandNewEmpty && (
        <section className="insight-hero" aria-label="Getting started">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <h2 className="card-title" style={{ margin: '0 0 4px' }}>Welcome to your workspace</h2>
              <div className="muted">
                Upload a bank CSV, map an Excel sheet once, or add transactions directly in the Data Vault.
              </div>
            </div>
            <button className="btn btn-dark" onClick={() => onNavigate('transactions')}>
              Upload Data <ArrowRight size={15} />
            </button>
          </div>
        </section>
      )}

      {/* A. Outflow Hero & Daily Spend Curve */}
      <section className="card" aria-label="Spending overview">
        <div className="card-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="muted" style={{ fontSize: '0.76rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Total Outflow · {month}
            </div>
            <div className="hero-metric tabular">{formatMoney(totalSpentThisMonth, currency)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="pill pill-gold tabular">
                Target {formatMoney(budgetCap, currency)}
              </span>
              <span className="pill">
                Health {health_score.overall}/100 · {health_score.tier}
              </span>
              {mom.has_prior && spentPctChange !== null && (
                <span className={`pill ${spentPctChange <= 0 ? 'pill-positive' : ''}`}>
                  {spentPctChange <= 0
                    ? `${Math.abs(spentPctChange)}% lower vs ${mom.previous_month}`
                    : `${spentPctChange}% higher vs ${mom.previous_month}`}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={month}
              onChange={(e) => onChangeMonth(e.target.value)}
              aria-label="Select active month"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button className="btn btn-sm btn-soft" onClick={() => onNavigate('transactions')}>
              <Database size={13} /> {uploadedFiles.length} File{uploadedFiles.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 18, marginBottom: 10, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2.5, background: '#14171A', borderRadius: 2 }} />
            {month}
          </span>
          {mom.has_prior && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, borderTop: '2px dashed #C9C1B1' }} />
              {mom.previous_month}
            </span>
          )}
        </div>

        <div style={{ width: '100%', height: 210 }}>
          <ResponsiveContainer>
            <LineChart data={daily_spending_curve} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E6E1D8" vertical={false} />
              <XAxis dataKey="day" stroke="#52555A" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke="#52555A"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip
                contentStyle={{
                  background: '#FFFFFF',
                  border: '1px solid #C9C1B1',
                  borderRadius: 10,
                  fontSize: '0.82rem',
                }}
                formatter={(v: number) => formatMoney(v, currency)}
              />
              {mom.has_prior && (
                <Line
                  type="monotone"
                  dataKey="previous"
                  name="Previous Month"
                  stroke="#C9C1B1"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="current"
                name="Current Month"
                stroke="#14171A"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#14171A' }}
                activeDot={{ r: 5, fill: '#FFB162', stroke: '#14171A', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* B. 4 Clean Financial KPI Cards */}
      <section className="summary-grid-4" aria-label="Financial summary">
        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="muted" style={{ fontWeight: 500, fontSize: '0.78rem' }}>Income</div>
          <div className="metric-value tabular">{formatMoney(summary.total_income, currency)}</div>
          <div className="muted" style={{ fontSize: '0.74rem' }}>
            {summary.net_surplus >= 0 ? 'Positive cashflow' : 'Deficit'}
          </div>
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="muted" style={{ fontWeight: 500, fontSize: '0.78rem' }}>Expenses</div>
          <div className="metric-value tabular">{formatMoney(totalSpentThisMonth, currency)}</div>
          <div
            className="muted"
            style={{
              fontSize: '0.74rem',
              color: spentPctChange !== null && spentPctChange <= 0 ? 'var(--positive)' : 'var(--text-secondary)',
            }}
          >
            {spentPctChange !== null
              ? spentPctChange <= 0
                ? `${Math.abs(spentPctChange)}% down MoM`
                : `${spentPctChange}% up MoM`
              : `${ratios.needs_pct}% needs · ${ratios.wants_pct}% wants`}
          </div>
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="muted" style={{ fontWeight: 500, fontSize: '0.78rem' }}>Saved</div>
          <div className="metric-value tabular">{formatMoney(summary.effective_monthly_savings, currency)}</div>
          <div
            className="muted"
            style={{
              fontSize: '0.74rem',
              color: (mom.savings_delta ?? 0) > 0 ? 'var(--positive)' : 'var(--text-secondary)',
            }}
          >
            {mom.has_prior && (mom.savings_delta ?? 0) !== 0
              ? `${(mom.savings_delta ?? 0) > 0 ? '+' : ''}${formatMoney(mom.savings_delta ?? 0, currency)} MoM`
              : `${ratios.savings_pct}% savings rate`}
          </div>
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="muted" style={{ fontWeight: 500, fontSize: '0.78rem' }}>Debt</div>
          <div className="metric-value tabular">{formatMoney(summary.total_debt_balance, currency)}</div>
          <div className="muted" style={{ fontSize: '0.74rem' }}>
            {summary.total_debt_balance > 0 ? `${ratios.dti_pct}% DTI` : 'Debt free'}
          </div>
        </div>
      </section>

      {/* C. Executive Insights & Savings Levers */}
      <section className="insight-hero" aria-label="FinWise Insights">
        <div className="card-header" style={{ marginBottom: 12 }}>
          <div>
            <h2 className="card-title" style={{ margin: 0 }}>Executive Insights</h2>
            <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
              Derived directly from stored transactions and monthly history
            </div>
          </div>
          <button className="link-btn" onClick={() => onNavigate('insights')}>
            Full analysis <ArrowRight size={14} />
          </button>
        </div>

        {!isBrandNewEmpty && (
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '13px 16px',
              marginBottom: 12,
              fontSize: '0.86rem',
              lineHeight: 1.58,
              color: 'var(--text-primary)',
            }}
          >
            You retained{' '}
            <strong className="tabular">{formatMoney(summary.effective_monthly_savings, currency)}</strong>{' '}
            ({ratios.savings_pct}% of income) in {month}, with{' '}
            <strong>{summary.emergency_runway_months} months</strong> of emergency runway.{' '}
            {totalPotentialMonthlySave > 0
              ? `Trimming your top two discretionary categories by 25% frees ${formatMoney(totalPotentialMonthlySave, currency)}/month.`
              : 'Keep automating savings on payday to reach your target ahead of schedule.'}
          </div>
        )}

        {mom.has_prior && (
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '11px 16px',
              marginBottom: 14,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem' }}>
              <History size={15} color="#14171A" />
              <span>
                <strong>vs {mom.previous_month}:</strong>{' '}
                Health Score{' '}
                <strong style={{ color: 'var(--positive)' }}>
                  {health_score.overall}/100 ({(mom.health_score_delta ?? 0) >= 0 ? '+' : ''}
                  {mom.health_score_delta} pts)
                </strong>
                {(mom.wants_delta ?? 0) < 0 && (
                  <>
                    {' '}· Wants down{' '}
                    <strong style={{ color: 'var(--positive)' }}>
                      {formatMoney(Math.abs(mom.wants_delta ?? 0), currency)}
                    </strong>
                  </>
                )}
              </span>
            </div>
            <span className="pill pill-positive tabular">
              Saved {(mom.savings_delta ?? 0) >= 0 ? '+' : ''}
              {formatMoney(mom.savings_delta ?? 0, currency)}
            </span>
          </div>
        )}

        <div className="grid-3">
          {cut_opportunities.slice(0, 2).map((cut) => (
            <div key={cut.category} className="reduce-save-tile">
              <div>
                <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Reduce 25%
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                  {formatCategoryLabel(cut.category)}
                </div>
                <div className="muted tabular" style={{ marginTop: 4, fontSize: '0.79rem' }}>
                  {formatMoney(cut.current_monthly, currency)} &rarr;{' '}
                  {formatMoney(cut.current_monthly - cut.suggested_25pct_cut, currency)}/mo
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <span className="tabular" style={{ color: 'var(--positive)', fontWeight: 600, fontSize: '0.88rem' }}>
                  +{formatMoney(cut.suggested_25pct_cut, currency)}/mo
                </span>
                <span className="muted tabular" style={{ fontSize: '0.74rem' }}>
                  {formatMoney(cut.annual_savings, currency)}/yr
                </span>
              </div>
            </div>
          ))}

          <div className="reduce-save-tile" style={{ background: 'var(--bg-soft)' }}>
            <div>
              <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Impact
              </div>
              {summary.total_debt_balance > 0 ? (
                <>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                    {debt_simulation.months_saved_avalanche} months faster payoff
                  </div>
                  <div className="muted tabular" style={{ marginTop: 4, fontSize: '0.79rem' }}>
                    Save {formatMoney(debt_simulation.interest_saved_avalanche, currency)} in interest via Avalanche
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                    {totalPotentialMonthlySave > 0
                      ? `+${formatMoney(totalPotentialMonthlySave, currency)}/mo potential`
                      : `${ratios.savings_pct}% savings rate`}
                  </div>
                  <div className="muted" style={{ marginTop: 4, fontSize: '0.79rem' }}>
                    Automate payday transfers to accelerate goal progress
                  </div>
                </>
              )}
            </div>
            <button
              className="link-btn"
              style={{ fontSize: '0.8rem', paddingTop: 8 }}
              onClick={() => onAskAdvisor('Explain my uploaded expenses and tell me the easiest way to save more this month.')}
            >
              Ask Advisor <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {/* D. Recent Transactions */}
      <section className="card" aria-label="Recent transactions">
        <div className="card-header">
          <h2 className="card-title">Recent Transactions</h2>
          <button className="link-btn" onClick={() => onNavigate('transactions')}>
            Open Data Vault <ArrowRight size={14} />
          </button>
        </div>
        {recentTxns.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span className="muted">No transactions recorded for {month}.</span>
            <button className="btn btn-dark btn-sm" onClick={() => onNavigate('transactions')}>
              Upload CSV or Excel
            </button>
          </div>
        ) : (
          <div className="row-list">
            {recentTxns.map((tx) => (
              <div key={tx.tx_id} className="row-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div className="row-icon-circle">
                    {tx.tx_type === 'income' ? <TrendingUp size={14} /> : <Receipt size={14} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: '0.86rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {tx.name}
                    </div>
                    <div className="muted" style={{ fontSize: '0.74rem' }}>
                      {formatCategoryLabel(tx.category)} · {tx.date}
                    </div>
                  </div>
                </div>
                <div
                  className="tabular"
                  style={{
                    fontWeight: 600,
                    fontSize: '0.87rem',
                    color: tx.tx_type === 'income' ? 'var(--positive)' : 'var(--text-primary)',
                    flexShrink: 0,
                  }}
                >
                  {tx.tx_type === 'income' ? '+' : '-'}
                  {formatMoney(tx.amount, currency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
