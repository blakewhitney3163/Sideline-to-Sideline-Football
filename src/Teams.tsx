import React, { useEffect, useState } from 'react';

declare const window: any;

interface Team {
  id: number;
  city: string;
  name: string;
  conference: string;
  division: string;
}

interface Player {
  first_name: string;
  last_name: string;
  position: string;
  overall_rating: number;
  age: number;
  speed: number;
  strength: number;
  awareness: number;
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

function getOvrColor(ovr: number): string {
  if (ovr >= 90) return '#FFD700';
  if (ovr >= 80) return '#4FC3F7';
  if (ovr >= 70) return '#81C784';
  return '#aaa';
}

function getDepthLabel(index: number): string {
  if (index === 0) return 'STARTER';
  if (index === 1) return '2ND';
  return '3RD';
}

export default function Teams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [view, setView] = useState<'depth' | 'roster'>('depth');

  useEffect(() => {
    window.api.getTeams().then((data: Team[]) => setTeams(data));
  }, []);

  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team);
    window.api.getRoster(team.id).then((data: Player[]) => setRoster(data));
  };

  const groupedByPosition = POSITION_ORDER.reduce((acc, pos) => {
    const players = roster
      .filter(p => p.position === pos)
      .sort((a, b) => b.overall_rating - a.overall_rating);
    if (players.length > 0) acc[pos] = players;
    return acc;
  }, {} as Record<string, Player[]>);

  const conferences = ['AFC', 'NFC'];

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 90px)' }}>

      {/* Left panel — team list */}
      <div style={{ width: '220px', background: '#0f0f23', borderRight: '1px solid #333', overflowY: 'auto' }}>
        {conferences.map(conf => (
          <div key={conf}>
            <div style={{ padding: '10px 14px', color: '#FF8740', fontWeight: 'bold', fontSize: '12px', borderBottom: '1px solid #222' }}>
              {conf}
            </div>
            {teams
              .filter(t => t.conference === conf)
              .map(team => (
                <div
                  key={team.id}
                  onClick={() => handleSelectTeam(team)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    color: selectedTeam?.id === team.id ? '#4FC3F7' : '#ccc',
                    background: selectedTeam?.id === team.id ? '#1a1a3e' : 'transparent',
                    borderBottom: '1px solid #1a1a1a',
                    fontSize: '13px',
                  }}
                >
                  {team.city} {team.name}
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {!selectedTeam ? (
          <div style={{ color: '#aaa', textAlign: 'center', marginTop: '60px' }}>
            <p style={{ fontSize: '18px' }}>Select a team to view their roster</p>
          </div>
        ) : (
          <>
            {/* Header + toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ color: '#4FC3F7', marginBottom: '4px' }}>
                  {selectedTeam.city} {selectedTeam.name}
                </h2>
                <p style={{ color: '#aaa', margin: 0 }}>
                  {selectedTeam.conference} — {selectedTeam.division}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['depth', 'roster'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer',
                      background: view === v ? '#4FC3F7' : '#1a1a3e',
                      color: view === v ? '#000' : '#aaa',
                      fontWeight: view === v ? 'bold' : 'normal',
                      fontSize: '13px',
                    }}
                  >
                    {v === 'depth' ? 'Depth Chart' : 'Full Roster'}
                  </button>
                ))}
              </div>
            </div>

            {view === 'depth' ? (
              /* Depth Chart — 2-column grid of position cards */
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {Object.entries(groupedByPosition).map(([pos, players]) => (
                  <div key={pos} style={{ background: '#0f0f23', borderRadius: '8px', padding: '12px', border: '1px solid #222' }}>
                    <div style={{ color: '#FF8740', fontWeight: 'bold', fontSize: '13px', marginBottom: '10px', borderBottom: '1px solid #222', paddingBottom: '6px' }}>
                      {pos}
                    </div>
                    {players.slice(0, 4).map((player, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', borderBottom: i < Math.min(players.length, 4) - 1 ? '1px solid #1a1a1a' : 'none' }}>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: i === 0 ? '#FFD700' : '#555', width: '48px', flexShrink: 0 }}>
                          {getDepthLabel(i)}
                        </span>
                        <span style={{ color: i === 0 ? '#fff' : '#aaa', flex: 1, fontSize: '13px' }}>
                          {player.first_name} {player.last_name}
                        </span>
                        <span style={{ fontWeight: 'bold', fontSize: '13px', color: getOvrColor(player.overall_rating), width: '32px', textAlign: 'right' }}>
                          {player.overall_rating}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              /* Full Roster Table */
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#aaa', textAlign: 'left', borderBottom: '1px solid #333' }}>
                    <th style={{ padding: '8px' }}>Name</th>
                    <th style={{ padding: '8px' }}>POS</th>
                    <th style={{ padding: '8px' }}>OVR</th>
                    <th style={{ padding: '8px' }}>Age</th>
                    <th style={{ padding: '8px' }}>SPD</th>
                    <th style={{ padding: '8px' }}>STR</th>
                    <th style={{ padding: '8px' }}>AWR</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((player, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ padding: '8px', color: '#fff' }}>{player.first_name} {player.last_name}</td>
                      <td style={{ padding: '8px', color: '#FF8740' }}>{player.position}</td>
                      <td style={{ padding: '8px', color: getOvrColor(player.overall_rating), fontWeight: 'bold' }}>{player.overall_rating}</td>
                      <td style={{ padding: '8px', color: '#aaa' }}>{player.age}</td>
                      <td style={{ padding: '8px', color: '#aaa' }}>{player.speed}</td>
                      <td style={{ padding: '8px', color: '#aaa' }}>{player.strength}</td>
                      <td style={{ padding: '8px', color: '#aaa' }}>{player.awareness}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}