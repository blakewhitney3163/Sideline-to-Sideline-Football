import React, { useEffect, useState } from 'react';
import { T } from './theme';

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
  tackles: number; assisted_tackles: number; sacks: number; tfl: number;
  def_interceptions: number; pass_deflections: number; forced_fumbles: number;
}

interface CareerSeasonStats extends PlayerStats {
  season: number;
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

const OFF_POSITIONS = ['QB', 'RB', 'HB', 'FB', 'WR', 'TE'];
const DEF_POSITIONS = ['DE', 'DT', 'DL', 'LE', 'RE', 'IDL', 'MLB', 'OLB', 'ILB', 'LOLB', 'ROLB', 'LB', 'WILL', 'MIKE', 'CB', 'FS', 'SS', 'S'];

function getOvrColor(ovr: number): string {
  if (ovr >= 90) return '#FFD700';
  if (ovr >= 80) return '#4FC3F7';
  if (ovr >= 70) return '#81C784';
  return T.textSecondary;
}

function StatBox({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56 }}>
      <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{value ?? '—'}</span>
      <span style={{ color: T.textDim, fontSize: 9, letterSpacing: 0.5, marginTop: 2 }}>{label}</span>
    </div>
  );
}

function SeasonStatsRow({ s, position }: { s: CareerSeasonStats; position: string }) {
  if (DEF_POSITIONS.includes(position)) {
    return (
      <tr key={s.season}>
        <td style={{ padding: '4px 8px', color: T.textSecondary, fontSize: 11 }}>{s.season}</td>
        <td style={{ padding: '4px 8px', color: T.textSecondary, fontSize: 11 }}>{s.games}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{(s.tackles ?? 0) + (s.assisted_tackles ?? 0)}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{Number(s.sacks ?? 0).toFixed(1)}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.tfl ?? 0}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.def_interceptions ?? 0}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.pass_deflections ?? 0}</td>
      </tr>
    );
  }
  if (position === 'QB') {
    return (
      <tr key={s.season}>
        <td style={{ padding: '4px 8px', color: T.textSecondary, fontSize: 11 }}>{s.season}</td>
        <td style={{ padding: '4px 8px', color: T.textSecondary, fontSize: 11 }}>{s.games}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.pass_yards}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.pass_tds}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.interceptions}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>
          {s.pass_attempts > 0 ? `${Math.round((s.completions / s.pass_attempts) * 100)}%` : '—'}
        </td>
      </tr>
    );
  }
  if (position === 'RB') {
    return (
      <tr key={s.season}>
        <td style={{ padding: '4px 8px', color: T.textSecondary, fontSize: 11 }}>{s.season}</td>
        <td style={{ padding: '4px 8px', color: T.textSecondary, fontSize: 11 }}>{s.games}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.rush_yards}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.rush_tds}</td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>
          {s.rush_attempts > 0 ? (s.rush_yards / s.rush_attempts).toFixed(1) : '—'}
        </td>
        <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.receptions} / {s.rec_yards}</td>
      </tr>
    );
  }
  return (
    <tr key={s.season}>
      <td style={{ padding: '4px 8px', color: T.textSecondary, fontSize: 11 }}>{s.season}</td>
      <td style={{ padding: '4px 8px', color: T.textSecondary, fontSize: 11 }}>{s.games}</td>
      <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.rec_yards}</td>
      <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.rec_tds}</td>
      <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>{s.receptions}/{s.targets}</td>
      <td style={{ padding: '4px 8px', color: T.textPrimary, fontSize: 11 }}>
        {s.targets > 0 ? `${Math.round((s.receptions / s.targets) * 100)}%` : '—'}
      </td>
    </tr>
  );
}

export default function Teams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<string>('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [careerStats, setCareerStats] = useState<CareerSeasonStats[]>([]);
  const [statsView, setStatsView] = useState<'season' | 'career'>('season');

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
    setCareerStats([]);
    setStatsView('season');
    window.api.getPlayerStats(player.id).then((stats: PlayerStats) => setPlayerStats(stats));
    window.api.getPlayerCareerStats(player.id).then((stats: CareerSeasonStats[]) => setCareerStats(stats));
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

  const careerHeaders: Record<string, string[]> = {
    QB:  ['Season', 'G', 'YDS', 'TD', 'INT', 'CMP%'],
    RB:  ['Season', 'G', 'YDS', 'TD', 'YPC', 'REC/REYDS'],
    WR:  ['Season', 'G', 'YDS', 'TD', 'REC/TGT', 'CTH%'],
    TE:  ['Season', 'G', 'YDS', 'TD', 'REC/TGT', 'CTH%'],
    DEF: ['Season', 'G', 'TOT TKL', 'SACKS', 'TFL', 'INT', 'PD'],
  };

  const getCareerHeaders = (pos: string) => {
    if (DEF_POSITIONS.includes(pos)) return careerHeaders.DEF;
    return careerHeaders[pos] ?? ['Season', 'G', 'YDS', 'TD', 'REC', 'TGT'];
  };

  const showStats = (pos: string) => OFF_POSITIONS.includes(pos) || DEF_POSITIONS.includes(pos);

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: 'monospace' }}>

      {/* Team list */}
      <div style={{ width: 200, borderRight: `1px solid ${T.borderFaint}`, overflowY: 'auto', flexShrink: 0 }}>
        {conferences.map(conf => (
          <div key={conf}>
            <div style={{ padding: '8px 14px', color: T.textDim, fontSize: 10, letterSpacing: 1, borderBottom: `1px solid ${T.borderFaint}` }}>
              {conf}
            </div>
            {teams.filter(t => t.conference === conf).map(team => (
              <div
                key={team.id}
                onClick={() => handleSelectTeam(team)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  color: selectedTeam?.id === team.id ? '#4FC3F7' : T.textPrimary,
                  background: selectedTeam?.id === team.id ? T.bgBlue : 'transparent',
                  borderBottom: `1px solid ${T.borderFaint}`, fontSize: '13px',
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
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim }}>
          Select a team to view their roster
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Team header */}
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ color: T.textPrimary, margin: 0, fontSize: 20 }}>{selectedTeam.city} {selectedTeam.name}</h2>
            <div style={{ color: T.textDim, fontSize: 11, marginTop: 4 }}>{selectedTeam.conference} — {selectedTeam.division}</div>
          </div>

          {/* Position filter */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {availablePositions.map(pos => (
              <button
                key={pos}
                onClick={() => { setSelectedPosition(pos); setSelectedPlayer(null); }}
                style={{
                  padding: '4px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                  background: selectedPosition === pos ? '#4FC3F7' : T.bgCard,
                  color: selectedPosition === pos ? '#000' : T.textSecondary,
                  fontWeight: selectedPosition === pos ? 'bold' : 'normal',
                  fontSize: '12px',
                }}
              >
                {pos}
              </button>
            ))}
          </div>

          {/* Player list + profile */}
          <div style={{ display: 'flex', gap: 20 }}>

            {/* Player list */}
            <div style={{ flex: '0 0 260px', borderRight: `1px solid ${T.borderFaint}` }}>
              {filteredPlayers.map((player, i) => (
                <div
                  key={player.id}
                  onClick={() => handleSelectPlayer(player)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '11px 20px',
                    borderBottom: `1px solid ${T.borderFaint}`, cursor: 'pointer',
                    background: selectedPlayer?.id === player.id ? T.bgBlue : 'transparent',
                  }}
                >
                  <span style={{ color: T.textDim, fontSize: 11, width: 20 }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: T.textPrimary, fontSize: 13 }}>{player.first_name} {player.last_name}</div>
                    <div style={{ color: T.textDim, fontSize: 10 }}>Age {player.age}</div>
                  </div>
                  <span style={{ color: getOvrColor(player.overall_rating), fontWeight: 700, fontSize: 14 }}>
                    {player.overall_rating}
                  </span>
                </div>
              ))}
            </div>

            {/* Player profile */}
            {selectedPlayer && (
              <div style={{ flex: 1 }}>
                <button
                  onClick={() => setSelectedPlayer(null)}
                  style={{ float: 'right', background: 'none', border: 'none', color: T.textSecondary, cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}
                >
                  ✕
                </button>

                {/* Name + position */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: T.textPrimary, fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
                    {selectedPlayer.first_name} {selectedPlayer.last_name}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ background: T.bgCard, color: '#4FC3F7', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                      {selectedPlayer.position_label || selectedPlayer.position}
                    </span>
                    <span style={{ color: T.textDim, fontSize: 11 }}>Age {selectedPlayer.age}</span>
                    <span style={{ color: getOvrColor(selectedPlayer.overall_rating), fontWeight: 700, fontSize: 14 }}>
                      {selectedPlayer.overall_rating} OVR
                    </span>
                  </div>
                </div>

                {/* Attributes */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>ATTRIBUTES</div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[
                      { label: 'Speed', value: selectedPlayer.speed },
                      { label: 'Strength', value: selectedPlayer.strength },
                      { label: 'Awareness', value: selectedPlayer.awareness },
                    ].map(attr => (
                      <div key={attr.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56 }}>
                        <span style={{ color: '#4FC3F7', fontWeight: 700, fontSize: 18 }}>{attr.value}</span>
                        <span style={{ color: T.textDim, fontSize: 9, letterSpacing: 0.5, marginTop: 2 }}>{attr.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stats toggle */}
                {showStats(selectedPlayer.position) && (
                  <div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                      {(['season', 'career'] as const).map(v => (
                        <button
                          key={v}
                          onClick={() => setStatsView(v)}
                          style={{
                            padding: '5px 14px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                            background: statsView === v ? '#4FC3F7' : T.bgCard,
                            color: statsView === v ? '#000' : T.textSecondary,
                            fontWeight: statsView === v ? 'bold' : 'normal',
                            fontSize: '12px',
                          }}
                        >
                          {v === 'season' ? 'This Season' : 'Career'}
                        </button>
                      ))}
                    </div>

                    {statsView === 'season' && (
                      <>
                        {!playerStats ? (
                          <div style={{ color: T.textDim, fontSize: 12 }}>Loading...</div>
                        ) : playerStats.games === 0 ? (
                          <div style={{ color: T.textDim, fontSize: 12 }}>No stats this season</div>
                        ) : (
                          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            <StatBox label="GP" value={playerStats.games} />
                            {selectedPlayer.position === 'QB' && <>
                              <StatBox label="YDS" value={playerStats.pass_yards} />
                              <StatBox label="TD" value={playerStats.pass_tds} />
                              <StatBox label="INT" value={playerStats.interceptions} />
                              <StatBox label="CMP" value={playerStats.completions} />
                              <StatBox label="ATT" value={playerStats.pass_attempts} />
                              <StatBox label="PCT" value={playerStats.pass_attempts > 0 ? `${Math.round((playerStats.completions / playerStats.pass_attempts) * 100)}%` : '—'} />
                            </>}
                            {selectedPlayer.position === 'RB' && <>
                              <StatBox label="RYDS" value={playerStats.rush_yards} />
                              <StatBox label="RTD" value={playerStats.rush_tds} />
                              <StatBox label="YPC" value={playerStats.rush_attempts > 0 ? (playerStats.rush_yards / playerStats.rush_attempts).toFixed(1) : '—'} />
                              <StatBox label="REC" value={playerStats.receptions} />
                              <StatBox label="REYDS" value={playerStats.rec_yards} />
                            </>}
                            {(selectedPlayer.position === 'WR' || selectedPlayer.position === 'TE') && <>
                              <StatBox label="YDS" value={playerStats.rec_yards} />
                              <StatBox label="TD" value={playerStats.rec_tds} />
                              <StatBox label="REC" value={playerStats.receptions} />
                              <StatBox label="TGT" value={playerStats.targets} />
                              <StatBox label="CTH%" value={playerStats.targets > 0 ? `${Math.round((playerStats.receptions / playerStats.targets) * 100)}%` : '—'} />
                            </>}
                            {DEF_POSITIONS.includes(selectedPlayer.position) && <>
                              <StatBox label="SOLO" value={playerStats.tackles} />
                              <StatBox label="AST" value={playerStats.assisted_tackles} />
                              <StatBox label="TOT" value={(playerStats.tackles ?? 0) + (playerStats.assisted_tackles ?? 0)} />
                              <StatBox label="SACKS" value={Number(playerStats.sacks ?? 0).toFixed(1)} />
                              <StatBox label="TFL" value={playerStats.tfl} />
                              <StatBox label="INT" value={playerStats.def_interceptions} />
                              <StatBox label="PD" value={playerStats.pass_deflections} />
                            </>}
                          </div>
                        )}
                      </>
                    )}

                    {statsView === 'career' && (
                      <>
                        {careerStats.length === 0 ? (
                          <div style={{ color: T.textDim, fontSize: 12 }}>No career stats yet</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                {getCareerHeaders(selectedPlayer.position).map(h => (
                                  <th key={h} style={{ padding: '4px 8px', color: T.textDim, fontSize: 10, letterSpacing: 1, textAlign: 'left', borderBottom: `1px solid ${T.borderFaint}` }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {careerStats.map((s, i) => (
                                <SeasonStatsRow key={i} s={s} position={selectedPlayer.position} />
                              ))}
                            </tbody>
                          </table>
                        )}
                      </>
                    )}
                  </div>
                )}

                {!showStats(selectedPlayer.position) && (
                  <div style={{ color: T.textDim, fontSize: 12, marginTop: 8 }}>
                    Stats not tracked for this position
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
