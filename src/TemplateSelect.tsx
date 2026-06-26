import React from 'react';
import { T } from './theme';

declare const window: any;

interface Template {
  id: string;
  label: string;
  tagline: string;
  ovrRange: string;
  capSpace: string;
  patience: string;
  color: string;
  description: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'default',
    label: 'Default',
    tagline: 'No adjustments',
    ovrRange: 'League average OVR',
    capSpace: 'Standard cap room',
    patience: 'Normal expectations',
    color: '#94a3b8',
    description: 'Start with a stock roster. No ratings adjustments, no cap changes. Pick any team and play.',
  },
  {
    id: 'rebuild',
    label: 'Rebuild',
    tagline: 'Start from scratch',
    ovrRange: '62–70 OVR',
    capSpace: '$30M+ cap space',
    patience: '5-year horizon',
    color: '#4FC3F7',
    description: 'A young, developing roster with cap room to grow. Draft well, develop players, and build a dynasty from the ground up.',
  },
  {
    id: 'contender',
    label: 'Contender',
    tagline: 'Win-now window',
    ovrRange: '78–84 OVR',
    capSpace: '$15M cap space',
    patience: '2-year window',
    color: '#FF8740',
    description: 'A talented, proven roster with playoff expectations. Make smart moves to push over the top before the window closes.',
  },
  {
    id: 'dynasty',
    label: 'Dynasty',
    tagline: 'Championship expectations',
    ovrRange: '85–90 OVR core',
    capSpace: '$8M cap space',
    patience: 'Win now',
    color: '#FFD700',
    description: 'A stacked roster built to win it all. The owner expects championships. Any regression will be felt immediately.',
  },
];

interface Props {
  onSelect: (templateId: string) => void;
  onBack: () => void;
}

export default function TemplateSelect({ onSelect, onBack }: Props) {
  const handleSelect = async (id: string) => {
    if (id === 'default') {
      await window.api.setSetting?.('dynasty_template', '').catch(() => {});
    } else {
      await window.api.setSetting?.('dynasty_template', id).catch(() => {});
    }
    onSelect(id);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0f1a',
      color: '#e2e8f0',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 24px',
    }}>
      {/* Back button */}
      <div style={{ width: '100%', maxWidth: 860, marginBottom: 32 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: '1px solid #333', color: '#888',
            padding: '8px 18px', borderRadius: 6, cursor: 'pointer',
            fontSize: 11, fontFamily: 'monospace', letterSpacing: 2,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#666'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#333'; }}
        >
          ← BACK
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#4FC3F7', letterSpacing: 4, fontFamily: 'monospace', marginBottom: 8 }}>
        Sideline to Sideline Football
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', textAlign: 'center' }}>
        Choose Your Starting Scenario
      </h1>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 40, textAlign: 'center' }}>
        This shapes your roster quality, cap situation, and owner expectations.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        width: '100%',
        maxWidth: 860,
      }}>
        {TEMPLATES.map(t => (
          <button
            key={t.id}
            onClick={() => handleSelect(t.id)}
            style={{
              background: '#111827',
              border: `1px solid ${t.color}44`,
              borderRadius: 10,
              padding: '28px 24px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = t.color;
              e.currentTarget.style.background = '#151e2e';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = `${t.color}44`;
              e.currentTarget.style.background = '#111827';
            }}
          >
            <div style={{ fontSize: 11, color: t.color, marginBottom: 6, fontFamily: 'monospace', letterSpacing: 1 }}>
              {t.tagline}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>
              {t.label}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16, lineHeight: 1.5 }}>
              {t.description}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {[t.ovrRange, t.capSpace, t.patience].map((stat, i) => (
                <span key={i} style={{
                  fontSize: 11, color: '#64748b', background: '#1e293b',
                  padding: '3px 10px', borderRadius: 4,
                }}>
                  {stat}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 12, color: t.color, fontFamily: 'monospace', letterSpacing: 1 }}>
              Select {t.label} →
            </div>
          </button>
        ))}
      </div>

      <p style={{ color: '#334155', fontSize: 12, marginTop: 32 }}>
        You can pick any team after selecting a scenario.
      </p>
    </div>
  );
}
