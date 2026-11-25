import React from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  LayoutDashboard,
  PieChart,
  Settings,
  Target,
} from 'lucide-react';

export type NavSection =
  | 'overview'
  | 'transactions'
  | 'insights'
  | 'plan'
  | 'reports'
  | 'settings';

interface Props {
  active: NavSection;
  onSelect: (section: NavSection) => void;
  userId: string;
  displayName: string;
  onBackToLanding: () => void;
}

const PRIMARY_ITEMS: Array<{ id: NavSection; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
  { id: 'transactions', label: 'Data Vault', icon: <ArrowLeftRight size={16} /> },
  { id: 'insights', label: 'Spending & Trends', icon: <PieChart size={16} /> },
  { id: 'plan', label: 'Debt & Wealth', icon: <Target size={16} /> },
  { id: 'reports', label: 'AI Strategy', icon: <BarChart3 size={16} /> },
];

export const Sidebar: React.FC<Props> = ({ active, onSelect, userId, displayName, onBackToLanding }) => {
  return (
    <aside className="sidebar-desktop">
      <div className="sidebar-card">
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {PRIMARY_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${active === item.id ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="nav-divider" />

        <nav className="sidebar-nav" aria-label="Settings">
          <button
            className={`nav-item ${active === 'settings' ? 'active' : ''}`}
            onClick={() => onSelect('settings')}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </nav>

        <div
          style={{
            marginTop: 4,
            background: 'var(--bg-soft)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Workspace
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
              {displayName || userId}
            </div>
          </div>
          <button
            className="btn btn-sm"
            style={{ width: '100%', fontSize: '0.75rem' }}
            onClick={onBackToLanding}
          >
            Switch Account
          </button>
        </div>
      </div>
    </aside>
  );
};
