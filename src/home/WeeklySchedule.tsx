import React from 'react';
import { T } from '../theme';
import { Matchup, BoxScoreData, UserTeam } from './types';
import BoxScore from './BoxScore';

interface Props {
  viewWeek: number;
  matchups: Matchup[];
  boxScore: BoxScoreData | null;
  boxScoreLoading: boolean;
  simulating: boolean;
  simulatingGameId: number | null;
  userTeam: UserTeam;
  psAlert: string | null;
  setPSAlert: (v: string | null) => void;
  handleViewWeek: (week: number) => void;
  handleSimulateGame: (gameId: number) => void;
  handleBoxScore: (gameId: number) => void;
}

export default function WeeklySchedule({
  viewWeek, matchups, boxScore, boxScoreLoading,
  simulating, simulatingGameId, userTeam,
  psAlert, setPSAlert,
  handleViewWeek, handleSimulateGame, handleBoxScore,
}: Props) {
  const weekIsPlayed = matchups.length > 0 && matchups.every(m => m.is_simulated === 1);

  return (
    <>
      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => handleViewWeek(viewWeek - 1)}
          disabled={viewWeek <= 1}
          style={{
            padding: '4px 12px', background: T.bgPanel, border: `1px solid ${T.borderMid}`,
            borderRadius: 4, color: viewWeek <= 1 ? T.borderStrong : T.textMuted,
            cursor: viewWeek <= 1 ? 'not-allowed' : 'pointer', fontSize: 12,
          }}>←</button>
        <span style={{ color: T.textPrimary, fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>WEEK {viewWeek}</span>
        <button
          onClick={() => handleViewWeek(viewWeek + 1)}
          disabled={viewWeek >= 18}
          style={{
            padding: '4px 12px', background: T.bgPanel, border: `1px solid ${T.borderMid}`,
            borderRadius: 4, color: viewWeek >= 18 ? T.borderStrong : T.textMuted,
            cursor: viewWeek >= 18 ? 'not-allowed' : 'pointer', fontSize: 12,
          }}>→</button>
        {matchups.length > 0 && (
          <span style={{ color: weekIsPlayed ? T.textMuted : '#FF8740', fontSize: 10, letterSpacing: 1, marginLeft: 4 }}>
            ● {weekIsPlayed ? 'FINAL' : 'UPCOMING'}
          </span>
        )}
      </div>

      {/* PS Alert */}
      {psAlert && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#1a1000', border: '1px solid #FF8740', borderRadius: 6,
          padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#FF8740',
        }}>
          <span>⚠ {psAlert}</span>
          <button onClick={() => setPSAlert(null)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* Matchup list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {matchups.map(game => {
          const played = game.is_simulated === 1;
          const homeWon = played && (game.home_score ?? 0) > (game.away_score ?? 0);
          const awayWon = played && (game.away_score ?? 0) > (game.home_score ?? 0);
          const expanded = boxScore?.game?.id === game.id;
          const isUserGame = game.home_team_id === userTeam.id || game.away_team_id === userTeam.id;

          return (
            <div key={game.id} style={{
              background: T.bgCard, border: `1px solid ${isUserGame && !played ? '#1a3a1a' : T.borderFaint}`,
              borderRadius: 6, overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 8 }}>
                {/* Teams */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {homeWon && <span style={{ color: '#4caf50', fontSize: 10 }}>▸</span>}
                    <span style={{ color: homeWon ? '#4caf50' : T.textPrimary, fontWeight: homeWon ? 700 : 400, fontSize: 13 }}>{game.home_team}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {awayWon && <span style={{ color: '#4caf50', fontSize: 10 }}>▸</span>}
                    <span style={{ color: awayWon ? '#4caf50' : T.textPrimary, fontWeight: awayWon ? 700 : 400, fontSize: 13 }}>{game.away_team}</span>
                  </div>
                </div>

                {/* Score or controls */}
                {played ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ color: homeWon ? '#4caf50' : T.textMuted, fontWeight: 700, fontSize: 16, fontFamily: 'monospace' }}>{game.home_score}</span>
                    <span style={{ color: awayWon ? '#4caf50' : T.textMuted, fontWeight: 700, fontSize: 16, fontFamily: 'monospace' }}>{game.away_score}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ color: isUserGame ? '#4caf50' : T.textDim, fontSize: 9, letterSpacing: 0.5 }}>
                      {isUserGame ? '◆ YOUR GAME' : 'PREVIEW'}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); handleSimulateGame(game.id); }}
                      disabled={simulatingGameId !== null || simulating}
                      style={{
                        padding: '2px 8px', fontSize: 9,
                        background: simulatingGameId === game.id ? '#1a2a1a' : T.bgGreen,
                        color: simulatingGameId === game.id ? '#81C784' : '#4caf50',
                        border: `1px solid ${T.borderFaint}`, borderRadius: 3,
                        cursor: simulatingGameId !== null || simulating ? 'not-allowed' : 'pointer',
                        fontFamily: 'monospace',
                      }}>
                      {simulatingGameId === game.id ? '...' : '▶ Sim'}
                    </button>
                  </div>
                )}
              </div>

              {played && (
                <button
                  onClick={() => handleBoxScore(game.id)}
                  style={{
                    width: '100%', padding: '3px 0',
                    background: expanded ? T.bgGreen : T.bgPage,
                    border: 'none', borderTop: `1px solid ${expanded ? '#1a381a' : T.bgInput}`,
                    color: expanded ? '#4caf50' : T.borderStrong,
                    cursor: 'pointer', fontSize: 9, letterSpacing: 0.5,
                  }}>
                  {expanded ? '▲ BOX SCORE' : '▼ BOX SCORE'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Box score expansion */}
      {(boxScore || boxScoreLoading) && (
        <div style={{ marginTop: 12 }}>
          {boxScoreLoading
            ? <div style={{ color: T.textMuted, fontSize: 12 }}>Loading box score...</div>
            : boxScore ? <BoxScore data={boxScore} /> : null}
        </div>
      )}
    </>
  );
}
