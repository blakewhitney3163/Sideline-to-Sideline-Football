import React, { useState } from 'react';
import { T } from '../theme';

interface AnnouncingRetirement {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  age: number;
  overall_rating: number;
  annual_salary: number | null;
}

interface CpuFaResult {
  totalSigned: number;
  teamsActive: number;
}

interface Props {
  pendingResigns: number;
  draftComplete: boolean;
  draftGenerated: boolean;
  faOpen: boolean;
  rosterSize: number;
  announcingRetirements: AnnouncingRetirement[];
  refreshOffseasonStatus: () => void;
  onNavigate: (tab: string) => void;
  onOpenFreeAgency: () => void;
  onMakeOffer: (playerId: number) => Promise<{ accepted: boolean; name: string; salary?: number }>;
  onLetGo: (playerId: number) => Promise<void>;
  offseasonPhase: string;
  onAdvancePhase: () => void;
  onRunCpuFa: () => void;
  cpuFaDone: boolean;
  cpuFaResult: CpuFaResult | null;
}

const PHASES = [
  { key: 'resign',       label: 'Re-Sign'  },
  { key: 'fa_week1',     label: 'FA Wk 1'  },
  { key: 'fa_week2',     label: 'FA Wk 2'  },
  { key: 'combine',      label: 'Combine'  },
  { key: 'draft',        label: 'Draft'    },
  { key: 'roster_review', label: 'Roster'  },
] as const;

export default function OffseasonChecklist({
  pendingResigns, draftComplete, draftGenerated, faOpen, rosterSize,
  announcingRetirements, refreshOffseasonStatus, onNavigate,
  onOpenFreeAgency, onMakeOffer, onLetGo,
  offseasonPhase, onAdvancePhase, onRunCpuFa, cpuFaDone, cpuFaResult,
}: Props) {
  const [retResults, setRetResults] = useState<Record<number, { accepted: boolean; salary?: number }>>({});
  const [retWorking, setRetWorking] = useState<Set<number>>(new Set());
  const [cpuFaRunning, setCpuFaRunning] = useState(false);
  const [faOpening, setFaOpening] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const phaseIdx = PHASES.findIndex(p => p.key === offseasonPhase);

  const handleRetOffer = async (playerId: number) => {
    setRetWorking(prev => new Set([...prev, playerId]));
    const res = await onMakeOffer(playerId);
    setRetResults(prev => ({ ...prev, [playerId]: { accepted: res.accepted, salary: res.salary } }));
    setRetWorking(prev => { const s = new Set(prev); s.delete(playerId); return s; });
  };

  const handleRetLetGo = async (playerId: number) => {
    setRetWorking(prev => new Set([...prev, playerId]));
    await onLetGo(playerId);
    setRetResults(prev => ({ ...prev, [playerId]: { accepted: false } }));
    setRetWorking(prev => { const s = new Set(prev); s.delete(playerId); return s; });
  };

  const handleOpenFa = async () => {
    setFaOpening(true);
    await onOpenFreeAgency();
    setFaOpening(false);
  };

  const handleRunCpuFaClick = async () => {
    setCpuFaRunning(true);
    await onRunCpuFa();
    setCpuFaRunning(false);
  };

  const handleAdvance = async () => {
    setAdvancing(true);
    await onAdvancePhase();
    setAdvancing(false);
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const primaryBtn = (color = '#FF8740', disabled = false): React.CSSProperties => ({
    padding: '8px 18px', fontSize: 11, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? '#141414' : color, color: disabled ? '#555' : '#000',
    border: 'none', borderRadius: 4, opacity: disabled ? 0.6 : 1,
  });

  const ghostBtn = (color = '#555'): React.CSSProperties => ({
    padding: '7px 14px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
    background: 'transparent', border: `1px solid ${color}22`, color,
  });

  const navBtn: React.CSSProperties = {
    padding: '7px 14px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
    background: '#111', border: `1px solid ${T.borderMid}`, color: T.textMuted,
  };

  // ─── Retirement Announcements ────────────────────────────────────────────────

  const retirementPanel = announcingRetirements.length > 0 && (
    <div style={{ marginBottom: 14, padding: '10px 14px', background: '#150808', border: '1px solid #4a1515', borderRadius: 6 }}>
      <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#e57373', marginBottom: 10, textTransform: 'uppercase', fontWeight: 700 }}>
        ⚠ Retirement Announcements — {announcingRetirements.length} Player{announcingRetirements.length !== 1 ? 's' : ''}
      </div>
      <div style={{ fontSize: 10, color: T.textDim, marginBottom: 10 }}>
        Make a one-year offer to convince them to return — but they may still say no.
      </div>
      {announcingRetirements.map(p => {
        const result = retResults[p.id];
        const busy = retWorking.has(p.id);
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #2a1212' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: T.textPrimary, fontWeight: 600 }}>
                {p.first_name} {p.last_name}
              </div>
              <div style={{ fontSize: 10, color: T.textMuted }}>
                {p.position_label || p.position} · Age {p.age} · {p.overall_rating} OVR
                {p.annual_salary ? ` · $${p.annual_salary.toFixed(1)}M` : ''}
              </div>
            </div>
            {result ? (
              <div style={{ fontSize: 10, fontStyle: 'italic', textAlign: 'right', color: result.accepted ? '#4caf50' : '#e57373' }}>
                {result.accepted ? `✓ Returning — 1yr $${result.salary?.toFixed(1)}M` : '✗ Retired'}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => handleRetOffer(p.id)} disabled={busy} style={{ fontSize: 10, padding: '4px 10px', background: busy ? T.bgCard : '#0a2a0a', border: `1px solid ${busy ? T.borderMid : '#2a5a2a'}`, borderRadius: 3, color: busy ? T.textDim : '#4caf50', cursor: busy ? 'not-allowed' : 'pointer' }}>
                  {busy ? '…' : 'Make Offer'}
                </button>
                <button onClick={() => handleRetLetGo(p.id)} disabled={busy} style={{ fontSize: 10, padding: '4px 10px', background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 3, color: T.textMuted, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>
                  Let Go
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ─── Phase Stepper ────────────────────────────────────────────────────────────

  const phaseStepper = (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, padding: '12px 0 4px' }}>
      {PHASES.map((phase, idx) => {
        const isActive  = idx === phaseIdx;
        const isDone    = idx < phaseIdx;
        const isFuture  = idx > phaseIdx;
        return (
          <React.Fragment key={phase.key}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: isDone ? '#4caf50' : isActive ? '#FF8740' : '#1a1a1a',
                border: `2px solid ${isDone ? '#4caf50' : isActive ? '#FF8740' : '#2a2a2a'}`,
                color: isDone || isActive ? '#000' : '#444',
                boxShadow: isActive ? '0 0 8px #FF874055' : 'none',
                flexShrink: 0,
              }}>
                {isDone ? '✓' : idx + 1}
              </div>
              <div style={{
                fontSize: 9, letterSpacing: 0.5, fontWeight: isActive ? 700 : 400,
                color: isDone ? '#4caf50' : isActive ? '#FF8740' : '#333',
                whiteSpace: 'nowrap',
              }}>
                {phase.label}
              </div>
            </div>
            {idx < PHASES.length - 1 && (
              <div style={{ flex: 1, height: 2, background: idx < phaseIdx ? '#4caf5066' : '#1a1a1a', margin: '0 4px', marginBottom: 18 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  // ─── Phase Content ────────────────────────────────────────────────────────────

  const phaseContent = (() => {
    switch (offseasonPhase) {

      case 'resign': return (
        <div>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, marginBottom: 6 }}>RE-SIGNING WINDOW</div>
          <div style={{ fontSize: 12, color: T.textDim, marginBottom: 12 }}>
            Decide which expiring players to keep and which to release to free agency.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '8px 12px', background: '#0d0d0d', borderRadius: 4, border: `1px solid ${T.borderFaint}` }}>
            <span style={{ fontSize: 12, color: pendingResigns === 0 ? '#4caf50' : '#FF8740' }}>
              {pendingResigns === 0 ? '✓' : '⚠'}
            </span>
            <span style={{ fontSize: 11, color: pendingResigns === 0 ? '#4caf50' : T.textSecondary }}>
              {pendingResigns === 0
                ? 'All expiring contracts addressed'
                : `${pendingResigns} player${pendingResigns !== 1 ? 's' : ''} still need a decision`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={navBtn} onClick={() => onNavigate('myteam')}>
              → Go to Re-Signs
            </button>
            <button
              style={primaryBtn('#4caf50', faOpening)}
              onClick={handleOpenFa}
              disabled={faOpening}
            >
              {faOpening ? 'Opening…' : 'Open Free Agency →'}
            </button>
          </div>
          <div style={{ fontSize: 9, color: T.textDim, marginTop: 8 }}>
            Opening free agency processes expired contracts and advances to the FA signing period.
          </div>
        </div>
      );

      case 'fa_week1': return (
        <div>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, marginBottom: 6 }}>FREE AGENCY — WEEK 1</div>
          <div style={{ fontSize: 12, color: T.textDim, marginBottom: 12 }}>
            The signing window is open. Browse available free agents and fill your roster needs.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '8px 12px', background: '#0d0d0d', borderRadius: 4, border: `1px solid ${T.borderFaint}` }}>
            <span style={{ fontSize: 12, color: '#4caf50' }}>✓</span>
            <span style={{ fontSize: 11, color: T.textSecondary }}>
              Free agent pool open — sign players from the FA tab in My Team
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={navBtn} onClick={() => onNavigate('myteam')}>
              → Browse Free Agents
            </button>
            <button
              style={primaryBtn('#FF8740', advancing)}
              onClick={handleAdvance}
              disabled={advancing}
            >
              {advancing ? '…' : 'Done Signing — Advance to Week 2 →'}
            </button>
          </div>
        </div>
      );

      case 'fa_week2': return (
        <div>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, marginBottom: 6 }}>FREE AGENCY — WEEK 2</div>
          <div style={{ fontSize: 12, color: T.textDim, marginBottom: 12 }}>
            Other teams finalize their rosters. Run CPU free agency to simulate league-wide signings.
          </div>
          {cpuFaDone && cpuFaResult ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '8px 12px', background: '#060e06', borderRadius: 4, border: '1px solid #4caf5033' }}>
                <span style={{ fontSize: 12, color: '#4caf50' }}>✓</span>
                <span style={{ fontSize: 11, color: '#4caf50' }}>
                  CPU Free Agency Complete — {cpuFaResult.totalSigned} players signed across {cpuFaResult.teamsActive} teams
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={navBtn} onClick={() => onNavigate('myteam')}>
                  → Browse Free Agents
                </button>
                <button style={primaryBtn('#FF8740', advancing)} onClick={handleAdvance} disabled={advancing}>
                  {advancing ? '…' : 'Continue to Combine →'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '8px 12px', background: '#0d0d0d', borderRadius: 4, border: `1px solid ${T.borderFaint}` }}>
                <span style={{ fontSize: 12, color: T.textDim }}>○</span>
                <span style={{ fontSize: 11, color: T.textMuted }}>CPU free agency not yet run</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={navBtn} onClick={() => onNavigate('myteam')}>
                  → Browse Free Agents
                </button>
                <button style={primaryBtn('#FF8740', cpuFaRunning)} onClick={handleRunCpuFaClick} disabled={cpuFaRunning}>
                  {cpuFaRunning ? 'Running…' : 'Run CPU Free Agency'}
                </button>
              </div>
            </>
          )}
        </div>
      );

      case 'combine': return (
        <div>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, marginBottom: 6 }}>DRAFT COMBINE</div>
          <div style={{ fontSize: 12, color: T.textDim, marginBottom: 12 }}>
            Review prospect athleticism and complete your scouting before making draft selections.
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ padding: '8px 16px', background: '#0d0d0d', borderRadius: 4, border: `1px solid ${T.borderFaint}` }}>
              <div style={{ fontSize: 9, color: '#444', letterSpacing: 0.5, marginBottom: 3 }}>STATUS</div>
              <div style={{ fontSize: 11, color: T.textSecondary }}>
                {draftGenerated ? 'Draft class generated — ready to scout' : 'Draft class not yet generated'}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#444', marginBottom: 12, lineHeight: 1.6 }}>
            Head to the Draft tab to view combine stats and scout individual prospects.
            Two-level scouting unlocks exact OVR and dev trait data.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={navBtn} onClick={() => onNavigate('draft')}>
              → Scout Prospects
            </button>
            <button style={primaryBtn('#FF8740', advancing)} onClick={handleAdvance} disabled={advancing}>
              {advancing ? '…' : 'Enter Draft →'}
            </button>
          </div>
        </div>
      );

      case 'draft': return (
        <div>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, marginBottom: 6 }}>NFL DRAFT</div>
          <div style={{ fontSize: 12, color: T.textDim, marginBottom: 12 }}>
            7 rounds · Reverse standings order · CPU auto-picks for other teams
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '8px 12px', background: '#0d0d0d', borderRadius: 4, border: `1px solid ${T.borderFaint}` }}>
            <span style={{ fontSize: 12, color: draftComplete ? '#4caf50' : draftGenerated ? '#FF8740' : T.textDim }}>
              {draftComplete ? '✓' : draftGenerated ? '◉' : '○'}
            </span>
            <span style={{ fontSize: 11, color: draftComplete ? '#4caf50' : T.textSecondary }}>
              {draftComplete
                ? 'Draft complete — all 7 rounds finished, rookies added to rosters'
                : draftGenerated
                  ? 'Draft in progress — picks remaining'
                  : 'Draft class ready — not yet started'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={primaryBtn(draftComplete ? '#4caf50' : '#FF8740')} onClick={() => onNavigate('draft')}>
              {draftComplete ? '→ View Draft Results' : '→ Go to Draft'}
            </button>
          </div>
          {!draftComplete && (
            <div style={{ fontSize: 9, color: '#333', marginTop: 8 }}>
              Roster Review unlocks automatically when all 7 rounds are complete.
            </div>
          )}
        </div>
      );

      case 'roster_review': {
        const overLimit = rosterSize > 53;
        return (
          <div>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, marginBottom: 6 }}>ROSTER REVIEW</div>
            <div style={{ fontSize: 12, color: T.textDim, marginBottom: 12 }}>
              Finalize your 53-man active roster and practice squad before advancing the season.
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 14px', background: overLimit ? '#140800' : '#060e06', borderRadius: 4, border: `1px solid ${overLimit ? '#FF874044' : '#4caf5033'}` }}>
                <div style={{ fontSize: 9, color: '#444', letterSpacing: 0.5, marginBottom: 3 }}>ACTIVE ROSTER</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: overLimit ? '#FF8740' : '#4caf50' }}>
                  {rosterSize} / 53
                </div>
                {overLimit && (
                  <div style={{ fontSize: 9, color: '#FF8740', marginTop: 2 }}>
                    Cut {rosterSize - 53} player{rosterSize - 53 !== 1 ? 's' : ''} before advancing
                  </div>
                )}
              </div>
            </div>
            {overLimit ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button style={{ ...primaryBtn('#e57373'), background: '#3a0a0a', border: '1px solid #e5737355', color: '#e57373' }} onClick={() => onNavigate('myteam')}>
                  ⚠ Cut Players — Roster Over Limit
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: '#060e06', borderRadius: 4, border: '1px solid #4caf5033' }}>
                  <span style={{ fontSize: 12, color: '#4caf50' }}>✓</span>
                  <span style={{ fontSize: 11, color: '#4caf50' }}>Roster set — use the Advance Season button in the sidebar when ready</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={navBtn} onClick={() => onNavigate('myteam')}>
                    → Review Roster
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      }

      default: return null;
    }
  })();

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '16px 20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 9, letterSpacing: 2, color: T.textMuted, textTransform: 'uppercase' }}>
          OFFSEASON WORKFLOW
        </div>
        <button onClick={refreshOffseasonStatus} style={{ fontSize: 9, color: T.textDim, background: 'none', border: 'none', cursor: 'pointer' }}>
          ↺ refresh
        </button>
      </div>

      {retirementPanel}

      {phaseStepper}

      {/* Active phase card */}
      <div style={{ background: '#0a0a0a', border: `1px solid #FF874022`, borderRadius: 6, padding: '16px 18px', borderLeft: '3px solid #FF8740' }}>
        {phaseContent}
      </div>

    </div>
  );
}
