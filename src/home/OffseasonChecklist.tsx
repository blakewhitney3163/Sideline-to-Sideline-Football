import React from 'react';
import { T } from '../theme';

interface Props {
  pendingResigns: number;
  draftComplete: boolean;
  draftGenerated: boolean;
  faOpen: boolean;          // NEW
  rosterSize: number;       // NEW — active roster count
  refreshOffseasonStatus: () => void;
  onNavigate: (tab: string) => void;
  onOpenFreeAgency: () => void;  // NEW
}

export default function OffseasonChecklist({
  pendingResigns, draftComplete, draftGenerated, faOpen, rosterSize,
  refreshOffseasonStatus, onNavigate, onOpenFreeAgency,
}: Props) {

export default function OffseasonChecklist({
  pendingResigns, draftComplete, draftGenerated,
  refreshOffseasonStatus, onNavigate,
}: Props) {
  const linkBtn = (label: string, tab: string, active = false): React.CSSProperties => ({
    padding: '4px 12px',
    background: active ? T.bgGreen : T.bgPanel,
    border: `1px solid ${active ? '#1a4a1a' : T.borderMid}`,
    borderRadius: 3, color: active ? '#4caf50' : T.textMuted, fontSize: 10, cursor: 'pointer',
  });

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, fontWeight: 700 }}>OFFSEASON CHECKLIST</span>
        <button onClick={refreshOffseasonStatus} style={{ ...linkBtn('↺ refresh', 'franchise') }}>↺ refresh</button>
      </div>

      {/* Re-signing */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
        <span style={{ color: pendingResigns === 0 ? '#4caf50' : '#FF8740', fontSize: 14, marginTop: 1 }}>
          {pendingResigns === 0 ? '✓' : '⚠'}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>
            Re-signing Window {pendingResigns > 0 ? `— ${pendingResigns} decision${pendingResigns !== 1 ? 's' : ''} pending` : '— Complete'}
          </div>
          <div style={{ color: T.textMuted, fontSize: 11, marginTop: 3 }}>
            {pendingResigns > 0 ? 'Players on expiring contracts need a decision before the season ends' : 'All expiring contracts addressed'}
          </div>
        </div>
        <button onClick={() => onNavigate('franchise')} style={linkBtn('→ Franchise', 'franchise')}>→ Franchise</button>
      </div>

      {/* Free Agency */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
        <span style={{ color: T.textDim, fontSize: 12, marginTop: 1 }}>OPT</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>Free Agency <span style={{ color: T.textDim, fontWeight: 400, fontSize: 11 }}>OPTIONAL</span></div>
          <div style={{ color: T.textMuted, fontSize: 11, marginTop: 3 }}>Sign replacements for departing players</div>
        </div>
        <button onClick={() => onNavigate('franchise')} style={linkBtn('→ Free Agents', 'franchise')}>→ Free Agents</button>
      </div>

      {/* Draft */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
        <span style={{ color: draftComplete ? '#4caf50' : T.textDim, fontSize: 14, marginTop: 1 }}>
          {draftComplete ? '✓' : '○'}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ color: T.textPrimary, fontSize: 13, fontWeight: 600 }}>
            NFL Draft {draftComplete ? '— Complete' : draftGenerated ? '— In Progress' : '— Not Started'}
          </div>
          <div style={{ color: T.textMuted, fontSize: 11, marginTop: 3 }}>
            {draftComplete ? '7 rounds complete — rookies added to rosters' : '7 rounds · reverse standings order · CPU auto-picks'}
          </div>
        </div>
        <button onClick={() => onNavigate('draft')} style={linkBtn('→ Draft', 'draft', !draftComplete)}>
          {draftComplete ? '→ View' : '→ Draft'}
        </button>
      </div>
    </div>
  );
}
