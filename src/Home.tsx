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

export default function Home() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  useEffect(() => {
    window.api.getDashboard(2024).then((data: Dashboard) => setDashboard(data));
  }, []);

  if (!dashboard) {
    return <div style={{ padding: '40px', color: '#aaa' }}>Loading...</div>;
  }

  return (
    <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>

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
  );
}