import React, { useEffect, useState } from 'react';

declare const window: any;

// ─── Types ────────────────────────────────────────────────────────────────────

type StatCategory = 'passing' | 'rushing' | 'receiving';

interface BasePlayer {
  player_id: number;
  player_name: string;
  team_name: string;
  overall_rating: number;
  age: number;
  position: string;
  dev_trait: string;
}

interface PassingLeader extends BasePlayer {
  pass_yards: number; pass_tds: number; interceptions: number;
  completions: number; pass_attempts: number;
}

interface RushingLeader extends BasePlayer {
  rush_yards: number; rush_tds: number; rush_attempts: number;
}

interface ReceivingLeader extends BasePlayer {
  rec_yards: number; rec_tds: number; receptions: number; targets: number;
}

interface StatsData {
  passing: PassingLeader[];
  rushing: RushingLeader[];
  receiving: ReceivingLeader[];
}

interface SeasonStats {
  games: number;
  pass_yards: number; pass_tds: number; interceptions: number;
  completions: number; pass_attempts: number;
  rush_yards: number; rush_tds: number; rush_attempts: number;
  rec_yards: number; rec_tds: number; receptions: number; targets: number;
}

interface CareerSeasonStats extends SeasonStats {
  season: number;
}

interface SelectedPlayer {
  player_id: number;
  player_name: string;
  team_name: string;
  overall_rating: number;
  age: number;
  position: string;
  dev_trait: string;
}

interface Props {
  currentSeason: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRAIT_META: Record<string, { color: string; label: string }> = {
  'Normal':    { color: '#444',    label: '' },
  'Star':      { color: '#4FC3F7', label: 'Star' },
  'Superstar': { color: '#FF8740', label: 'Superstar' },
  'X-Factor':  { color: '#FFD700', label: 'X-Factor' },
};

function ovrColor(r: number): string {
  if (r >= 90) return '#FFD700';
  if (r >= 80) return '#4FC3F7';
  if (r >= 70) return '#81C784';
  return '#aaa';
}

function isQB(pos: string) { return pos === 'QB'; }
function isRB(pos: string) { return ['RB','HB','FB'].includes(pos); }
function isWRTE(pos: string) { return ['WR','TE'].includes(pos); }

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({
  player,
  currentSeason,
  onClose,
}: {
  player: SelectedPlayer;
  currentSeason: number;
  onClose: () => void;
}) {
  const [seasonStats,  setSeasonStats]  = useState<SeasonStats | null>(null);
  const [careerStats,  setCareerStats]  = useState<CareerSeasonStats[]>([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      window.api.getPlayerStats(player.player_id),
      window.api.getPlayerCareerStats(player.player_id),
    ]).then(([season, career]: [SeasonStats, CareerSeasonStats[]]) => {
      setSeasonStats(season);
      setCareerStats(career ?? []);
      setLoading(false);
    });
  }, [player.player_id]);

  const trait = TRAIT_META[player.dev_trait] ?? TRAIT_META['Normal'];
  const pos   = player.position;

  const showPassing   = isQB(pos);
  const showRushing   = isQB(pos) || isRB(pos);
  const showReceiving = isRB(pos) || isWRTE(pos);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 420, background: '#0d0d0d',
        borderLeft: '1px solid #1e1e1e', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4 }}>
                {player.player_name}
              </div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>
                {player.position} · {player.team_name} · Age {player.age}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  fontSize: 20, fontWeight: 'bold', color: ovrColor(player.overall_rating),
                }}>{player.overall_rating}</span>
                <span style={{ fontSize: 9, color: '#333' }}>OVR</span>
                {trait.label && (
                  <span style={{
                    fontSize: 9, color: trait.color, border: `1px solid ${trait.color}`,
                    borderRadius: 2, padding: '1px 6px', letterSpacing: 0.5,
                  }}>{trait.label}</span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#444', fontSize: 20,
              cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}>×</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, color: '#333', fontSize: 12 }}>Loading stats...</div>
        ) : (
          <div style={{ padding: '16px 20px', flex: 1 }}>

            {/* Current Season */}
            <div style={{ fontSize: 10, color: '#444', letterSpacing: 2, marginBottom: 12 }}>
              {currentSeason} SEASON
            </div>

            {seasonStats && (
              <div style={{ marginBottom: 24 }}>
                {showPassing && seasonStats.pass_attempts > 0 && (
                  <StatGroup label="PASSING">
                    <StatRow label="Yards"       value={seasonStats.pass_yards ?? 0} />
                    <StatRow label="TDs"         value={seasonStats.pass_tds ?? 0} color="#81C784" />
                    <StatRow label="INTs"        value={seasonStats.interceptions ?? 0} color="#e57373" />
                    <StatRow label="Completions" value={`${seasonStats.completions ?? 0}/${seasonStats.pass_attempts ?? 0}`} />
                    <StatRow label="Comp %"      value={seasonStats.pass_attempts > 0 ? ((seasonStats.completions / seasonStats.pass_attempts) * 100).toFixed(1) + '%' : '-'} />
                  </StatGroup>
                )}
                {showRushing && (seasonStats.rush_attempts ?? 0) > 0 && (
                  <StatGroup label="RUSHING">
                    <StatRow label="Yards"  value={seasonStats.rush_yards ?? 0} />
                    <StatRow label="TDs"    value={seasonStats.rush_tds ?? 0} color="#81C784" />
                    <StatRow label="Carries" value={seasonStats.rush_attempts ?? 0} />
                    <StatRow label="YPC"    value={(seasonStats.rush_attempts ?? 0) > 0 ? ((seasonStats.rush_yards ?? 0) / seasonStats.rush_attempts).toFixed(1) : '-'} />
                  </StatGroup>
                )}
                {showReceiving && (seasonStats.targets ?? 0) > 0 && (
                  <StatGroup label="RECEIVING">
                    <StatRow label="Yards"    value={seasonStats.rec_yards ?? 0} />
                    <StatRow label="TDs"      value={seasonStats.rec_tds ?? 0} color="#81C784" />
                    <StatRow label="Rec/Tgt"  value={`${seasonStats.receptions ?? 0}/${seasonStats.targets ?? 0}`} />
                    <StatRow label="YPR"      value={(seasonStats.receptions ?? 0) > 0 ? ((seasonStats.rec_yards ?? 0) / seasonStats.receptions).toFixed(1) : '-'} />
                  </StatGroup>
                )}
                {(seasonStats.pass_attempts ?? 0) === 0 &&
                 (seasonStats.rush_attempts ?? 0) === 0 &&
                 (seasonStats.targets ?? 0) === 0 && (
                  <div style={{ color: '#333', fontSize: 12 }}>No stats recorded this season.</div>
                )}
              </div>
            )}

            {/* Career Stats */}
            {careerStats.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: '#444', letterSpacing: 2, marginBottom: 12 }}>
                  CAREER ({careerStats.length} SEASON{careerStats.length !== 1 ? 'S' : ''})
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ color: '#333', borderBottom: '1px solid #1a1a1a', textAlign: 'right' }}>
                        <th style={{ textAlign: 'left', padding: '4px 6px' }}>YR</th>
                        <th style={{ padding: '4px 6px' }}>G</th>
                        {(showPassing) && <>
                          <th style={{ padding: '4px 6px' }}>PYDS</th>
                          <th style={{ padding: '4px 6px' }}>PTD</th>
                          <th style={{ padding: '4px 6px' }}>INT</th>
                        </>}
                        {(showRushing) && <>
                          <th style={{ padding: '4px 6px' }}>RYDS</th>
                          <th style={{ padding: '4px 6px' }}>RTD</th>
                        </>}
                        {(showReceiving) && <>
                          <th style={{ padding: '4px 6px' }}>RECYDS</th>
                          <th style={{ padding: '4px 6px' }}>RECTD</th>
                          <th style={{ padding: '4px 6px' }}>REC</th>
                        </>}
                      </tr>
                    </thead>
                    <tbody>
                      {careerStats.map((s, i) => (
                        <tr key={i} style={{
                          borderBottom: '1px solid #111',
                          background: s.season === currentSeason ? '#0f1a0f' : 'transparent',
                        }}>
                          <td style={{ padding: '5px 6px', color: s.season === currentSeason ? '#4caf50' : '#555', textAlign: 'left' }}>{s.season}</td>
                          <td style={{ padding: '5px 6px', color: '#444', textAlign: 'right' }}>{s.games ?? 0}</td>
                          {showPassing && <>
                            <td style={{ padding: '5px 6px', color: '#ccc', textAlign: 'right' }}>{s.pass_yards ?? 0}</td>
                            <td style={{ padding: '5px 6px', color: '#81C784', textAlign: 'right' }}>{s.pass_tds ?? 0}</td>
                            <td style={{ padding: '5px 6px', color: '#e57373', textAlign: 'right' }}>{s.interceptions ?? 0}</td>
                          </>}
                          {showRushing && <>
                            <td style={{ padding: '5px 6px', color: '#ccc', textAlign: 'right' }}>{s.rush_yards ?? 0}</td>
                            <td style={{ padding: '5px 6px', color: '#81C784', textAlign: 'right' }}>{s.rush_tds ?? 0}</td>
                          </>}
                          {showReceiving && <>
                            <td style={{ padding: '5px 6px', color: '#ccc', textAlign: 'right' }}>{s.rec_yards ?? 0}</td>
                            <td style={{ padding: '5px 6px', color: '#81C784', textAlign: 'right' }}>{s.rec_tds ?? 0}</td>
                            <td style={{ padding: '5px 6px', color: '#888', textAlign: 'right' }}>{s.receptions ?? 0}</td>
                          </>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, color: '#333', letterSpacing: 1.5, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #111', fontSize: 12 }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span style={{ color: color ?? '#ccc', fontWeight: 'bold' }}>{value}</span>
    </div>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export default function Stats({ currentSeason }: Props) {
  const [stats,            setStats]            = useState<StatsData | null>(null);
  const [category,         setCategory]         = useState<StatCategory>('passing');
  const [viewSeason,       setViewSeason]       = useState<number>(currentSeason);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [selectedPlayer,   setSelectedPlayer]   = useState<SelectedPlayer | null>(null);

  useEffect(() => {
    window.api.getSeasons().then((seasons: number[]) => setAvailableSeasons(seasons));
  }, []);

  useEffect(() => { setViewSeason(currentSeason); }, [currentSeason]);

  useEffect(() => {
    window.api.getStats(viewSeason).then((data: StatsData) => setStats(data));
  }, [viewSeason]);

  if (!stats) return <div style={{ padding: 40, color: '#555', fontFamily: 'monospace' }}>Loading...</div>;

  const categories: { id: StatCategory; label: string }[] = [
    { id: 'passing',   label: 'Passing' },
    { id: 'rushing',   label: 'Rushing' },
    { id: 'receiving', label: 'Receiving' },
  ];

  const rowStyle = (i: number, p: BasePlayer): React.CSSProperties => ({
    borderBottom: '1px solid #111',
    background: selectedPlayer?.player_id === p.player_id ? '#0f1a0f' : i % 2 === 0 ? '#080808' : 'transparent',
    cursor: 'pointer',
    transition: 'background 0.1s',
  });

  const tdBase: React.CSSProperties = { padding: '9px 10px', fontFamily: 'monospace', fontSize: 12 };

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'monospace', color: '#ccc', background: '#0d0d0d', minHeight: '100vh' }}>

      {selectedPlayer && (
        <PlayerCard
          player={selectedPlayer}
          currentSeason={viewSeason}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>{viewSeason} Season Leaders</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Click any player to view their full stats</div>
        </div>
        {availableSeasons.length > 1 && (
          <select
            value={viewSeason}
            onChange={e => setViewSeason(Number(e.target.value))}
            style={{
              background: '#111', color: '#ccc', border: '1px solid #2a2a2a',
              borderRadius: 4, padding: '6px 12px', fontSize: 12,
              cursor: 'pointer', fontFamily: 'monospace',
            }}
          >
            {availableSeasons.map(s => (
              <option key={s} value={s}>{s} Season</option>
            ))}
          </select>
        )}
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {categories.map(cat => (
          <button key={cat.id} onClick={() => setCategory(cat.id)} style={{
            padding: '7px 18px',
            background: category === cat.id ? '#1a2a1a' : '#111',
            color: category === cat.id ? '#4caf50' : '#555',
            border: `1px solid ${category === cat.id ? '#2a4a2a' : '#1a1a1a'}`,
            borderRadius: 4, cursor: 'pointer', fontWeight: category === cat.id ? 'bold' : 'normal',
            fontSize: 12, fontFamily: 'monospace',
          }}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Tables */}
      {category === 'passing' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#333', textAlign: 'left', borderBottom: '1px solid #1a1a1a', fontSize: 10, letterSpacing: 1 }}>
              <th style={tdBase}>#</th>
              <th style={tdBase}>PLAYER</th>
              <th style={tdBase}>TEAM</th>
              <th style={tdBase}>OVR</th>
              <th style={tdBase}>YDS</th>
              <th style={tdBase}>TD</th>
              <th style={tdBase}>INT</th>
              <th style={tdBase}>CMP</th>
              <th style={tdBase}>ATT</th>
              <th style={tdBase}>PCT</th>
            </tr>
          </thead>
          <tbody>
            {stats.passing.map((p, i) => (
              <tr key={i} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                <td style={{ ...tdBase, color: '#333' }}>{i + 1}</td>
                <td style={{ ...tdBase, color: selectedPlayer?.player_id === p.player_id ? '#4caf50' : '#fff', fontWeight: 'bold' }}>{p.player_name}</td>
                <td style={{ ...tdBase, color: '#555' }}>{p.team_name}</td>
                <td style={{ ...tdBase, color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                <td style={{ ...tdBase, color: '#4FC3F7', fontWeight: 'bold' }}>{p.pass_yards}</td>
                <td style={{ ...tdBase, color: '#81C784' }}>{p.pass_tds}</td>
                <td style={{ ...tdBase, color: '#e57373' }}>{p.interceptions}</td>
                <td style={{ ...tdBase, color: '#888' }}>{p.completions}</td>
                <td style={{ ...tdBase, color: '#888' }}>{p.pass_attempts}</td>
                <td style={{ ...tdBase, color: '#888' }}>
                  {p.pass_attempts > 0 ? ((p.completions / p.pass_attempts) * 100).toFixed(1) + '%' : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {category === 'rushing' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#333', textAlign: 'left', borderBottom: '1px solid #1a1a1a', fontSize: 10, letterSpacing: 1 }}>
              <th style={tdBase}>#</th>
              <th style={tdBase}>PLAYER</th>
              <th style={tdBase}>TEAM</th>
              <th style={tdBase}>OVR</th>
              <th style={tdBase}>YDS</th>
              <th style={tdBase}>TD</th>
              <th style={tdBase}>CAR</th>
              <th style={tdBase}>YPC</th>
            </tr>
          </thead>
          <tbody>
            {stats.rushing.map((p, i) => (
              <tr key={i} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                <td style={{ ...tdBase, color: '#333' }}>{i + 1}</td>
                <td style={{ ...tdBase, color: selectedPlayer?.player_id === p.player_id ? '#4caf50' : '#fff', fontWeight: 'bold' }}>{p.player_name}</td>
                <td style={{ ...tdBase, color: '#555' }}>{p.team_name}</td>
                <td style={{ ...tdBase, color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                <td style={{ ...tdBase, color: '#4FC3F7', fontWeight: 'bold' }}>{p.rush_yards}</td>
                <td style={{ ...tdBase, color: '#81C784' }}>{p.rush_tds}</td>
                <td style={{ ...tdBase, color: '#888' }}>{p.rush_attempts}</td>
                <td style={{ ...tdBase, color: '#888' }}>
                  {p.rush_attempts > 0 ? (p.rush_yards / p.rush_attempts).toFixed(1) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {category === 'receiving' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#333', textAlign: 'left', borderBottom: '1px solid #1a1a1a', fontSize: 10, letterSpacing: 1 }}>
              <th style={tdBase}>#</th>
              <th style={tdBase}>PLAYER</th>
              <th style={tdBase}>TEAM</th>
              <th style={tdBase}>OVR</th>
              <th style={tdBase}>YDS</th>
              <th style={tdBase}>TD</th>
              <th style={tdBase}>REC</th>
              <th style={tdBase}>TGT</th>
              <th style={tdBase}>YPR</th>
            </tr>
          </thead>
          <tbody>
            {stats.receiving.map((p, i) => (
              <tr key={i} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                <td style={{ ...tdBase, color: '#333' }}>{i + 1}</td>
                <td style={{ ...tdBase, color: selectedPlayer?.player_id === p.player_id ? '#4caf50' : '#fff', fontWeight: 'bold' }}>{p.player_name}</td>
                <td style={{ ...tdBase, color: '#555' }}>{p.team_name}</td>
                <td style={{ ...tdBase, color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                <td style={{ ...tdBase, color: '#4FC3F7', fontWeight: 'bold' }}>{p.rec_yards}</td>
                <td style={{ ...tdBase, color: '#81C784' }}>{p.rec_tds}</td>
                <td style={{ ...tdBase, color: '#888' }}>{p.receptions}</td>
                <td style={{ ...tdBase, color: '#888' }}>{p.targets}</td>
                <td style={{ ...tdBase, color: '#888' }}>
                  {p.receptions > 0 ? (p.rec_yards / p.receptions).toFixed(1) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}