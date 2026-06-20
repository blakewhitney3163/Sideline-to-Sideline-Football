import React from 'react';
import { Contract, CapSummary, Decision } from './types';
import { TRAIT_META, ratingColor, trajectory, fmtSalary, askingPrice } from './utils';

interface CpuFaResult { totalSigned: number; teamsActive: number; }

interface Props {
  expiringPlayers: Contract[];
  cap: CapSummary | null;
  playerDecisions: Record<number, Decision>;
  setPlayerDecisions: React.Dispatch<React.SetStateAction<Record<number, Decision>>>;
  resigningId: number | null;
  setResigningId: (id: number | null) => void;
  resignYears: number;
  setResignYears: (y: number) => void;
  resignSalary: string;
  setResignSalary: (s: string) => void;
  cpuFaResult: CpuFaResult | null;
  cpuFaDone: boolean;
  setCpuFaDone: (v: boolean) => void;
  setCpuFaResult: (v: CpuFaResult | null) => void;
  handleResign: () => void;
  handleLetWalk: (playerId: number) => void;
  handleCpuFa: () => void;
  handleApplyTag: (playerId: number, tagType: 'franchise' | 'transition') => void;
  handleRemoveTag: (playerId: number) => void;
  pendingCounters: Record<number, { salary: number; years: number }>;
  handleAcceptCounter: (playerId: number, salary: number, years: number) => void;
  handleDeclineCounter: (playerId: number) => void;
  working: boolean;
}

export default function OffseasonTab({
  expiringPlayers, cap, playerDecisions, setPlayerDecisions,
  resigningId, setResigningId, resignYears, setResignYears, resignSalary, setResignSalary,
  cpuFaResult, cpuFaDone, setCpuFaDone, setCpuFaResult,
  handleResign, handleLetWalk, handleCpuFa, handleApplyTag, handleRemoveTag,
  pendingCounters, handleAcceptCounter, handleDeclineCounter, working,
}: Props) {
  const resignSalaryNum = parseFloat(resignSalary) || 0;
  const resignCapLeft = cap ? cap.available_cap - resignSalaryNum : 0;
  const pendingCount = Object.values(playerDecisions).filter(d => d === 'pending').length;

  const franchiseTagUsed = expiringPlayers.some(p => p.franchise_tagged === 1);
  const transitionTagUsed = expiringPlayers.some(p => p.franchise_tagged === 2);

  const openResign = (player: Contract) => {
    setResigningId(player.id);
    const ap = askingPrice(player.position, player.overall_rating, player.dev_trait, player.age);
    setResignYears(player.age <= 26 ? 4 : player.age <= 30 ? 3 : player.age <= 33 ? 2 : 1);
    setResignSalary(ap.toFixed(1));
  };

  const tagBadgeStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 'bold',
    letterSpacing: 0.8, background: `${color}22`, border: `1px solid ${color}`, color,
  });

  return (
    <div>

      {/* ── Tag Usage Banner ─────────────────────────────────────────── */}
      <div style={{
        background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 6,
        padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 24, alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, color: '#444', letterSpacing: 1 }}>TAG DESIGNATIONS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#777' }}>Franchise Tag</span>
          {franchiseTagUsed
            ? <span style={tagBadgeStyle('#e6b84a')}>⬤ USED</span>
            : <span style={{ ...tagBadgeStyle('#4caf50'), opacity: 0.8 }}>○ AVAILABLE</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#777' }}>Transition Tag</span>
          {transitionTagUsed
            ? <span style={tagBadgeStyle('#9b59b6')}>⬤ USED</span>
            : <span style={{ ...tagBadgeStyle('#4caf50'), opacity: 0.8 }}>○ AVAILABLE</span>}
        </div>
        <span style={{ fontSize: 9, color: '#333', marginLeft: 'auto', maxWidth: 260 }}>
          FT ~135% market · TT ~110% market · One of each per offseason
        </span>
      </div>

      {/* ── Re-Signing Window header ──────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, marginBottom: 4 }}>RE-SIGNING WINDOW</div>
        <div style={{ fontSize: 12, color: '#444', marginBottom: 10 }}>
          {expiringPlayers.length === 0
            ? 'No players entering the final year of their contract.'
            : `${expiringPlayers.length} player${expiringPlayers.length !== 1 ? 's' : ''} in the final year of their contract.`}
        </div>
        {expiringPlayers.length > 0 && (
          <div style={{ display: 'flex', gap: 16, fontSize: 10, color: '#555', marginBottom: 12 }}>
            <span>✓ {Object.values(playerDecisions).filter(d => d === 'resigned').length} re-signed</span>
            <span>→ {Object.values(playerDecisions).filter(d => d === 'walking').length} letting walk</span>
            <span>⏳ {pendingCount} pending</span>
          </div>
        )}
      </div>

      {/* ── Player Cards ─────────────────────────────────────────────── */}
      {expiringPlayers.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#333', fontSize: 13 }}>
          No expiring contracts — you're good to advance the season.
        </div>
      ) : expiringPlayers.map(player => {
        const decision = playerDecisions[player.id] ?? 'pending';
        const trait = TRAIT_META[player.dev_trait] ?? TRAIT_META['Normal'];
        const traj = trajectory(player.age);
        const ap = askingPrice(player.position, player.overall_rating, player.dev_trait, player.age);
        const isResigning = resigningId === player.id;
        const tagged = player.franchise_tagged ?? 0;
        const isFranchiseTagged = tagged === 1;
        const isTransitionTagged = tagged === 2;
        const isTagged = tagged > 0;
        const counter = pendingCounters[player.id];

        // Holdout risk: elite player, unhappy, not yet resolved
        const isHoldoutRisk = player.overall_rating >= 85 &&
          (player.dev_trait === 'Superstar' || player.dev_trait === 'X-Factor') &&
          (player.morale ?? 75) < 65 &&
          !isTagged && decision === 'pending' && !counter;

        const tagColor = isFranchiseTagged ? '#e6b84a' : '#9b59b6';
        const decisionLabel = isTagged
          ? (isFranchiseTagged ? 'FRANCHISE TAGGED' : 'TRANSITION TAGGED')
          : counter ? 'COUNTER OFFER'
          : decision === 'resigned' ? 'RE-SIGNED'
          : decision === 'walking' ? 'LETTING WALK'
          : 'PENDING';

        const decisionColor = isTagged ? tagColor
          : counter ? '#FF8740'
          : decision === 'resigned' ? '#4caf50'
          : decision === 'walking' ? '#e57373'
          : '#555';

        return (
          <div key={player.id} style={{
            background: '#0f0f0f',
            border: `1px solid ${isTagged ? tagColor + '44' : counter ? '#FF874033' : '#1a1a1a'}`,
            borderRadius: 6, marginBottom: 8, overflow: 'hidden',
          }}>
            {/* Main row */}
            <div style={{ padding: '10px 14px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>

              {/* Name + badges */}
              <div style={{ minWidth: 150 }}>
                <div style={{ fontSize: 13, color: '#ccc', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {player.first_name} {player.last_name}
                  {trait.short && <span style={{ fontSize: 9, color: trait.color }}>{trait.short}</span>}
                  {isHoldoutRisk && (
                    <span style={{
                      fontSize: 9, fontWeight: 'bold', padding: '1px 5px', borderRadius: 2,
                      background: '#1a0d00', border: '1px solid #FF874066', color: '#FF8740',
                    }}>⚠ HOLDOUT RISK</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: '#555' }}>{player.position_label || player.position}</div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#555', fontSize: 9 }}>AGE</div>
                  <div style={{ color: '#aaa' }}>{player.age} <span style={{ color: traj.color }}>{traj.label}</span></div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#555', fontSize: 9 }}>OVR</div>
                  <div style={{ color: ratingColor(player.overall_rating), fontWeight: 'bold' }}>{player.overall_rating}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#555', fontSize: 9 }}>TRAIT</div>
                  <div style={{ color: trait.color, fontSize: 10 }}>{player.dev_trait === 'Normal' ? '—' : player.dev_trait}</div>
                </div>
              </div>

              {/* Salaries */}
              <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                <div>
                  <div style={{ color: '#555', fontSize: 9 }}>Current</div>
                  <div style={{ color: '#aaa' }}>{fmtSalary(player.annual_salary)}/yr</div>
                </div>
                <div>
                  <div style={{ color: '#555', fontSize: 9 }}>Asking ~</div>
                  <div style={{ color: '#aaa' }}>{fmtSalary(ap)}/yr</div>
                </div>
              </div>

              {/* Decision + buttons */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: decisionColor, fontWeight: 'bold' }}>{decisionLabel}</span>

                {/* Tagged: Remove Tag */}
                {isTagged && (
                  <button onClick={() => handleRemoveTag(player.id)} disabled={working} style={{
                    padding: '3px 9px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                    background: '#1a0a0a', border: `1px solid ${tagColor}55`, color: tagColor,
                  }}>Remove Tag</button>
                )}

                {/* Pending + no counter: Re-Sign, Let Walk, Tag buttons */}
                {!isTagged && !counter && decision === 'pending' && (
                  <>
                    <button onClick={() => isResigning ? setResigningId(null) : openResign(player)} style={{
                      padding: '3px 9px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                      background: isResigning ? '#1a3a1a' : '#141414',
                      border: `1px solid ${isResigning ? '#4caf50' : '#2a2a2a'}`,
                      color: isResigning ? '#4caf50' : '#555',
                    }}>{isResigning ? 'Cancel' : 'Re-Sign'}</button>

                    <button onClick={() => handleLetWalk(player.id)} style={{
                      padding: '3px 9px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                      background: '#141414', border: '1px solid #2a2a2a', color: '#555',
                    }}>Let Walk</button>

                    {!franchiseTagUsed && (
                      <button onClick={() => handleApplyTag(player.id, 'franchise')} disabled={working} style={{
                        padding: '3px 9px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                        background: '#1a1400', border: '1px solid #e6b84a55', color: '#e6b84a', fontWeight: 'bold',
                      }}>🏷 FT</button>
                    )}
                    {!transitionTagUsed && (
                      <button onClick={() => handleApplyTag(player.id, 'transition')} disabled={working} style={{
                        padding: '3px 9px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                        background: '#12001a', border: '1px solid #9b59b655', color: '#9b59b6', fontWeight: 'bold',
                      }}>🏷 TT</button>
                    )}
                  </>
                )}

                {/* Walking: Undo */}
                {!isTagged && !counter && decision === 'walking' && (
                  <button onClick={() => setPlayerDecisions(prev => ({ ...prev, [player.id]: 'pending' }))} style={{
                    padding: '3px 9px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                    background: '#141414', border: '1px solid #2a2a2a', color: '#555',
                  }}>Undo</button>
                )}
              </div>
            </div>

            {/* Counter Offer Panel */}
            {counter && decision === 'pending' && !isTagged && (
              <div style={{ borderTop: '1px solid #2a1a0a', padding: '12px 14px', background: '#0e0a06' }}>
                <div style={{ fontSize: 11, color: '#FF8740', marginBottom: 6, fontWeight: 'bold' }}>
                  ⚡ COUNTER OFFER
                </div>
                <div style={{ fontSize: 12, color: '#ccc', marginBottom: 10 }}>
                  {player.first_name} {player.last_name} will sign for{' '}
                  <strong style={{ color: '#FF8740' }}>${counter.salary.toFixed(1)}M/yr</strong> ·{' '}
                  <strong>{counter.years} year{counter.years !== 1 ? 's' : ''}</strong>
                  <span style={{ fontSize: 10, color: '#555', marginLeft: 8 }}>
                    (Total: ${(counter.salary * counter.years).toFixed(1)}M)
                  </span>
                </div>
                {cap && (
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
                    Cap after signing:{' '}
                    <span style={{ color: cap.available_cap - counter.salary < 0 ? '#e57373' : '#4caf50' }}>
                      {fmtSalary(cap.available_cap - counter.salary)} remaining
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleDeclineCounter(player.id)} disabled={working} style={{
                    padding: '6px 16px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                    background: 'transparent', border: '1px solid #2a2a2a', color: '#555',
                  }}>Decline — Let Walk</button>
                  <button
                    onClick={() => handleAcceptCounter(player.id, counter.salary, counter.years)}
                    disabled={working || !!(cap && cap.available_cap - counter.salary < 0)}
                    style={{
                      padding: '6px 18px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer', borderRadius: 4,
                      background: working ? '#141414' : '#FF8740', color: working ? '#555' : '#000', border: 'none',
                    }}>
                    {working ? '...' : 'Accept Counter'}
                  </button>
                </div>
              </div>
            )}

            {/* Re-sign form */}
            {isResigning && decision === 'pending' && !isTagged && !counter && (
              <div style={{ borderTop: '1px solid #1a1a1a', padding: '12px 14px', background: '#080808' }}>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 10, letterSpacing: 0.5 }}>
                  RE-SIGN OFFER — {player.first_name} {player.last_name}
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>YEARS</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1, 2, 3, 4, 5].map(y => (
                        <button key={y} onClick={() => setResignYears(y)} style={{
                          width: 32, height: 32, background: resignYears === y ? '#4caf50' : '#141414',
                          border: `1px solid ${resignYears === y ? '#4caf50' : '#2a2a2a'}`,
                          borderRadius: 4, color: resignYears === y ? '#000' : '#555',
                          fontWeight: 'bold', fontSize: 12, cursor: 'pointer',
                        }}>{y}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>ANNUAL SALARY (M)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#555', fontSize: 12 }}>$</span>
                                            <input type="text" inputMode="decimal" key={`resign-${resigningId}`} defaultValue={resignSalary} onChange={e => setResignSalary(e.target.value)}
  placeholder="0.0"
  style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }} />
                      <span style={{ color: '#555', fontSize: 12 }}>M</span>
                    </div>
                    <div style={{ fontSize: 9, color: '#444', marginTop: 3 }}>Asking: ~{fmtSalary(ap)}/yr</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>CAP AFTER SIGNING</div>
                    <div style={{ fontSize: 13, color: resignCapLeft < 0 ? '#e57373' : '#4caf50' }}>
                      {fmtSalary(resignCapLeft)} remaining
                    </div>
                  </div>
                  <button onClick={handleResign} disabled={working || resignCapLeft < 0} style={{
                    padding: '8px 18px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
                    background: resignCapLeft < 0 ? '#1a1a1a' : '#4caf50',
                    color: resignCapLeft < 0 ? '#333' : '#000', border: 'none', borderRadius: 4,
                  }}>
                    {working ? '...' : resignCapLeft < 0 ? 'OVER CAP' : 'Confirm Re-Sign'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {expiringPlayers.length > 0 && (
        <div style={{ fontSize: 10, color: '#333', marginTop: 8, marginBottom: 24 }}>
          Players marked "Letting Walk" become free agents when the season advances.
        </div>
      )}

      {/* ── CPU Free Agency ─────────────────────────────────────────── */}
      <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 6, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, marginBottom: 6 }}>CPU FREE AGENCY</div>
        <div style={{ fontSize: 12, color: '#444', marginBottom: 4 }}>
          Run CPU free agency to let the other 31 teams fill their roster gaps.
        </div>
        <div style={{ fontSize: 11, color: '#333', marginBottom: 12 }}>
          Best done after you've finished your own signings.
        </div>
        {cpuFaDone && cpuFaResult ? (
          <div>
            <div style={{ fontSize: 12, color: '#4caf50', marginBottom: 4 }}>✓ CPU Free Agency Complete</div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>
              {cpuFaResult.totalSigned} players signed across {cpuFaResult.teamsActive} teams.
            </div>
            <button onClick={() => { setCpuFaDone(false); setCpuFaResult(null); }} style={{
              padding: '4px 12px', background: 'transparent', border: '1px solid #2a2a3a',
              borderRadius: 4, color: '#444', fontSize: 11, cursor: 'pointer',
            }}>Run Again</button>
          </div>
        ) : (
          <button onClick={handleCpuFa} disabled={working} style={{
            padding: '8px 18px', fontSize: 11, fontWeight: 'bold',
            cursor: working ? 'not-allowed' : 'pointer',
            background: working ? '#141414' : '#FF8740',
            color: working ? '#555' : '#000', border: 'none', borderRadius: 4,
          }}>
            {working ? 'Running...' : 'RUN CPU FREE AGENCY'}
          </button>
        )}
      </div>
    </div>
  );
}
