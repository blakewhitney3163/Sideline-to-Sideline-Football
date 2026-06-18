import React from 'react';
import { T } from '../theme';
import { PlayoffGame, Champion } from './types';

const ROUNDS = [
  { week: 18, label: 'WILD CARD',               cols: 'repeat(3, 1fr)' },
  { week: 19, label: 'DIVISIONAL',              cols: 'repeat(4, 1fr)' },
  { week: 20, label: 'CONFERENCE CHAMPIONSHIPS', cols: 'repeat(2, 1fr)' },
  { week: 21, label: 'SUPER BOWL',              cols: '1fr' },
];

export default function PlayoffResultsView({
  results, champion,
}: {
  results: PlayoffGame[] | null;
  champion?: Champion;
}) {
  if (!results || results.length === 0) {
    return <div style={{ color: T.textMuted, fontSize: 13 }}>Loading playoff results...</div>;
  }

  return (
    <div>
      {champion && (
        <div style={{
          background: '#1a1200', border: '1px solid #FFD700', borderRadius: 8,
          padding: '16px 20px', marginBottom: 20, textAlign: 'center',
        }}>
          <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1 }}>{champion.season} SUPER BOWL CHAMPION</div>
          <div style={{ color: '#FFD700', fontWeight: 700, fontSize: 22, marginTop: 4 }}>🏆 {champion.team_name}</div>
        </div>
      )}

      {ROUNDS.map(({ week, label, cols }) => {
        const games = results.filter(g => g.week === week);
        if (games.length === 0) return null;
        const isSB = week === 21;
        return (
          <div key={week} style={{ marginBottom: 20 }}>
            <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 10 }}>{label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8 }}>
              {games.map((game, i) => {
                const homeWon = game.home_score > game.away_score;
                return (
                  <div key={i} style={{
                    background: isSB ? '#1a1200' : T.bgCard,
                    border: `1px solid ${isSB ? '#FFD700' : T.borderFaint}`,
                    borderRadius: 6, padding: '10px 12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ color: homeWon ? '#4caf50' : T.textMuted, fontSize: 12, fontWeight: homeWon ? 700 : 400 }}>
                        {homeWon && <span style={{ marginRight: 4 }}>▸</span>}{game.home_team}
                      </span>
                      <span style={{ color: homeWon ? '#4caf50' : T.textMuted, fontWeight: 700, fontFamily: 'monospace' }}>{game.home_score}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: !homeWon ? '#4caf50' : T.textMuted, fontSize: 12, fontWeight: !homeWon ? 700 : 400 }}>
                        {!homeWon && <span style={{ marginRight: 4 }}>▸</span>}{game.away_team}
                      </span>
                      <span style={{ color: !homeWon ? '#4caf50' : T.textMuted, fontWeight: 700, fontFamily: 'monospace' }}>{game.away_score}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
