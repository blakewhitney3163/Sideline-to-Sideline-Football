import React, { useEffect, useState } from 'react';

declare const window: any;

interface TeamRecord {
  team_name: string;
  wins: number;
  losses: number;
}

interface RecentGame {
  week: number;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
}

interface Dashboard {
  topAFC: TeamRecord[];
  topNFC: TeamRecord[];
  recentGames: RecentGame[];
}

interface Champion {
  season: number;
  team_name: string;
  conference: string;
}

interface Props {
  currentSeason: number;
  onSeasonAdvance: (nextSeason: number) => void;
}

export default function Home({ currentSeason, onSeasonAdvance }: Props) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [champions, setChampions] = useState<Champion[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    window.api.getDashboard(currentSeason).then((data: Dashboard) => setDashboard(data));
    window.api.getChampions().then((data: Champion[]) => setChampions(data));
  }, [currentSeason]);

  const handleAdvance = async () => {
    setAdvancing(true);
    const result = await window.api.advanceSeason();
    setAdvancing(false);
    setConfirming(false);
    onSeasonAdvance(result.nextSeason);
  };

  if (!dashboard) {
    return <div style={{ padding: '40px', color: '#aaa' }}>Loading...</div>;
  }

  return (
    <div style={{ padding: '24px' }}>

      {/* Season header + advance button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h2 style={{ color: '#4FC3F7', margin: 0 }}>{currentSeason} Season</h2>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            style={{
              padding: '10px 20px', background: '#FF8740', border: 'none',
              borderRadius: '6px', color: '#000', fontWeight: 'bold',
              cursor: 'pointer', fontSize: '13px',
            }}
          >
            Advance to {currentSeason + 1} Season →
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#aaa', fontSize: '13px' }}>Ages all players, retires veterans. Continue?</span>
            <button
              onClick={handleAdvance}
              disabled={advancing}
              style={{
                padding: '8px 16px', background: '#4CAF50', border: 'none',
                borderRadius: '4px', color: '#000', fontWeight: 'bold',
                cursor: advancing ? 'not-allowed' : 'pointer', fontSize: '13px',
              }}
            >
              {advancing ? 'Advancing...' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              style={{
                padding: '8px 16px', background: '#333', border: 'none',
                borderRadius: '4px', color: '#aaa', cursor: 'pointer', fontSize: '13px',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>

        {/* AFC Leaders */}
        <div style={{ background: '#0f0f23', border: '1px solid #333', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ color: '#FF8740', marginBottom: '12px', fontSize: '14px', letterSpacing: '1px' }}>AFC LEADERS</h3>
          {dashboard.topAFC.map((team, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a1a' }}>
              <span style={{ color: i === 0 ? '#fff' : '#aaa', fontSize: '13px' }}>{team.team_name}</span>
              <span style={{ color: '#4FC3F7', fontSize: '13px', fontWeight: 'bold' }}>{team.wins}-{team.losses}</span>
            </div>
          ))}
        </div>

        {/* NFC Leaders */}
        <div style={{ background: '#0f0f23', border: '1px solid #333', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ color: '#FF8740', marginBottom: '12px', fontSize: '14px', letterSpacing: '1px' }}>NFC LEADERS</h3>
          {dashboard.topNFC.map((team, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1a1a' }}>
              <span style={{ color: i === 0 ? '#fff' : '#aaa', fontSize: '13px' }}>{team.team_name}</span>
              <span style={{ color: '#4FC3F7', fontSize: '13px', fontWeight: 'bold' }}>{team.wins}-{team.losses}</span>
            </div>
          ))}
        </div>

        {/* Recent Scores */}
        <div style={{ background: '#0f0f23', border: '1px solid #333', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ color: '#FF8740', marginBottom: '12px', fontSize: '14px', letterSpacing: '1px' }}>RECENT SCORES</h3>
          {dashboard.recentGames.map((game, i) => {
            const homeWon = game.home_score > game.away_score;
            return (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #1a1a1a', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: homeWon ? '#fff' : '#666' }}>{game.home_team}</span>
                  <span style={{ color: homeWon ? '#4FC3F7' : '#aaa', fontWeight: 'bold' }}>{game.home_score}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: !homeWon ? '#fff' : '#666' }}>{game.away_team}</span>
                  <span style={{ color: !homeWon ? '#4FC3F7' : '#aaa', fontWeight: 'bold' }}>{game.away_score}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Champions History */}
      {champions.length > 0 && (
        <div style={{ background: '#0f0f23', border: '1px solid #333', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ color: '#FF8740', marginBottom: '12px', fontSize: '14px', letterSpacing: '1px' }}>SUPER BOWL CHAMPIONS</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
            {champions.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#12122a', borderRadius: '6px' }}>
                <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '13px' }}>{c.season}</span>
                <span style={{ color: '#fff', fontSize: '13px' }}>{c.team_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}