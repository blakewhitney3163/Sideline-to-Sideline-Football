import React, { useState } from 'react';

declare const window: any;

interface PreseasonGame {
  id: number;
  week: number;
  home_team_id: number;
  away_team_id: number;
  home_city: string; home_name: string; home_abbr: string;
  away_city: string; away_name: string; away_abbr: string;
  home_score: number;
  away_score: number;
  is_simulated: number;
}

interface PreseasonStatus {
  generated: boolean;
  done: boolean;
  weeksDone: number[];
  games: PreseasonGame[];
}

interface Props {
  status: PreseasonStatus;
  userTeamId: number | null;
  currentSeason: number;
  onStatusChange: (s: PreseasonStatus) => void;
  onStartSeason: () => void;
}

export default function PreseasonPanel({ status, userTeamId, currentSeason, onStatusChange, onStartSeason }: Props) {
  const [generating, setGenerating] = useState(false);
  const [simming, setSimming] = useState<number | null>(null); // week or -1 for single game
  const [startingSeason, setStartingSeason] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    await window.seasonApi.generatePreseason(currentSeason);
    const fresh = await window.seasonApi.getPreseasonStatus(currentSeason);
    onStatusChange(fresh);
    setGenerating(false);
  };

  const handleSimWeek = async (week: number) => {
    setSimming(week);
    await window.seasonApi.simulatePreseasonWeek(week, currentSeason);
    const fresh = await window.seasonApi.getPreseasonStatus(currentSeason);
    onStatusChange(fresh);
    setSimming(null);
  };

  const handleSimGame = async (gameId: number) => {
    setSimming(-1);
    await window.seasonApi.simulatePreseasonGame(gameId);
    const fresh = await window.seasonApi.getPreseasonStatus(currentSeason);
    onStatusChange(fresh);
    setSimming(null);
  };

  const handleStartSeason = async () => {
    setStartingSeason(true);
    onStartSeason();
  };

  if (!status.generated) {
    return (
      <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 8, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 9, letterSpacing: 2, color: '#555', marginBottom: 8 }}>PRESEASON</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
          Play 4 weeks of preseason games before starting the regular season.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: '9px 20px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: '#FF8740', color: '#000', border: 'none', borderRadius: 4,
            }}
          >
            {generating ? 'Generating...' : 'Generate Preseason Schedule'}
          </button>
          <button
            onClick={onStartSeason}
            style={{
              padding: '9px 16px', fontSize: 11, cursor: 'pointer',
              background: 'transparent', color: '#444', border: '1px solid #2a2a2a', borderRadius: 4,
            }}
          >
            Skip Preseason
          </button>
        </div>
      </div>
    );
  }

  const gamesByWeek = [1, 2, 3, 4].map(w => ({
    week: w,
    games: status.games.filter(g => g.week === w),
    done: status.weeksDone.includes(w),
  }));

  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 8, padding: '20px 24px', marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: '#555', marginBottom: 3 }}>PRESEASON — {currentSeason}</div>
          <div style={{ fontSize: 11, color: '#444' }}>
            {status.weeksDone.length} / 4 weeks complete
          </div>
        </div>
        {status.done && (
          <button
            onClick={handleStartSeason}
            disabled={startingSeason}
            style={{
              padding: '9px 20px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: '#4caf50', color: '#000', border: 'none', borderRadius: 4,
            }}
          >
            {startingSeason ? 'Starting...' : '▶ Start Regular Season'}
          </button>
        )}
      </div>

      {/* Week progress dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
        {[1,2,3,4].map(w => {
          const done = status.weeksDone.includes(w);
          const active = !done && status.weeksDone.length === w - 1;
          return (
            <React.Fragment key={w}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                background: done ? '#4caf50' : active ? '#FF8740' : '#1a1a1a',
                border: `2px solid ${done ? '#4caf50' : active ? '#FF8740' : '#2a2a2a'}`,
                color: done || active ? '#000' : '#444',
                boxShadow: active ? '0 0 8px #FF874055' : 'none',
              }}>
                {done ? '✓' : w}
              </div>
              {w < 4 && <div style={{ flex: 1, height: 2, background: done ? '#4caf5066' : '#1a1a1a', maxWidth: 40 }} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Week blocks */}
      {gamesByWeek.map(({ week, games, done }) => {
        const userGame = games.find(g => g.home_team_id === userTeamId || g.away_team_id === userTeamId);
        const isActive = !done && status.weeksDone.length === week - 1;
        const pending = games.filter(g => !g.is_simulated).length;
        const isSimming = simming === week;

        return (
          <div key={week} style={{
            marginBottom: 10, padding: '10px 14px',
            background: done ? '#080f08' : isActive ? '#0e0a06' : '#090909',
            border: `1px solid ${done ? '#4caf5033' : isActive ? '#FF874033' : '#151515'}`,
            borderRadius: 6, opacity: (!done && !isActive) ? 0.5 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: userGame && isActive ? 8 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: done ? '#4caf50' : isActive ? '#FF8740' : '#444' }}>
                  PRESEASON WEEK {week}
                </span>
                <span style={{ fontSize: 9, color: '#333' }}>
                  {done ? `✓ All ${games.length} games complete` : `${pending} / ${games.length} remaining`}
                </span>
              </div>
              {isActive && (
                <button
                  onClick={() => handleSimWeek(week)}
                  disabled={!!simming}
                  style={{
                    padding: '4px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    background: simming ? '#141414' : '#1a2a1a',
                    border: `1px solid ${simming ? '#333' : '#4caf5055'}`,
                    borderRadius: 3, color: simming ? '#444' : '#4caf50',
                  }}
                >
                  {isSimming ? 'Simming...' : 'Sim Week'}
                </button>
              )}
            </div>

            {/* User's game highlight */}
            {userGame && isActive && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#0a1400', border: '1px solid #FF874033', borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: '#ddd' }}>
                  <span style={{ color: '#FF8740', fontWeight: 700 }}>{userGame.away_abbr}</span>
                  <span style={{ color: '#555', margin: '0 6px' }}>@</span>
                  <span style={{ color: '#FF8740', fontWeight: 700 }}>{userGame.home_abbr}</span>
                  <span style={{ fontSize: 9, color: '#555', marginLeft: 8 }}>YOUR GAME</span>
                </div>
                {!userGame.is_simulated ? (
                  <button
                    onClick={() => handleSimGame(userGame.id)}
                    disabled={!!simming}
                    style={{
                      padding: '4px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      background: '#FF8740', color: '#000', border: 'none', borderRadius: 3,
                    }}
                  >
                    ▶ Play
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: '#4caf50' }}>
                    {userGame.home_score} – {userGame.away_score}
                  </span>
                )}
              </div>
            )}

            {/* Completed game results */}
            {done && userGame && (
              <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>
                Your game: {userGame.away_abbr} {userGame.away_score} @ {userGame.home_abbr} {userGame.home_score}
              </div>
            )}
          </div>
        );
      })}

      {!status.done && (
        <button
          onClick={onStartSeason}
          style={{
            marginTop: 8, padding: '6px 14px', fontSize: 10, cursor: 'pointer',
            background: 'transparent', color: '#333', border: '1px solid #1a1a1a', borderRadius: 4,
          }}
        >
          Skip remaining preseason →
        </button>
      )}
    </div>
  );
}
