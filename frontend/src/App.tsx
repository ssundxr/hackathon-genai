import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Menu, Plus, Sparkles, User, X } from 'lucide-react';
import { api } from './api';
import { AdvisorPanel } from './components/AdvisorPanel';
import {
  HelpView,
  InsightsTrendsView,
  PlanGoalsView,
  ReportsPlanView,
  SettingsView,
} from './components/DetailViews';
import { LandingPage } from './components/LandingPage';
import { OverviewView } from './components/OverviewView';
import { NavSection, Sidebar } from './components/Sidebar';
import { TransactionsUploadView } from './components/TransactionsUploadView';
import { SourceFilter, WorkspaceState } from './types';

export default function App() {
  const [userId, setUserId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('finwise_user_id');
    } catch {
      return null;
    }
  });
  const [month, setMonth] = useState('2026-11');
  const [sourceFilter] = useState<SourceFilter>('all');
  const [section, setSection] = useState<NavSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const advisorInputRef = useRef<HTMLInputElement>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const enterWorkspace = (uid: string, state: WorkspaceState) => {
    try {
      sessionStorage.setItem('finwise_user_id', uid);
    } catch {
      // ignore storage errors
    }
    setUserId(uid);
    setMonth(state.month);
    setWorkspace(state);
    setSection('overview');
  };

  const leaveWorkspace = () => {
    try {
      sessionStorage.removeItem('finwise_user_id');
    } catch {
      // ignore storage errors
    }
    setUserId(null);
    setWorkspace(null);
  };

  const loadWorkspace = useCallback(
    async (uid: string, m = month, src = sourceFilter) => {
      setLoading(true);
      try {
        const data = await api.getWorkspace(uid, m, src);
        setWorkspace(data);
      } catch (err) {
        notify((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [month, sourceFilter]
  );

  useEffect(() => {
    if (userId && !workspace) {
      loadWorkspace(userId, month, sourceFilter);
    }
  }, [userId, workspace, loadWorkspace, month, sourceFilter]);

  useEffect(() => {
    if (userId && workspace && workspace.month !== month) {
      loadWorkspace(userId, month, sourceFilter);
    }
  }, [month]);

  if (!userId) {
    return (
      <LandingPage
        onCreateFresh={async (payload) => {
          const state = await api.createFreshAccount({
            ...payload,
            month: '2026-11',
          });
          enterWorkspace(state.user_id, state);
          notify(`Created fresh workspace for ${payload.display_name}.`);
        }}
        onOpenExisting={async (uid) => {
          const clean = uid.toLowerCase().replace(/\s+/g, '_');
          const state = await api.getWorkspace(clean, '2026-11', 'all');
          const latest = state.available_months[state.available_months.length - 1] || '2026-11';
          const finalState = latest !== state.month ? await api.getWorkspace(clean, latest, 'all') : state;
          enterWorkspace(clean, finalState);
        }}
        onLoadDemo={async (persona) => {
          const state = await api.loadDemoPersona(persona, persona);
          enterWorkspace(persona, state);
          notify(`Loaded ${persona.toUpperCase()} 2-month demo workspace.`);
        }}
      />
    );
  }

  const handleRunAiAnalysis = async () => {
    setAnalyzing(true);
    try {
      const updated = await api.analyzeFinances(userId, month, sourceFilter);
      setWorkspace(updated);
      notify('AI strategy and financial literacy lessons updated.');
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSendChat = async (q: string) => {
    const res = await api.chatWithCoach(userId, month, q);
    setWorkspace((prev) => (prev ? { ...prev, chat_history: res.chat_history } : prev));
  };

  const handleExportBackup = async () => {
    try {
      const bundle = await api.exportWorkspace(userId);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finwise_${userId}_backup.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('Workspace backup JSON downloaded.');
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const handleImportBackup = async (file: File) => {
    try {
      const raw = await file.text();
      const bundle = JSON.parse(raw);
      const updated = await api.importWorkspace(userId, month, bundle);
      setWorkspace(updated);
      notify('Workspace restored from backup JSON.');
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const rawDisplay = workspace?.profile?.display_name?.trim();
  const displayName = rawDisplay
    ? rawDisplay
    : userId === 'aarav'
    ? 'Aarav'
    : userId === 'priya'
    ? 'Priya'
    : userId.charAt(0).toUpperCase() + userId.slice(1);

  const monthsList = (workspace?.available_months?.length ? workspace.available_months : [month])
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Minimalist Top Bar — "FinWise" wordmark IS the logo */}
      <header className="portal-masthead">
        <div className="masthead-inner">
          <button
            type="button"
            className="wordmark"
            onClick={() => setSection('overview')}
            aria-label="FinWise home"
          >
            FinWise<span className="wordmark-dot">.</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Global reporting month"
              style={{ padding: '6px 10px', fontSize: '0.8rem' }}
            >
              {monthsList.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={() => setSection('transactions')}>
              <Plus size={14} /> Add Data
            </button>
            <button className="btn btn-dark btn-sm" onClick={() => advisorInputRef.current?.focus()}>
              <Sparkles size={13} /> Ask Advisor
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Header Bar */}
      <div className="mobile-bar" style={{ margin: '12px 14px 0' }}>
        <span className="wordmark" style={{ fontSize: '1.45rem' }}>
          FinWise<span className="wordmark-dot">.</span>
        </span>
        <button
          className="icon-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="card" style={{ margin: '8px 14px 0', padding: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(
              [
                ['overview', 'Overview'],
                ['transactions', 'Data Vault'],
                ['insights', 'Spending & Trends'],
                ['plan', 'Debt & Wealth'],
                ['reports', 'AI Strategy'],
                ['settings', 'Settings'],
              ] as Array<[NavSection, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                className={`btn btn-sm ${section === id ? 'btn-dark' : ''}`}
                onClick={() => {
                  setSection(id);
                  setMobileMenuOpen(false);
                }}
              >
                {label}
              </button>
            ))}
            <button className="btn btn-sm" onClick={leaveWorkspace}>
              Switch Account
            </button>
          </div>
        </div>
      )}

      <div className="portal-layout">
        {/* 1. Left Navigation Sidebar */}
        <Sidebar
          active={section}
          onSelect={setSection}
          userId={userId}
          displayName={displayName}
          onBackToLanding={leaveWorkspace}
        />

        {/* 2. Main Center Column */}
        <main className="main-col">
          <header className="top-header">
            <div>
              <h1 className="greeting-title serif-display">
                Welcome back, {displayName}
              </h1>
              <p className="greeting-sub">
                Portfolio summary for {month} · {workspace?.uploaded_files?.length || 0} stored file(s)
              </p>
            </div>

            <div className="header-actions">
              <button
                className="icon-btn"
                title="View alerts & trends"
                aria-label="View alerts"
                onClick={() => setSection('insights')}
              >
                <Bell size={15} />
              </button>
              <button
                className="icon-btn"
                title="Account & settings"
                aria-label="Profile settings"
                onClick={() => setSection('settings')}
              >
                <User size={15} />
              </button>
            </div>
          </header>

          {toast && <div className="toast-banner">{toast}</div>}

          {loading || !workspace ? (
            <div className="card">
              <div className="muted">Loading your financial workspace...</div>
            </div>
          ) : (
            <>
              {section === 'overview' && (
                <OverviewView
                  analytics={workspace.analytics}
                  ledger={workspace.ledger}
                  uploadedFiles={workspace.uploaded_files || []}
                  month={month}
                  availableMonths={monthsList}
                  onChangeMonth={setMonth}
                  onNavigate={setSection}
                  onAskAdvisor={handleSendChat}
                />
              )}

              {section === 'transactions' && (
                <TransactionsUploadView
                  month={month}
                  availableMonths={monthsList}
                  profile={workspace.profile}
                  excelMapping={workspace.excel_mapping}
                  uploadedFiles={workspace.uploaded_files || []}
                  ledger={workspace.ledger}
                  onChangeMonth={setMonth}
                  onCarryForwardMonth={async (sourceMonth, targetMonth) => {
                    const updated = await api.carryForwardMonth(userId, sourceMonth, targetMonth);
                    setMonth(updated.month);
                    setWorkspace(updated);
                    notify(`Opened ${targetMonth} and carried forward ${updated.carried_count ?? 0} recurring entries.`);
                  }}
                  onSaveProfile={async (p) => {
                    const updated = await api.saveProfile(userId, month, p);
                    setWorkspace(updated);
                    notify('Preferences saved.');
                  }}
                  onIngestCsv={async (csvText, filename) => {
                    const updated = await api.ingestBankCsv(userId, month, csvText, filename, true);
                    setMonth(updated.month);
                    setWorkspace(updated);
                    notify(`Stored and extracted ${updated.ingested_count ?? 0} transactions from Bank CSV.`);
                  }}
                  onIngestExcel={async (payload) => {
                    const updated = await api.ingestExcelRows({
                      ...payload,
                      user_id: userId,
                      month,
                      replace_existing: true,
                    });
                    setMonth(updated.month);
                    setWorkspace(updated);
                    notify(`Stored ${payload.filename} and mapped ${updated.ingested_count ?? 0} Excel rows.`);
                  }}
                  onUpsertLedgerItem={async (item) => {
                    const updated = await api.upsertLedgerItem(userId, month, item);
                    setWorkspace(updated);
                    notify('Transaction added.');
                  }}
                  onDeleteLedgerItem={async (txId) => {
                    const updated = await api.deleteLedgerItem(userId, month, txId);
                    setWorkspace(updated);
                    notify('Transaction removed.');
                  }}
                />
              )}

              {section === 'insights' && <InsightsTrendsView analytics={workspace.analytics} />}

              {section === 'plan' && (
                <PlanGoalsView analytics={workspace.analytics} profile={workspace.profile} />
              )}

              {section === 'reports' && (
                <ReportsPlanView
                  advice={workspace.ai_advice}
                  analyzing={analyzing}
                  onGenerateStrategy={handleRunAiAnalysis}
                  onExportBackup={handleExportBackup}
                  onImportBackup={handleImportBackup}
                />
              )}

              {section === 'settings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <SettingsView
                    profile={workspace.profile}
                    onSaveProfile={async (p) => {
                      const updated = await api.saveProfile(userId, month, p);
                      setWorkspace(updated);
                      notify('Profile and debt settings saved.');
                    }}
                  />
                  <HelpView />
                </div>
              )}
            </>
          )}
        </main>

        {/* 3. Right Sticky AI Advisor Panel */}
        <AdvisorPanel
          hasHistory={Boolean(workspace?.analytics?.historical_trends?.mom?.has_prior)}
          priorMonth={workspace?.analytics?.historical_trends?.mom?.previous_month}
          chatHistory={workspace?.chat_history || []}
          inputRef={advisorInputRef}
          onSendChat={handleSendChat}
        />
      </div>
    </div>
  );
}
