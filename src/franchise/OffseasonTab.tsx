import React from 'react';
import { Contract, CapSummary, Decision } from './types';
import { TRAIT_META, ratingColor, trajectory, fmtSalary, askingPrice } from './utils';

interface CpuFaResult {
  totalSigned: number;
  teamsActive: number;
}

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
  working: boolean;
}

export default function OffseasonTab({
  expiringPlayers, cap, playerDecisions, setPlayerDecisions,
  resigningId, setResigningId, resignYears, setResignYears, resignSalary, setResignSalary,
  cpuFaResult, cpuFaDone, setCpuFaDone, setCpuFaResult,
  handleResign, handleLetWalk, handleCpuFa, working,
}: Props) {
  const resignSalaryNum = parseFloat(resignSalary) || 0;
  const resignCapLeft = cap ? cap.available_cap - resignSalaryNum : 0;
  const pendingCount = Object.values(playerDecisions).filter(d => d === 'pending').length;

  const openResign = (player: Contract) => {
    setResigningId(player.id);
    const ap = askingPrice(player.position, player.overall_rating, player.dev_trait, player.age);
    setResignYears(player.age <= 26 ? 4 : player.age <= 30 ? 3 : player.age <= 33 ? 2 : 1);
    setResignSalary(ap.toFixed(1));
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: '#FF8740', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>RE-SIGNING WINDOW</div>
        <div style={{ color: '#555', fontSize: 12, marginBottom: 10 }}>
          {expiringPlayers.length === 0
            ? 'No players entering the final year of their contract.'
            : `${expiringPlayers.length} player${expiringPlayers.length !== 1 ? 's' : ''} in the final year of their contract. Make your decisions before advancing the season.`}
        </div>
        {expiringPlayers.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11 }}>
            <span style={{ color: '#4caf50' }}>✓ {Object.values(playerDecisions).filter(d => d === 'resigned').length} re-signed</span>
            <span style={{ color: '#e57373' }}>→ {Object.values(playerDecisions).filter(d => d === 'walking').length} letting walk</span>
            <span style={{ color: '#FF8740' }}>⏳ {pendingCount} pending decision</span>
          </div>
        )}
      </div>

      {expiringPlayers.length === 0 ? (
        <div style={{ color: '#333', padding: '16px 0', fontSize: 13 }}>
          No expiring contracts — you're good to advance the season.
        </div>
      ) : expiringPlayers.map(player => {
        const decision = playerDecisions[player.id] ?? 'pending';
        const trait = TRAIT_META[player.dev_trait] ?? TRAIT_META['Normal'];
        const traj = trajectory(player.age);
        const ap = askingPrice(player.position, player.overall_rating, player.dev_trait, player.age);
        const isResigning = resigningId === player.id;

        const decisionColor = decision === 'resigned' ? '#4caf50' : decision === 'walking' ? '#e57373' : '#FF8740';
        const decisionLabel = decision === 'resigned' ? 'RE-SIGNED' : decision === 'walking' ? 'LETTING WALK' : 'PENDING';

        return (
          <div key={player.id} style={{ borderBottom: '1px solid #0d0d0d' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#ddd', fontWeight: 600, fontSize: 13 }}>{player.first_name} {player.last_name}</span>
                  {trait.short && <span style={{ background: trait.color, color: '#000', fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>{trait.short}</span>}
                </div>
                <span style={{ color: '#444', fontSize: 11 }}>{player.position_label || player.position}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 60 }}>
                <span style={{ color: traj.color, fontSize: 12 }}>{player.age} {traj.label}</span>
                <span style={{ color: ratingColor(player.overall_rating), fontWeight: 700, fontSize: 14 }}>{player.overall_rating}</span>
              </div>
              <div style={{ width: 70, color: trait.color, fontSize: 11, textAlign: 'center', fontWeight: player.dev_trait !== 'Normal' ? 700 : 'normal' }}>
                {player.dev_trait === 'Normal' ? '—' : player.dev_trait}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', width: 100 }}>
                <span style={{ color: '#444', fontSize: 10 }}>Current</span>
                <span style={{ color: '#888', fontSize: 12 }}>{fmtSalary(player.annual_salary)}/yr</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', width: 100 }}>
                <span style={{ color: '#444', fontSize: 10 }}>Asking ~</span>
                <span style={{ color: '#FF8740', fontSize: 12 }}>{fmtSalary(ap)}/yr</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: decisionColor, fontSize: 10, fontWeight: 700 }}>{decisionLabel}</span>
                {decision === 'pending' && (
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
                  </>
                )}
                {decision === 'walking' && (
                  <button onClick={() => setPlayerDecisions(prev => ({ ...prev, [player.id]: 'pending' }))} style={{
                    padding: '3px 9px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                    background: '#141414', border: '1px solid #2a2a2a', color: '#555',
                  }}>Undo</button>
                )}
              </div>
            </div>

            {isResigning && decision === 'pending' && (
              <div style={{ background: '#0a180a', border: '1px solid #1a3a1a', borderRadius: 6, margin: '0 12px 10px', padding: '12px 16px' }}>
                <div style={{ color: '#4caf50', fontSize: 11, fontWeight: 700, marginBottom: 10 }}>
                  RE-SIGN OFFER — {player.first_name} {player.last_name}
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>YEARS</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1,2,3,4,5].map(y => (
                        <button key={y} onClick={() => setResignYears(y)} style={{ width: 32, height: 32, background: resignYears === y ? '#4caf50' : '#141414', border: `1px solid ${resignYears === y ? '#4caf50' : '#2a2a2a'}`, borderRadius: 4, color: resignYears === y ? '#000' : '#555', fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}>{y}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>ANNUAL SALARY (M)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#555', fontSize: 13 }}>$</span>
                      <input type="number" value={resignSalary} onChange={e => setResignSalary(e.target.value)} min="0.9" step="0.5"
                        style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80 }} />
                      <span style={{ color: '#555', fontSize: 13 }}>M</span>
                    </div>
                    <div style={{ color: '#333', fontSize: 10, marginTop: 4 }}>Asking: ~{fmtSalary(ap)}/yr</div>
                  </div>
                  <div>
                    <div style={{ color: '#333', fontSize: 10, marginBottom: 6 }}>CAP AFTER SIGNING</div>
                    <div style={{ color: resignCapLeft < 0 ? '#e57373' : '#4caf50', fontSize: 13 }}>{fmtSalary(resignCapLeft)} remaining</div>
                  </div>
                </div>
                <button onClick={handleResign} disabled={working || resignCapLeft < 0} style={{ marginTop: 10, padding: '6px 16px', background: resignCapLeft < 0 ? '#1a1a1a' : '#0a1a0a', border: `1px solid ${resignCapLeft < 0 ? '#2a2a2a' : '#4caf50'}`, borderRadius: 4, color: resignCapLeft < 0 ? '#333' : '#4caf50', fontSize: 12, cursor: resignCapLeft < 0 ? 'not-allowed' : 'pointer' }}>
                  {working ? '...' : resignCapLeft < 0 ? 'OVER CAP' : 'Confirm Re-Sign'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {expiringPlayers.length > 0 && (
        <div style={{ color: '#333', fontSize: 11, padding: '12px 0', borderBottom: '1px solid #1a1a1a', marginBottom: 24 }}>
          Once you've made your decisions, advance the season from the main menu. Players marked "Letting Walk" will automatically become free agents when the season advances.
        </div>
      )}

      <div style={{ background: '#0d0d14', border: '1px solid #1a1a2a', borderRadius: 8, padding: '16px 20px' }}>
        <div style={{ color: '#4FC3F7', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
          CPU FREE AGENCY
        </div>
        <div style={{ color: '#444', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
          Run CPU free agency to let the other 31 teams fill their roster gaps.
          CPU teams also automatically re-sign their own key players when you advance the season.
          <br />
          <span style={{ color: '#333' }}>Best done after you've finished your own FA signings.</span>
        </div>

        {cpuFaDone && cpuFaResult ? (
          <div style={{ background: '#080e18', border: '1px solid #1a3a5a', borderRadius: 6, padding: '12px 16px', marginBottom: 14 }}>
            <div style={{ color: '#4FC3F7', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              ✓ CPU Free Agency Complete
            </div>
            <div style={{ color: '#888', fontSize: 12 }}>
              <span style={{ color: '#fff', fontWeight: 600 }}>{cpuFaResult.totalSigned}</span> players signed across{' '}
              <span style={{ color: '#fff', fontWeight: 600 }}>{cpuFaResult.teamsActive}</span> teams.
            </div>
            <button
              onClick={() => { setCpuFaDone(false); setCpuFaResult(null); }}
              style={{ marginTop: 10, padding: '4px 12px', background: 'transparent', border: '1px solid #2a2a3a', borderRadius: 4, color: '#444', fontSize: 11, cursor: 'pointer' }}>
              Run Again
            </button>
          </div>
        ) : (
          <button
            onClick={handleCpuFa}
            disabled={working}
            style={{
              padding: '8px 20px', fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
              cursor: working ? 'not-allowed' : 'pointer', borderRadius: 5,
              background: working ? '#141420' : '#0a1020',
              border: `1px solid ${working ? '#2a2a3a' : '#4FC3F7'}`,
              color: working ? '#333' : '#4FC3F7',
            }}>
            {working ? 'Running...' : 'RUN CPU FREE AGENCY'}
          </button>
        )}
      </div>
    </div>
  );
}
