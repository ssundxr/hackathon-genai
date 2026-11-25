import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  LogIn,
  RotateCcw,
  UserPlus,
} from 'lucide-react';
import { CurrencyCode } from '../types';

type LandingStage = 'splash' | 'about' | 'login';

interface Props {
  onCreateFresh: (payload: {
    display_name: string;
    currency: CurrencyCode;
    monthly_income: number;
    current_savings: number;
  }) => Promise<void>;
  onOpenExisting: (userId: string) => Promise<void>;
  onLoadDemo: (persona: 'aarav' | 'priya') => Promise<void>;
}

const RECENT_KEY = 'finwise_recent_workspaces';

function loadRecentWorkspaces(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function rememberWorkspace(name: string) {
  try {
    const clean = name.trim();
    if (!clean) return;
    const prev = loadRecentWorkspaces().filter((x) => x.toLowerCase() !== clean.toLowerCase());
    localStorage.setItem(RECENT_KEY, JSON.stringify([clean, ...prev].slice(0, 5)));
  } catch {
    // ignore storage failures
  }
}

export const LandingPage: React.FC<Props> = ({
  onCreateFresh,
  onOpenExisting,
  onLoadDemo,
}) => {
  const [stage, setStage] = useState<LandingStage>('splash');
  const [splashKey, setSplashKey] = useState(0);

  const [authTab, setAuthTab] = useState<'signin' | 'create'>('signin');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [income, setIncome] = useState('');
  const [savings, setSavings] = useState('');
  const [existingId, setExistingId] = useState('');
  const [recentList, setRecentList] = useState<string[]>(() => loadRecentWorkspaces());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stage !== 'splash') return;
    const timer = window.setTimeout(() => {
      setStage('about');
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [stage, splashKey]);

  const replayIntro = () => {
    setSplashKey((k) => k + 1);
    setStage('splash');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name or workspace ID.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      rememberWorkspace(name.trim());
      setRecentList(loadRecentWorkspaces());
      await onCreateFresh({
        display_name: name.trim(),
        currency,
        monthly_income: Number(income) || 0,
        current_savings: Number(savings) || 0,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = async (targetId: string) => {
    const clean = targetId.trim();
    if (!clean) return;
    setError(null);
    setBusy(true);
    try {
      rememberWorkspace(clean);
      setRecentList(loadRecentWorkspaces());
      await onOpenExisting(clean);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /* --------------------------------------------------------------------------
     STAGE 1: MINIMALIST STROKE-DRAWN "FinWise" WORDMARK SPLASH
  -------------------------------------------------------------------------- */
  if (stage === 'splash') {
    return (
      <div
        key={splashKey}
        className="splash-stage"
        onClick={() => setStage('about')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setStage('about');
        }}
        aria-label="FinWise intro splash"
      >
        <svg className="finwise-hello-svg" viewBox="0 0 600 180" aria-label="FinWise">
          <text
            x="50%"
            y="128"
            textAnchor="middle"
            className="finwise-hello-text"
          >
            FinWise
          </text>
        </svg>

        <div className="splash-fade-in" style={{ marginTop: 8 }}>
          <div
            style={{
              fontSize: '0.98rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              letterSpacing: '0.01em',
            }}
          >
            Personal Financial Intelligence
          </div>
        </div>

        <div className="splash-fade-in-late" style={{ marginTop: 28 }}>
          <button
            type="button"
            className="btn btn-dark"
            onClick={(e) => {
              e.stopPropagation();
              setStage('about');
            }}
          >
            Enter <ArrowRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
     STAGE 2: MINIMALIST EDITORIAL ABOUT PAGE
  -------------------------------------------------------------------------- */
  if (stage === 'about') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header className="portal-masthead">
          <div className="masthead-inner" style={{ maxWidth: 1080 }}>
            <button
              type="button"
              className="wordmark"
              onClick={replayIntro}
              aria-label="FinWise"
            >
              FinWise<span className="wordmark-dot">.</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" className="btn btn-sm" onClick={replayIntro}>
                <RotateCcw size={13} /> Intro
              </button>
              <button type="button" className="btn btn-dark btn-sm" onClick={() => setStage('login')}>
                Sign In <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </header>

        <main
          style={{
            maxWidth: 1080,
            width: '100%',
            margin: '0 auto',
            padding: '64px 24px 72px',
            display: 'flex',
            flexDirection: 'column',
            gap: 48,
          }}
        >
          {/* Clean Editorial Hero */}
          <section
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              paddingBottom: 40,
              borderBottom: '1px solid var(--border-strong)',
            }}
          >
            <h1
              className="serif-display"
              style={{
                margin: 0,
                fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                fontWeight: 400,
                lineHeight: 1.05,
                color: 'var(--text-primary)',
                maxWidth: 760,
              }}
            >
              Clarity over every rupee.
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: '1.04rem',
                lineHeight: 1.65,
                color: 'var(--text-secondary)',
                maxWidth: 620,
              }}
            >
              Import a bank CSV or map your Excel sheet once. Verified Python analytics compute your cashflow, health score, and debt payoff path—paired with a grounded AI advisor.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
              <button
                type="button"
                className="btn btn-dark"
                style={{ padding: '11px 22px', fontSize: '0.9rem' }}
                onClick={() => {
                  setAuthTab('signin');
                  setStage('login');
                }}
              >
                Open Portal <ArrowRight size={15} />
              </button>
              <button
                type="button"
                className="btn"
                style={{ padding: '11px 22px', fontSize: '0.9rem' }}
                onClick={() => {
                  setAuthTab('create');
                  setStage('login');
                }}
              >
                New Workspace
              </button>
            </div>
          </section>

          {/* 3 Clean Minimalist Pillars (No icon boxes) */}
          <section className="grid-3" style={{ gap: 20 }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                01 · Ingestion
              </div>
              <h2 className="card-title" style={{ fontSize: '1.05rem' }}>One-Time Mapping</h2>
              <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
                Upload bank CSVs or map personal Excel columns once. Your schema and extracted rows stay stored in your workspace vault.
              </p>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                02 · Intelligence
              </div>
              <h2 className="card-title" style={{ fontSize: '1.05rem' }}>Verified Math + AI</h2>
              <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
                Deterministic 50/30/20 ratios, Health Score, and Debt Avalanche math feed directly into plain-English AI coaching.
              </p>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                03 · Continuity
              </div>
              <h2 className="card-title" style={{ fontSize: '1.05rem' }}>Month-over-Month</h2>
              <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
                Carry recurring bills and SIPs forward in one click and track spending velocity and savings progress across months.
              </p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
     STAGE 3: MINIMALIST SIGN IN & DEMO SANDBOXES
  -------------------------------------------------------------------------- */
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="portal-masthead">
        <div className="masthead-inner" style={{ maxWidth: 1080 }}>
          <button
            type="button"
            className="wordmark"
            onClick={() => setStage('about')}
            aria-label="FinWise"
          >
            FinWise<span className="wordmark-dot">.</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={() => setStage('about')}>
              <ArrowLeft size={14} /> Overview
            </button>
            <button type="button" className="btn btn-sm" onClick={replayIntro}>
              <RotateCcw size={13} /> Intro
            </button>
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: 1080,
          width: '100%',
          margin: '0 auto',
          padding: '44px 24px 64px',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        <div>
          <h1 className="serif-display" style={{ margin: 0, fontSize: '2.4rem', fontWeight: 400 }}>
            Access your workspace
          </h1>
          <p className="muted" style={{ marginTop: 6, fontSize: '0.92rem' }}>
            Sign in with a workspace ID, start fresh, or explore a pre-loaded multi-month portfolio.
          </p>
        </div>

        {error && (
          <div
            style={{
              background: 'var(--negative-soft)',
              color: 'var(--negative)',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: '0.85rem',
              border: '1px solid rgba(184, 59, 59, 0.25)',
            }}
          >
            {error}
          </div>
        )}

        <div className="grid-2" style={{ gap: 20, alignItems: 'stretch' }}>
          {/* Left Card: Sign In or Create New */}
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
              <button
                type="button"
                className={`btn btn-sm ${authTab === 'signin' ? 'btn-dark' : ''}`}
                onClick={() => setAuthTab('signin')}
              >
                <LogIn size={14} /> Sign In
              </button>
              <button
                type="button"
                className={`btn btn-sm ${authTab === 'create' ? 'btn-dark' : ''}`}
                onClick={() => setAuthTab('create')}
              >
                <UserPlus size={14} /> Create New
              </button>
            </div>

            {authTab === 'signin' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSignIn(existingId);
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <div>
                    <label className="muted" style={{ fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>
                      Workspace ID or Name
                    </label>
                    <input
                      type="text"
                      value={existingId}
                      onChange={(e) => setExistingId(e.target.value)}
                      placeholder="e.g. surya, aarav, priya"
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-dark" disabled={busy || !existingId.trim()}>
                    {busy ? 'Opening...' : 'Continue'} <ArrowRight size={15} />
                  </button>
                </form>

                {recentList.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                    <div className="muted" style={{ fontSize: '0.75rem', marginBottom: 8 }}>
                      Recent Workspaces
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {recentList.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="btn btn-sm btn-soft"
                          disabled={busy}
                          onClick={() => handleSignIn(item)}
                        >
                          {item} <ArrowRight size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="grid-2" style={{ gap: 10 }}>
                  <div>
                    <label className="muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                      Name *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Surya"
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                      style={{ width: '100%' }}
                    >
                      <option value="INR">INR</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>

                <div className="grid-2" style={{ gap: 10 }}>
                  <div>
                    <label className="muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                      Monthly Income
                    </label>
                    <input
                      type="number"
                      value={income}
                      onChange={(e) => setIncome(e.target.value)}
                      placeholder="e.g. 75000"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                      Current Savings
                    </label>
                    <input
                      type="number"
                      value={savings}
                      onChange={(e) => setSavings(e.target.value)}
                      placeholder="e.g. 50000"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-dark" disabled={busy} style={{ marginTop: 4 }}>
                  {busy ? 'Creating...' : 'Create Workspace'} <ArrowRight size={15} />
                </button>
              </form>
            )}
          </section>

          {/* Right Card: Demo Sandboxes */}
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 className="card-title">Demo Portfolios</h2>
              <span className="pill">2-Month Data</span>
            </div>

            <div
              className="reduce-save-tile"
              style={{ background: 'var(--bg-soft)', cursor: busy ? 'wait' : 'pointer' }}
              onClick={() => !busy && onLoadDemo('aarav')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.94rem' }}>Aarav · Salaried Engineer</strong>
                <ArrowRight size={15} color="var(--text-secondary)" />
              </div>
              <div className="muted" style={{ fontSize: '0.81rem', lineHeight: 1.5 }}>
                Rs 75,000/mo income, active credit card &amp; education debt, saved CSV + Excel vault, and Oct &rarr; Nov recovery.
              </div>
            </div>

            <div
              className="reduce-save-tile"
              style={{ background: 'var(--bg-soft)', cursor: busy ? 'wait' : 'pointer' }}
              onClick={() => !busy && onLoadDemo('priya')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.94rem' }}>Priya · Freelance Designer</strong>
                <ArrowRight size={15} color="var(--text-secondary)" />
              </div>
              <div className="muted" style={{ fontSize: '0.81rem', lineHeight: 1.5 }}>
                Variable retainer income, 6-month buffer planning, and saved Excel column mapping.
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
