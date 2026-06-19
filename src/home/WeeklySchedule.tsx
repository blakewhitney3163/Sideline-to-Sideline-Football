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
  onDismissAlert: (v: string | null) => void;
  onSimulateWeek?: () => void;
  onViewWeek: (week: number) => void;
  onSimulateGame: (gameId: number) => void;
  onBoxScore: (gameId: number) => void;
}

export default function WeeklySchedule({
  viewWeek, matchups, boxScore, boxScoreLoading,
  simulating, simulatingGameId, userTeam,
  psAlert, onDismissAlert,
  onViewWeek, onSimulateGame, onBoxScore,
}: Props) {
  const weekIsPlayed = matchups.length > 0 && matchups.every(m => m.is_simulated === 1);

  return (
    <>
      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <button
          onClick={() => onViewWeek(viewWeek - 1)}
          disabled={viewWeek <= 1}
          style={{
            padding: '4px 12px', background: T.bgPanel, border: `1px solid ${T.borderMid}`,
            borderRadius: 4, color: viewWeek <= 1 ? T.borderStrong : T.textMuted,
            cursor: viewWeek <= 1 ? 'not-allowed' : 'pointer', fontSize: 12,
          }}>←</button>
        <span style={{ color: '#ccc', fontSize: 13, fontWeight: 700, flex: 1, textAlign: 'center' }}>
          WEEK {viewWeek}
        </span>
        <button
          onClick={() => onViewWeek(viewWeek + 1)}
          disabled={viewWeek >= 18}
          style={{
            padding: '4px 12px', background: T.bgPanel, border: `1px solid ${T.borderMid}`,
            borderRadius: 4, color: viewWeek >= 18 ? T.borderStrong : T.textMuted,
            cursor: viewWeek >= 18 ? 'not-allowed' : 'pointer', fontSize: 12,
          }}>→</button>
        {matchups.length > 0 && (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 3, letterSpacing: 0.5,
            background: weekIsPlayed ? '#0a1a0a' : '#1a1400',
            color: weekIsPlayed ? '#4caf50' : '#FFD700',
            border: `1px solid ${weekIsPlayed ? '#2a4a2a' : '#3a3000'}`,
          }}>
            ● {weekIsPlayed ? 'FINAL' : 'UPCOMING'}
          </span>
        )}
      </div>

      {/* PS Alert */}
      {psAlert && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: '#1a1400', border: '1px solid #3a3000', borderRadius: 5, marginBottom: 10,
        }}>
          <span style={{ color: '#FFD700', fontSize: 12 }}>⚠ {psAlert}</span>
          <button onClick={() => onDismissAlert(null)} style={{
            background: 'none', border: 'none', color: T.textDim, cursor: 'pointer',
            fontSize: 16, lineHeight: 1, marginLeft: 'auto',
          }}>✕</button>
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
              background: isUserGame ? '#0d1a0d' : T.bgPanel,
              border: `1px solid ${isUserGame ? '#1a3a1a' : T.borderFaint}`,
              borderRadius: 5, overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 8 }}>
                {/* Teams */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {homeWon && <span style={{ color: '#4caf50', fontSize: 9 }}>▸</span>}
                    <span style={{ color: homeWon ? '#ccc' : '#888', fontSize: 12 }}>{game.home_team}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {awayWon && <span style={{ color: '#4caf50', fontSize: 9 }}>▸</span>}
                    <span style={{ color: awayWon ? '#ccc' : '#888', fontSize: 12 }}>{game.away_team}</span>
                  </div>
                </div>

                {/* Score or controls */}
                {played ? (
                  <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    <div style={{ color: homeWon ? '#fff' : '#555', fontSize: 13, fontWeight: homeWon ? 700 : 400 }}>{game.home_score}</div>
                    <div style={{ color: awayWon ? '#fff' : '#555', fontSize: 13, fontWeight: awayWon ? 700 : 400 }}>{game.away_score}</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 9, color: isUserGame ? '#4caf50' : T.textDim,
                      border: `1px solid ${isUserGame ? '#2a4a2a' : T.borderFaint}`,
                      borderRadius: 3, padding: '1px 5px', letterSpacing: 0.5,
                    }}>
                      {isUserGame ? '◆ YOUR GAME' : 'PREVIEW'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onSimulateGame(game.id); }}
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
                  onClick={() => onBoxScore(game.id)}
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
        <div style={{ marginTop: 8 }}>
          {boxScoreLoading
            ? <div style={{ color: T.textMuted, fontSize: 11, padding: 8 }}>Loading box score...</div>
            : boxScore ? <BoxScore data={boxScore} /> : null}
        </div>
      )}
    </>
  );
}
