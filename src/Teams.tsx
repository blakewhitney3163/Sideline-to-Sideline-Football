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
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  age: number;
  speed: number;
  strength: number;
  awareness: number;
}

interface PlayerStats {
  games: number;
  pass_attempts: number; completions: number; pass_yards: number; pass_tds: number; interceptions: number;
  rush_attempts: number; rush_yards: number; rush_tds: number;
  targets: number; receptions: number; rec_yards: number; rec_tds: number;
}

const POSITION_ORDER = [
  'QB', 'HB', 'FB',
  'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT',
  'LE', 'RE', 'DT', 'IDL',
  'MLB', 'OLB', 'LOLB', 'ROLB', 'WILL', 'MIKE',
  'CB', 'FS', 'SS',
  'K',
];

function getOvrColor(ovr: number): string {
  if (ovr >= 90) return '#FFD700';
  if (ovr >= 80) return '#4FC3F7';
  if (ovr >= 70) return '#81C784';
  return '#aaa';
}

function StatBox({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ background: '#12122a', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
      <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '18px' }}>{value ?? '—'}</div>
      <div style={{ color: '#aaa', fontSize: '11px', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

export default function Teams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<string>('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    window.api.getTeams().then((data: Team[]) => setTeams(data));
  }, []);

  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team);
    setSelectedPlayer(null);
    setSelectedPosition('');
    window.api.getRoster(team.id).then((data: Player[]) => {
      setRoster(data);
      const positions = getAvailablePositions(data);
      if (positions.length > 0) setSelectedPosition(positions[0]);
    });
  };

  const handleSelectPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setPlayerStats(null);
    window.api.getPlayerStats(player.id).then((stats: PlayerStats) => setPlayerStats(stats));
  };

  const getAvailablePositions = (players: Player[]) => {
    const posSet = new Set(players.map(p => p.position_label || p.position));
    return POSITION_ORDER.filter(p => posSet.has(p));
  };

  const availablePositions = getAvailablePositions(roster);
  const filteredPlayers = roster
    .filter(p => (p.position_label || p.position) === selectedPosition)
    .sort((a, b) => b.overall_rating - a.overall_rating);

  const conferences = ['AFC', 'NFC'];

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 90px)' }}>

      {/* Team list */}
      <div style={{ width: '200px', background: '#0f0f23', borderRight: '1px solid #333', overflowY: 'auto', flexShrink: 0 }}>
        {conferences.map(conf => (
          <div key={conf}>
            <div style={{ padding: '10px 14px', color: '#FF8740', fontWeight: 'bold', fontSize: '12px', borderBottom: '1px solid #222' }}>
              {conf}
            </div>
            {teams.filter(t => t.conference === conf).map(team => (
              <div
                key={team.id}
                onClick={() => handleSelectTeam(team)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  color: selectedTeam?.id === team.id ? '#4FC3F7' : '#ccc',
                  background: selectedTeam?.id === team.id ? '#1a1a3e' : 'transparent',
                  borderBottom: '1px solid #1a1a1a', fontSize: '13px',
                }}
              >
                {team.city} {team.name}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Main content */}
      {!selectedTeam ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
          <p style={{ fontSize: '18px' }}>Select a team to view their roster</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Team header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #333', flexShrink: 0 }}>
            <h2 style={{ color: '#4FC3F7', margin: 0 }}>{selectedTeam.city} {selectedTeam.name}</h2>
            <p style={{ color: '#aaa', margin: '2px 0 0', fontSize: '13px' }}>{selectedTeam.conference} — {selectedTeam.division}</p>
          </div>

          {/* Position filter */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #222', display: 'flex', flexWrap: 'wrap', gap: '6px', flexShrink: 0 }}>
            {availablePositions.map(pos => (
              <button
                key={pos}
                onClick={() => { setSelectedPosition(pos); setSelectedPlayer(null); }}
                style={{
                  padding: '4px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                  background: selectedPosition === pos ? '#4FC3F7' : '#1a1a3e',
                  color: selectedPosition === pos ? '#000' : '#aaa',
                  fontWeight: selectedPosition === pos ? 'bold' : 'normal',
                  fontSize: '12px',
                }}
              >
                {pos}
              </button>
            ))}
          </div>

          {/* Player list + profile */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* Player list */}
            <div style={{ width: selectedPlayer ? '300px' : '100%', flexShrink: 0, overflowY: 'auto', borderRight: selectedPlayer ? '1px solid #333' : 'none' }}>
              {filteredPlayers.map((player, i) => (
                <div
                  key={player.id}
                  onClick={() => handleSelectPlayer(player)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '11px 20px',
                    borderBottom: '1px solid #1a1a1a', cursor: 'pointer',
                    background: selectedPlayer?.id === player.id ? '#1a1a3e' : 'transparent',
                  }}
                >
                  <span style={{ color: '#444', width: '22px', fontSize: '12px', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ flex: 1, color: i === 0 ? '#fff' : '#ccc', fontSize: '14px' }}>
                    {player.first_name} {player.last_name}
                  </span>
                  <span style={{ color: '#555', fontSize: '12px', marginRight: '12px' }}>Age {player.age}</span>
                  <span style={{ fontWeight: 'bold', color: getOvrColor(player.overall_rating), fontSize: '15px', width: '30px', textAlign: 'right' }}>
                    {player.overall_rating}
                  </span>
                </div>
              ))}
            </div>

            {/* Player profile panel */}
            {selectedPlayer && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#0a0a1a' }}>
                <button
                  onClick={() => setSelectedPlayer(null)}
                  style={{ float: 'right', background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}
                >
                  ✕
                </button>

                {/* Name + position */}
                <div style={{ marginBottom: '20px' }}>
                  <h2 style={{ color: '#fff', margin: '0 0 6px' }}>
                    {selectedPlayer.first_name} {selectedPlayer.last_name}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ background: '#FF8740', color: '#000', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px' }}>
                      {selectedPlayer.position_label || selectedPlayer.position}
                    </span>
                    <span style={{ color: '#aaa', fontSize: '13px' }}>Age {selectedPlayer.age}</span>
                    <span style={{ color: getOvrColor(selectedPlayer.overall_rating), fontWeight: 'bold', fontSize: '22px' }}>
                      {selectedPlayer.overall_rating} OVR
                    </span>
                  </div>
                </div>

                {/* Attributes */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ color: '#666', fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Attributes</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    {[
                      { label: 'Speed', value: selectedPlayer.speed },
                      { label: 'Strength', value: selectedPlayer.strength },
                      { label: 'Awareness', value: selectedPlayer.awareness },
                    ].map(attr => (
                      <div key={attr.label} style={{ background: '#12122a', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                        <div style={{ color: getOvrColor(attr.value), fontWeight: 'bold', fontSize: '20px' }}>{attr.value}</div>
                        <div style={{ color: '#aaa', fontSize: '11px', marginTop: '2px' }}>{attr.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Season stats */}
                <div>
                  <div style={{ color: '#666', fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>2025 Season Stats</div>
                  {!playerStats ? (
                    <div style={{ color: '#555', fontSize: '13px' }}>Loading...</div>
                  ) : playerStats.games === 0 ? (
                    <div style={{ color: '#555', fontSize: '13px' }}>No stats recorded this season</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {selectedPlayer.position === 'QB' && <>
                        <StatBox label="Games" value={playerStats.games} />
                        <StatBox label="Pass Yards" value={playerStats.pass_yards} />
                        <StatBox label="Touchdowns" value={playerStats.pass_tds} />
                        <StatBox label="Interceptions" value={playerStats.interceptions} />
                        <StatBox label="Completions" value={`${playerStats.completions}/${playerStats.pass_attempts}`} />
                        <StatBox label="Comp %" value={playerStats.pass_attempts > 0 ? `${Math.round((playerStats.completions / playerStats.pass_attempts) * 100)}%` : '—'} />
                      </>}
                      {selectedPlayer.position === 'RB' && <>
                        <StatBox label="Games" value={playerStats.games} />
                        <StatBox label="Rush Yards" value={playerStats.rush_yards} />
                        <StatBox label="Rush TDs" value={playerStats.rush_tds} />
                        <StatBox label="Yds/Carry" value={playerStats.rush_attempts > 0 ? (playerStats.rush_yards / playerStats.rush_attempts).toFixed(1) : '—'} />
                        <StatBox label="Receptions" value={playerStats.receptions} />
                        <StatBox label="Rec Yards" value={playerStats.rec_yards} />
                      </>}
                      {(selectedPlayer.position === 'WR' || selectedPlayer.position === 'TE') && <>
                        <StatBox label="Games" value={playerStats.games} />
                        <StatBox label="Receptions" value={playerStats.receptions} />
                        <StatBox label="Rec Yards" value={playerStats.rec_yards} />
                        <StatBox label="Touchdowns" value={playerStats.rec_tds} />
                        <StatBox label="Targets" value={playerStats.targets} />
                        <StatBox label="Catch %" value={playerStats.targets > 0 ? `${Math.round((playerStats.receptions / playerStats.targets) * 100)}%` : '—'} />
                      </>}
                      {!['QB', 'RB', 'WR', 'TE'].includes(selectedPlayer.position) && (
                        <div style={{ gridColumn: '1/-1', color: '#555', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>
                          Detailed stats not tracked for this position
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}