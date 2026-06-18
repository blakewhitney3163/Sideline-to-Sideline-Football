import React from 'react';
import { T } from '../theme';
import { Matchup, UserTeam } from './types';

const btn = (bg: string, fg: string, disabled: boolean, border = 'none'): React.CSSProperties => ({
  padding: '9px 18px', background: disabled ? T.borderMid : bg, border,
  borderRadius: 5, color: disabled ? T.textMuted : fg, fontWeight: 'bold',
  cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13,
});

const smallBtn = (bg: string, fg: string, disabled: boolean): React.CSSProperties => ({
  padding: '5px 12px', background: disabled ? T.borderMid : bg,
  border: 'none', borderRadius: 4, color: disabled ? T.textMuted : fg,
  fontWeight: 'bold', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12,
});

interface Props {
  currentSeason: number;
  userTeam: UserTeam;
  userRecord: { wins: number; losses: number } | null;
  hasSchedule: boolean;
  allWeeksDone: boolean;
  playoffsComplete: boolean;
  currentWeek: number | null;
  matchups: Matchup[];
  simulating: boolean;
  simulatingGameId: number | null;
  generatingSchedule: boolean;
  simulatingPlayoffs: boolean;
  pendingResigns: number;
  advancing: boolean;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
  retiredPlayers: { name: string; position: string; age: number; ovr: number }[];
  setRetiredPlayers: (v: { name: string; position: string; age: number; ovr: number }[]) => void;
  handleGenerateSchedule: () => void;
  handleSimulateWeek: () => void;
  handleSimulateGame: (id: number) => void;
  handleSimulatePlayoffs: () => void;
  handleAdvance: () => void;
}

export default function SeasonHeader({
  currentSeason, userTeam, userRecord,
  hasSchedule, allWeeksDone, playoffsComplete, currentWeek,
  matchups, simulating, simulatingGameId, generatingSchedule, simulatingPlayoffs,
  pendingResigns, advancing, confirming, setConfirming,
  retiredPlayers, setRetiredPlayers,
  handleGenerateSchedule, handleSimulateWeek, handleSimulateGame,
  handleSimulatePlayoffs, handleAdvance,
}: Props) {
  const subtitle = !hasSchedule
    ? 'No schedule generated yet'
    : allWeeksDone && playoffsComplete
    ? `${currentSeason} season complete`
    : allWeeksDone
    ? 'Regular season complete — playoffs ready'
    : `Week ${currentWeek} of 18 up next`;

  return (
    <>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ color: T.textPrimary, fontSize: 22, fontWeight: 700, margin: 0 }}>{currentSeason} NFL Season</h1>
          <p style={{ color: T.textMuted, fontSize: 12, margin: '3px 0 0' }}>{subtitle}</p>
        </div>
        {userRecord && (
          <div style={{ background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 6, padding: '8px 14px', textAlign: 'center' }}>
            <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 1 }}>{userTeam.name.toUpperCase()}</div>
            <div style={{ color: T.textPrimary, fontWeight: 700, fontSize: 18, fontFamily: 'monospace' }}>
              {userRecord.wins}-{userRecord.losses}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {!hasSchedule && (
          <button onClick={handleGenerateSchedule} disabled={generatingSchedule} style={btn(T.bgGreen, '#4caf50', generatingSchedule)}>
            {generatingSchedule ? 'Generating...' : `▶ Start ${currentSeason} Season`}
          </button>
        )}

        {hasSchedule && currentWeek !== null && (
          <>
            <button
              onClick={() => {
                const nextGame = matchups.find(m => m.is_simulated === 0);
                if (nextGame) handleSimulateGame(nextGame.id);
              }}
              disabled={simulating || simulatingGameId !== null || matchups.every(m => m.is_simulated === 1)}
              style={btn(T.bgGreen, '#4caf50', simulating || simulatingGameId !== null)}
            >
              {simulatingGameId !== null ? 'Simulating...' : '▶ Next Game'}
            </button>
            <button
              onClick={handleSimulateWeek}
              disabled={simulating || simulatingGameId !== null}
              style={btn(T.bgCard, T.textPrimary, simulating || simulatingGameId !== null, `1px solid ${T.borderStrong}`)}
            >
              {simulating ? `Simulating Week ${currentWeek}...` : `▶ Sim Week ${currentWeek}`}
            </button>
          </>
        )}

        {allWeeksDone && !playoffsComplete && (
          <button onClick={handleSimulatePlayoffs} disabled={simulatingPlayoffs} style={btn('#1a0070', '#9B59B6', simulatingPlayoffs)}>
            {simulatingPlayoffs ? 'Simulating Playoffs...' : '▶ Simulate Playoffs'}
          </button>
        )}

        {allWeeksDone && playoffsComplete && !confirming && (
          <button
            onClick={() => setConfirming(true)}
            style={btn(T.bgCard, pendingResigns > 0 ? '#FF8740' : T.textPrimary, false, `1px solid ${T.borderStrong}`)}>
            {pendingResigns > 0 ? `⚠ ${pendingResigns} pending — Advance anyway?` : `Advance to ${currentSeason + 1} →`}
          </button>
        )}

        {confirming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: T.textMuted, fontSize: 12 }}>Ages players + retires veterans. Confirm?</span>
            <button onClick={handleAdvance} disabled={advancing} style={smallBtn(T.bgGreen, '#4caf50', advancing)}>
              {advancing ? 'Advancing...' : 'Confirm'}
            </button>
            <button onClick={() => setConfirming(false)} style={smallBtn(T.bgCard, T.textMuted, false)}>Cancel</button>
          </div>
        )}
      </div>

      {/* Retirements banner */}
      {retiredPlayers.length > 0 && (
        <div style={{ background: '#0a0a14', border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: T.textDim, fontSize: 10, letterSpacing: 1 }}>RETIREMENTS — {currentSeason - 1} OFFSEASON</span>
            <button onClick={() => setRetiredPlayers([])} style={{ fontSize: 10, background: 'none', border: 'none', color: T.textDim, cursor: 'pointer' }}>dismiss</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
            {retiredPlayers.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
                <span style={{ color: T.textDim, fontSize: 10, width: 28 }}>{p.position}</span>
                <span style={{ color: T.textPrimary }}>{p.name}</span>
                <span style={{ color: T.textDim, fontSize: 10 }}>Age {p.age} · {p.ovr} OVR</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
