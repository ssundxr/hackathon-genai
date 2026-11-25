import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  History,
  Lock,
  Maximize2,
  PieChart,
  PiggyBank,
  Send,
  Shield,
  TrendingDown,
  Wallet,
  X,
} from 'lucide-react';
import { ChatTurn } from '../types';

interface Props {
  hasHistory: boolean;
  priorMonth?: string;
  chatHistory: ChatTurn[];
  onSendChat: (question: string) => Promise<void>;
  inputRef?: React.RefObject<HTMLInputElement>;
}

const SUGGESTIONS = [
  { label: 'Summarize my uploaded spending in plain words', icon: <PieChart size={14} color="#52555A" /> },
  { label: 'How can I build an emergency fund faster?', icon: <Shield size={14} color="#52555A" /> },
  { label: 'Which expenses should I cut first?', icon: <TrendingDown size={14} color="#52555A" /> },
  { label: 'How do I start saving consistently?', icon: <PiggyBank size={14} color="#52555A" /> },
  { label: 'Compare this month with last month', icon: <History size={14} color="#52555A" /> },
  { label: 'Explain my cash flow & health score', icon: <Wallet size={14} color="#52555A" /> },
];

const FOLLOWUP_CHIPS = [
  'Compare with last month',
  'Help me reduce expenses',
  'Biggest spending category',
];

export const AdvisorPanel: React.FC<Props> = ({
  hasHistory,
  priorMonth,
  chatHistory,
  onSendChat,
  inputRef,
}) => {
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [chatOpen, setChatOpen] = useState(chatHistory.length > 0);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(chatHistory.length === 0);
  const [modalOpen, setModalOpen] = useState(false);

  React.useEffect(() => {
    if (chatHistory.length > 0) {
      setChatOpen(true);
      setSuggestionsExpanded(false);
    }
  }, [chatHistory.length]);

  const sendPrompt = async (text: string) => {
    const clean = text.trim();
    if (!clean || sending) return;
    setChatOpen(true);
    setSuggestionsExpanded(false);
    setSending(true);
    setQuestion('');
    try {
      await onSendChat(clean);
    } finally {
      setSending(false);
    }
  };

  const renderChatThread = (tall = false) => (
    <div
      className="chat-scroll"
      style={tall ? { maxHeight: '55vh', minHeight: 320 } : undefined}
    >
      {chatHistory.length === 0 ? (
        <div className="muted" style={{ fontSize: '0.82rem' }}>
          Pick a prompt or ask anything about your spending, savings goals, or past months.
        </div>
      ) : (
        chatHistory.map((turn, idx) => (
          <div key={idx} className={`chat-bubble chat-${turn.role}`}>
            {turn.text}
          </div>
        ))
      )}
    </div>
  );

  return (
    <>
      <aside className="advisor-col" aria-label="AI Financial Advisor">
        <div className="card" style={{ padding: '16px 18px' }}>
          <h2 className="advisor-heading">FinWise Advisor</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.78rem', lineHeight: 1.45 }}>
            {hasHistory
              ? `Grounded in verified metrics, CSV/Excel rows, and ${priorMonth} history.`
              : 'Grounded in your verified metrics and uploaded transactions.'}
          </p>
        </div>

        {/* Collapsible Prompts */}
        <div className="suggestion-list">
          <button
            type="button"
            onClick={() => setSuggestionsExpanded(!suggestionsExpanded)}
            style={{
              width: '100%',
              padding: '11px 14px',
              fontSize: '0.79rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              background: 'var(--bg-soft)',
              border: 'none',
              borderBottom: suggestionsExpanded ? '1px solid var(--border)' : 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span>Suggested Prompts</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
              {suggestionsExpanded ? 'Hide' : 'Show'}
              {suggestionsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {suggestionsExpanded &&
            SUGGESTIONS.map((item) => (
              <button
                key={item.label}
                className="suggestion-row"
                disabled={sending}
                onClick={() => sendPrompt(item.label)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                <ChevronRight size={14} color="#767A80" />
              </button>
            ))}
        </div>

        {/* Chat Thread */}
        {chatOpen && (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.79rem', fontWeight: 600 }}>Conversation</span>
              <button
                className="link-btn"
                style={{ fontSize: '0.75rem' }}
                onClick={() => setModalOpen(true)}
                title="Expand chat"
              >
                <Maximize2 size={12} /> Expand
              </button>
            </div>

            {renderChatThread(false)}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {FOLLOWUP_CHIPS.map((chip) => (
                <button
                  key={chip}
                  className="btn btn-sm"
                  style={{ fontSize: '0.72rem', padding: '4px 9px' }}
                  disabled={sending}
                  onClick={() => sendPrompt(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              type="text"
              value={question}
              placeholder="Ask about your finances..."
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendPrompt(question);
              }}
              style={{ flex: 1, borderRadius: 999, paddingLeft: 14 }}
              aria-label="Ask FinWise AI advisor"
            />
            <button
              className="btn btn-dark"
              style={{ padding: '8px 13px', borderRadius: 999 }}
              disabled={sending || !question.trim()}
              onClick={() => sendPrompt(question)}
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          </div>
          <div
            className="muted"
            style={{
              marginTop: 8,
              fontSize: '0.72rem',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Lock size={11} /> Educational guidance · Private workspace
          </div>
        </div>
      </aside>

      {/* Expanded Full-Width Chat Modal */}
      {modalOpen && (
        <div className="chat-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>FinWise Advisor</h3>
                <div className="muted" style={{ fontSize: '0.78rem' }}>
                  {hasHistory ? `Grounded in current & ${priorMonth} history` : 'Grounded in your workspace summary'}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setModalOpen(false)} aria-label="Close expanded chat">
                <X size={16} />
              </button>
            </div>

            {renderChatThread(true)}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FOLLOWUP_CHIPS.map((chip) => (
                <button
                  key={chip}
                  className="btn btn-sm"
                  disabled={sending}
                  onClick={() => sendPrompt(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                value={question}
                placeholder="Ask anything about your finances..."
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendPrompt(question);
                }}
                style={{ flex: 1, borderRadius: 999, paddingLeft: 16 }}
              />
              <button
                className="btn btn-dark"
                style={{ borderRadius: 999 }}
                disabled={sending || !question.trim()}
                onClick={() => sendPrompt(question)}
              >
                <Send size={14} /> {sending ? 'Thinking...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
