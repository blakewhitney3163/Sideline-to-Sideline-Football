import React, { useEffect, useState } from 'react';
import { T } from './theme';

declare const window: any;

type StatCategory = 'passing' | 'rushing' | 'receiving' | 'defense';
type DefSubCat = 'tackles' | 'sacks' | 'interceptions';

interface BasePlayer {
  player_id: number; player_name: string; team_name: string;
  overall_rating: number; age: number; position: string; dev_trait: string;
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
interface TacklesLeader extends BasePlayer {
  tackles: number; assisted_tackles: number; sacks: number; tfl: number; forced_fumbles: number;
}
interface SacksLeader extends BasePlayer {
  sacks: number; tfl: number; forced_fumbles: number; tackles: number;
}
interface DefIntLeader extends BasePlayer {
  def_interceptions: number; pass_deflections: number; def_tds: number; tackles: number;
}
interface StatsData {
  passing: PassingLeader[]; rushing: RushingLeader[]; receiving: ReceivingLeader[];
  tackles: TacklesLeader[]; sacks: SacksLeader[]; defInterceptions: DefIntLeader[];
}
interface SeasonStats {
  games: number; pass_yards: number; pass_tds: number; interceptions: number;
  completions: number; pass_attempts: number; rush_yards: number; rush_tds: number;
  rush_attempts: number; rec_yards: number; rec_tds: number; receptions: number; targets: number;
  tackles: number; assisted_tackles: number; sacks: number; tfl: number;
  def_interceptions: number; pass_deflections: number;
}
interface CareerSeasonStats extends SeasonStats { season: number; }
interface SelectedPlayer {
  player_id: number; player_name: string; team_name: string;
  overall_rating: number; age: number; position: string; dev_trait: string;
}
interface TeamEntry { id: number; city: string; name: string; }
interface Props { currentSeason: number; }

const TRAIT_META: Record<string, { color: string; label: string }> = {
  'Normal': { color: T.textDim, label: '' },
  'Star': { color: '#4FC3F7', label: 'Star' },
  'Superstar': { color: '#FF8740', label: 'Superstar' },
  'X-Factor': { color: '#FFD700', label: 'X-Factor' },
};

function ovrColor(r: number): string {
  if (r >= 90) return '#FFD700';
  if (r >= 80) return '#4FC3F7';
  if (r >= 70) return '#81C784';
  return T.textSecondary;
}

function isQB(pos: string) { return pos === 'QB'; }
function isRB(pos: string) { return ['RB', 'HB', 'FB'].includes(pos); }
function isWRTE(pos: string) { return ['WR', 'TE'].includes(pos); }

function StatGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 1.5, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function StatLine({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: T.textDim, fontSize: 11 }}>{label}</span>
      <span style={{ color: color ?? T.textPrimary, fontWeight: 'bold', fontSize: 11, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

function PlayerCard({ player, currentSeason, onClose }: { player: SelectedPlayer; currentSeason: number; onClose: () => void }) {
  const [seasonStats, setSeasonStats] = useState<SeasonStats | null>(null);
  const [careerStats, setCareerStats] = useState<CareerSeasonStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      window.api.getPlayerStats(player.player_id),
      window.api.getPlayerCareerStats(player.player_id),
    ]).then(([season, career]: [SeasonStats, CareerSeasonStats[]]) => {
      setSeasonStats(season ?? null);
      setCareerStats(career ?? []);
      setLoading(false);
    }).catch(() => { setSeasonStats(null); setCareerStats([]); setLoading(false); });
  }, [player.player_id]);

  const trait = TRAIT_META[player.dev_trait] ?? TRAIT_META['Normal'];
  const pos = player.position;
  const showPassing = isQB(pos);
  const showRushing = isQB(pos) || isRB(pos);
  const showReceiving = isRB(pos) || isWRTE(pos);
  const showDefense = ['DL', 'LB', 'CB', 'S', 'DE', 'DT', 'MLB', 'OLB', 'ILB', 'FS', 'SS'].includes(pos);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8,
        padding: 24, width: 480, maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: T.textPrimary }}>{player.player_name}</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
              {player.position} · {player.team_name} · Age {player.age}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: ovrColor(player.overall_rating) }}>{player.overall_rating}</div>
              <div style={{ fontSize: 9, color: T.textDim }}>OVR</div>
            </div>
            {trait.label && (
              <div style={{ fontSize: 10, color: trait.color, border: `1px solid ${trait.color}`, borderRadius: 3, padding: '2px 6px' }}>
                {trait.label}
              </div>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>×</button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: T.textDim, fontSize: 12 }}>Loading stats...</div>
        ) : (
          <div>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 8 }}>{currentSeason} SEASON</div>
            {seasonStats && (
              <div style={{ background: T.bgCard, borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
                {showPassing && (seasonStats.pass_attempts ?? 0) > 0 && (
                  <StatGroup label="PASSING">
                    <StatLine label="Yards" value={seasonStats.pass_yards ?? 0} color="#4FC3F7" />
                    <StatLine label="TDs" value={seasonStats.pass_tds ?? 0} color="#81C784" />
                    <StatLine label="INTs" value={seasonStats.interceptions ?? 0} color="#e57373" />
                    <StatLine label="Comp %" value={(seasonStats.pass_attempts ?? 0) > 0 ? ((seasonStats.completions / seasonStats.pass_attempts) * 100).toFixed(1) + '%' : '-'} />
                  </StatGroup>
                )}
                {showRushing && (seasonStats.rush_attempts ?? 0) > 0 && (
                  <StatGroup label="RUSHING">
                    <StatLine label="Yards" value={seasonStats.rush_yards ?? 0} color="#4FC3F7" />
                    <StatLine label="TDs" value={seasonStats.rush_tds ?? 0} color="#81C784" />
                    <StatLine label="YPC" value={(seasonStats.rush_attempts ?? 0) > 0 ? ((seasonStats.rush_yards ?? 0) / seasonStats.rush_attempts).toFixed(1) : '-'} />
                  </StatGroup>
                )}
                {showReceiving && (seasonStats.targets ?? 0) > 0 && (
                  <StatGroup label="RECEIVING">
                    <StatLine label="Yards" value={seasonStats.rec_yards ?? 0} color="#4FC3F7" />
                    <StatLine label="TDs" value={seasonStats.rec_tds ?? 0} color="#81C784" />
                    <StatLine label="Receptions" value={seasonStats.receptions ?? 0} />
                    <StatLine label="YPR" value={(seasonStats.receptions ?? 0) > 0 ? ((seasonStats.rec_yards ?? 0) / seasonStats.receptions).toFixed(1) : '-'} />
                  </StatGroup>
                )}
                                {showDefense && ((seasonStats.tackles ?? 0) + (seasonStats.assisted_tackles ?? 0) > 0 || (seasonStats.sacks ?? 0) > 0) && (
                  <StatGroup label="DEFENSE">
                    <StatLine label="Tackles" value={(seasonStats.tackles ?? 0) + (seasonStats.assisted_tackles ?? 0)} color="#4FC3F7" />
                    <StatLine label="Solo" value={seasonStats.tackles ?? 0} />
                    <StatLine label="Assisted" value={seasonStats.assisted_tackles ?? 0} />
                    <StatLine label="Sacks" value={Number(seasonStats.sacks ?? 0).toFixed(1)} color="#FF8740" />
                    <StatLine label="TFL" value={seasonStats.tfl ?? 0} />
                    <StatLine label="INTs" value={seasonStats.def_interceptions ?? 0} color="#81C784" />
                    <StatLine label="PDs" value={seasonStats.pass_deflections ?? 0} />
                  </StatGroup>
                )}
                {(seasonStats.pass_attempts ?? 0) === 0 && (seasonStats.rush_attempts ?? 0) === 0 && (seasonStats.targets ?? 0) === 0 && !showDefense && (
                  <div style={{ color: T.textDim, fontSize: 12 }}>No stats recorded this season.</div>
                )}
              </div>
            )}
            {careerStats.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 8 }}>
                  CAREER ({careerStats.length} SEASON{careerStats.length !== 1 ? 'S' : ''})
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
                    <thead>
                      <tr style={{ color: T.textDim, fontSize: 10 }}>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>YR</th>
                        <th style={{ padding: '4px 6px', textAlign: 'right' }}>G</th>
                        {showPassing && <><th style={{ padding: '4px 6px', textAlign: 'right' }}>PYDS</th><th style={{ padding: '4px 6px', textAlign: 'right' }}>PTD</th><th style={{ padding: '4px 6px', textAlign: 'right' }}>INT</th></>}
                        {showRushing && <><th style={{ padding: '4px 6px', textAlign: 'right' }}>RYDS</th><th style={{ padding: '4px 6px', textAlign: 'right' }}>RTD</th></>}
                        {showReceiving && <><th style={{ padding: '4px 6px', textAlign: 'right' }}>RECYDS</th><th style={{ padding: '4px 6px', textAlign: 'right' }}>RECTD</th><th style={{ padding: '4px 6px', textAlign: 'right' }}>REC</th></>}
                        {showDefense && <><th style={{ padding: '4px 6px', textAlign: 'right' }}>TOT</th><th style={{ padding: '4px 6px', textAlign: 'right' }}>SACKS</th><th style={{ padding: '4px 6px', textAlign: 'right' }}>TFL</th><th style={{ padding: '4px 6px', textAlign: 'right' }}>INT</th><th style={{ padding: '4px 6px', textAlign: 'right' }}>PD</th></>}
                      </tr>
                    </thead>
                    <tbody>
                      {careerStats.map((s, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${T.borderFaint}`, color: T.textPrimary }}>
                          <td style={{ padding: '4px 6px' }}>{s.season}</td>
                          <td style={{ padding: '4px 6px', textAlign: 'right' }}>{s.games ?? 0}</td>
                          {showPassing && <><td style={{ padding: '4px 6px', textAlign: 'right', color: '#4FC3F7' }}>{s.pass_yards ?? 0}</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>{s.pass_tds ?? 0}</td><td style={{ padding: '4px 6px', textAlign: 'right', color: '#e57373' }}>{s.interceptions ?? 0}</td></>}
                          {showRushing && <><td style={{ padding: '4px 6px', textAlign: 'right', color: '#4FC3F7' }}>{s.rush_yards ?? 0}</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>{s.rush_tds ?? 0}</td></>}
                          {showReceiving && <><td style={{ padding: '4px 6px', textAlign: 'right', color: '#4FC3F7' }}>{s.rec_yards ?? 0}</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>{s.rec_tds ?? 0}</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>{s.receptions ?? 0}</td></>}
                          {showDefense && <><td style={{ padding: '4px 6px', textAlign: 'right', color: '#4FC3F7' }}>{(s.tackles ?? 0) + (s.assisted_tackles ?? 0)}</td><td style={{ padding: '4px 6px', textAlign: 'right', color: '#FF8740' }}>{Number(s.sacks ?? 0).toFixed(1)}</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>{s.tfl ?? 0}</td><td style={{ padding: '4px 6px', textAlign: 'right', color: '#81C784' }}>{s.def_interceptions ?? 0}</td><td style={{ padding: '4px 6px', textAlign: 'right' }}>{s.pass_deflections ?? 0}</td></>}
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

// ─── Main Stats Page ──────────────────────────────────────────────────────────

export default function Stats({ currentSeason }: Props) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [category, setCategory] = useState<StatCategory>('passing');
  const [defSubCat, setDefSubCat] = useState<DefSubCat>('tackles');
  const [viewSeason, setViewSeason] = useState<number>(currentSeason);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ matched: number; skipped: number } | null>(null);
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamEntry | null>(null);
  const [teamStats, setTeamStats] = useState<any[] | null>(null);

  useEffect(() => {
    window.api.getSeasons().then((seasons: number[]) => setAvailableSeasons(seasons));
    window.api.getTeams().then((data: TeamEntry[]) => setTeams(data));
  }, []);

  useEffect(() => { setViewSeason(currentSeason); }, [currentSeason]);

  useEffect(() => {
    window.api.getStats(viewSeason).then((data: StatsData) => setStats(data));
  }, [viewSeason]);

  useEffect(() => {
    if (selectedTeam) {
      window.api.getTeamStats(selectedTeam.id, viewSeason).then((rows: any[]) => setTeamStats(rows));
    } else {
      setTeamStats(null);
    }
  }, [selectedTeam, viewSeason]);

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    const result = await window.api.importNflverseStats();
    setImportResult(result);
    setImporting(false);
  };

  if (!stats) return <div style={{ padding: 40, color: T.textDim }}>Loading...</div>;

  // When a team is selected, build category arrays from the full team roster stats
  const teamPassing = teamStats ? [...teamStats].filter(p => (p.pass_attempts ?? 0) > 0).sort((a, b) => (b.pass_yards ?? 0) - (a.pass_yards ?? 0)) : null;
  const teamRushing = teamStats ? [...teamStats].filter(p => (p.rush_attempts ?? 0) > 0).sort((a, b) => (b.rush_yards ?? 0) - (a.rush_yards ?? 0)) : null;
  const teamReceiving = teamStats ? [...teamStats].filter(p => (p.targets ?? 0) > 0).sort((a, b) => (b.rec_yards ?? 0) - (a.rec_yards ?? 0)) : null;
  const teamTackles = teamStats ? [...teamStats].filter(p => (p.tackles ?? 0) + (p.assisted_tackles ?? 0) > 0).sort((a, b) => ((b.tackles ?? 0) + (b.assisted_tackles ?? 0)) - ((a.tackles ?? 0) + (a.assisted_tackles ?? 0))) : null;
  const teamSacks = teamStats ? [...teamStats].filter(p => (p.sacks ?? 0) > 0).sort((a, b) => (b.sacks ?? 0) - (a.sacks ?? 0)) : null;
  const teamDefInts = teamStats ? [...teamStats].filter(p => (p.def_interceptions ?? 0) > 0 || (p.pass_deflections ?? 0) > 0).sort((a, b) => (b.def_interceptions ?? 0) - (a.def_interceptions ?? 0)) : null;

  const passing = teamPassing ?? stats.passing;
  const rushing = teamRushing ?? stats.rushing;
  const receiving = teamReceiving ?? stats.receiving;
  const tackles = teamTackles ?? (stats.tackles ?? []);
  const sacks = teamSacks ?? (stats.sacks ?? []);
  const defInterceptions = teamDefInts ?? (stats.defInterceptions ?? []);

  const categories: { id: StatCategory; label: string }[] = [
    { id: 'passing', label: 'Passing' },
    { id: 'rushing', label: 'Rushing' },
    { id: 'receiving', label: 'Receiving' },
    { id: 'defense', label: 'Defense' },
  ];

  const rowStyle = (i: number, p: BasePlayer): React.CSSProperties => ({
    borderBottom: `1px solid ${T.borderFaint}`,
    background: selectedPlayer?.player_id === p.player_id ? T.bgGreen : i % 2 === 0 ? T.bgCard : 'transparent',
    cursor: 'pointer',
  });

  const tdBase: React.CSSProperties = { padding: '9px 10px', fontFamily: 'monospace', fontSize: 12 };
  const thStyle: React.CSSProperties = { ...tdBase, color: T.borderStrong, fontSize: 10, letterSpacing: 1 };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>

      {selectedPlayer && (
        <PlayerCard player={selectedPlayer} currentSeason={viewSeason} onClose={() => setSelectedPlayer(null)} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: T.textPrimary }}>
            {selectedTeam ? `${selectedTeam.city} ${selectedTeam.name} — ` : ''}{viewSeason} Season {selectedTeam ? 'Stats' : 'Leaders'}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Click any player to view their full stats</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleImport} disabled={importing} style={{
            padding: '5px 12px', background: 'none', border: `1px solid ${T.borderFaint}`,
            color: T.textDim, borderRadius: 4, cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
          }}>
            {importing ? 'importing...' : '↻ sync NFL history'}
          </button>
          {importResult && <span style={{ fontSize: 11, color: '#81C784' }}>✓ {importResult.matched} players matched</span>}
          <select
            value={selectedTeam?.id ?? ''}
            onChange={e => {
              const id = Number(e.target.value);
              setSelectedTeam(id ? teams.find(t => t.id === id) ?? null : null);
            }}
            style={{ background: T.bgPage, color: T.textPrimary, border: `1px solid ${T.borderFaint}`, borderRadius: 4, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace' }}
          >
            <option value=''>All Teams</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.city} {t.name}</option>
            ))}
          </select>
          {availableSeasons.length > 1 && (
            <select onChange={e => setViewSeason(Number(e.target.value))} value={viewSeason} style={{
              background: T.bgPage, color: T.textPrimary, border: `1px solid ${T.borderFaint}`, borderRadius: 4,
              padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
            }}>
              {availableSeasons.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {categories.map(cat => (
          <button key={cat.id} onClick={() => setCategory(cat.id)} style={{
            padding: '7px 18px',
            background: category === cat.id ? T.bgGreen : T.bgPage,
            color: category === cat.id ? '#4caf50' : T.textMuted,
            border: `1px solid ${category === cat.id ? '#2a4a2a' : T.bgCard}`,
            borderRadius: 4, cursor: 'pointer',
            fontWeight: category === cat.id ? 'bold' : 'normal',
            fontSize: 12, fontFamily: 'monospace',
          }}>{cat.label}</button>
        ))}
      </div>

      {/* Passing */}
      {category === 'passing' && (
        <div style={{ background: T.bgPanel, borderRadius: 6, overflow: 'hidden', border: `1px solid ${T.borderFaint}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.bgCard }}>
                <th style={{ ...thStyle, width: 32, textAlign: 'center' }}>#</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>PLAYER</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>TEAM</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>OVR</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>YDS</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>TD</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>INT</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>CMP</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>ATT</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>PCT</th>
              </tr>
            </thead>
            <tbody>
              {passing.length === 0 && <tr><td colSpan={10} style={{ ...tdBase, color: T.textDim, textAlign: 'center' }}>No passing stats yet</td></tr>}
              {passing.map((p, i) => (
                <tr key={p.player_id} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                  <td style={{ ...tdBase, textAlign: 'center', color: T.textDim }}>{i + 1}</td>
                  <td style={{ ...tdBase, color: T.textPrimary, fontWeight: 'bold' }}>{p.player_name}</td>
                  <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#4FC3F7', fontWeight: 'bold' }}>{p.pass_yards}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#81C784' }}>{p.pass_tds}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#e57373' }}>{p.interceptions}</td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>{p.completions}</td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>{p.pass_attempts}</td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>{p.pass_attempts > 0 ? ((p.completions / p.pass_attempts) * 100).toFixed(1) + '%' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rushing */}
      {category === 'rushing' && (
        <div style={{ background: T.bgPanel, borderRadius: 6, overflow: 'hidden', border: `1px solid ${T.borderFaint}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.bgCard }}>
                <th style={{ ...thStyle, width: 32, textAlign: 'center' }}>#</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>PLAYER</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>TEAM</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>OVR</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>YDS</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>TD</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>CAR</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>YPC</th>
              </tr>
            </thead>
            <tbody>
              {rushing.length === 0 && <tr><td colSpan={8} style={{ ...tdBase, color: T.textDim, textAlign: 'center' }}>No rushing stats yet</td></tr>}
              {rushing.map((p, i) => (
                <tr key={p.player_id} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                  <td style={{ ...tdBase, textAlign: 'center', color: T.textDim }}>{i + 1}</td>
                  <td style={{ ...tdBase, color: T.textPrimary, fontWeight: 'bold' }}>{p.player_name}</td>
                  <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#4FC3F7', fontWeight: 'bold' }}>{p.rush_yards}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#81C784' }}>{p.rush_tds}</td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>{p.rush_attempts}</td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>{p.rush_attempts > 0 ? (p.rush_yards / p.rush_attempts).toFixed(1) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Receiving */}
      {category === 'receiving' && (
        <div style={{ background: T.bgPanel, borderRadius: 6, overflow: 'hidden', border: `1px solid ${T.borderFaint}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.bgCard }}>
                <th style={{ ...thStyle, width: 32, textAlign: 'center' }}>#</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>PLAYER</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>TEAM</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>OVR</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>YDS</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>TD</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>REC</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>TGT</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>YPR</th>
              </tr>
            </thead>
            <tbody>
              {receiving.length === 0 && <tr><td colSpan={9} style={{ ...tdBase, color: T.textDim, textAlign: 'center' }}>No receiving stats yet</td></tr>}
              {receiving.map((p, i) => (
                <tr key={p.player_id} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                  <td style={{ ...tdBase, textAlign: 'center', color: T.textDim }}>{i + 1}</td>
                  <td style={{ ...tdBase, color: T.textPrimary, fontWeight: 'bold' }}>{p.player_name}</td>
                  <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#4FC3F7', fontWeight: 'bold' }}>{p.rec_yards}</td>
                  <td style={{ ...tdBase, textAlign: 'right', color: '#81C784' }}>{p.rec_tds}</td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>{p.receptions}</td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>{p.targets}</td>
                  <td style={{ ...tdBase, textAlign: 'right' }}>{p.receptions > 0 ? (p.rec_yards / p.receptions).toFixed(1) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Defense */}
      {category === 'defense' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {([
              { id: 'tackles', label: 'Tackles' },
              { id: 'sacks', label: 'Sacks' },
              { id: 'interceptions', label: 'INTs / PDs' },
            ] as { id: DefSubCat; label: string }[]).map(sub => (
              <button key={sub.id} onClick={() => setDefSubCat(sub.id)} style={{
                padding: '5px 14px', fontSize: 11,
                background: defSubCat === sub.id ? T.bgBlue : T.bgPage,
                color: defSubCat === sub.id ? '#4FC3F7' : T.textDim,
                border: `1px solid ${defSubCat === sub.id ? '#2a2a4a' : T.bgCard}`,
                borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
              }}>{sub.label}</button>
            ))}
          </div>

          {defSubCat === 'tackles' && (
            <div style={{ background: T.bgPanel, borderRadius: 6, overflow: 'hidden', border: `1px solid ${T.borderFaint}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.bgCard }}>
                    <th style={{ ...thStyle, width: 32, textAlign: 'center' }}>#</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>PLAYER</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>TEAM</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>OVR</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>SOLO</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>AST</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>TOT</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>SACKS</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>TFL</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>FF</th>
                  </tr>
                </thead>
                <tbody>
                  {tackles.length === 0 && <tr><td colSpan={10} style={{ ...tdBase, color: T.textDim, textAlign: 'center' }}>No defensive stats yet — simulate some games first</td></tr>}
                  {tackles.map((p, i) => (
                    <tr key={p.player_id} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                      <td style={{ ...tdBase, textAlign: 'center', color: T.textDim }}>{i + 1}</td>
                      <td style={{ ...tdBase, color: T.textPrimary, fontWeight: 'bold' }}>{p.player_name}</td>
                      <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#4FC3F7' }}>{p.tackles}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{p.assisted_tackles}</td>
                      <td style={{ ...tdBase, textAlign: 'right', fontWeight: 'bold' }}>{(p.tackles ?? 0) + (p.assisted_tackles ?? 0)}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#FF8740' }}>{Number(p.sacks ?? 0).toFixed(1)}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{p.tfl}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{p.forced_fumbles}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {defSubCat === 'sacks' && (
            <div style={{ background: T.bgPanel, borderRadius: 6, overflow: 'hidden', border: `1px solid ${T.borderFaint}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.bgCard }}>
                    <th style={{ ...thStyle, width: 32, textAlign: 'center' }}>#</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>PLAYER</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>TEAM</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>OVR</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>SACKS</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>TFL</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>FF</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>SOLO TKL</th>
                  </tr>
                </thead>
                <tbody>
                  {sacks.length === 0 && <tr><td colSpan={8} style={{ ...tdBase, color: T.textDim, textAlign: 'center' }}>No sack data yet</td></tr>}
                  {sacks.map((p, i) => (
                    <tr key={p.player_id} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                      <td style={{ ...tdBase, textAlign: 'center', color: T.textDim }}>{i + 1}</td>
                      <td style={{ ...tdBase, color: T.textPrimary, fontWeight: 'bold' }}>{p.player_name}</td>
                      <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#FF8740', fontWeight: 'bold' }}>{Number(p.sacks ?? 0).toFixed(1)}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{p.tfl}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{p.forced_fumbles}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{p.tackles}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {defSubCat === 'interceptions' && (
            <div style={{ background: T.bgPanel, borderRadius: 6, overflow: 'hidden', border: `1px solid ${T.borderFaint}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.bgCard }}>
                    <th style={{ ...thStyle, width: 32, textAlign: 'center' }}>#</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>PLAYER</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>TEAM</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>OVR</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>INT</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>PD</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>DEF TD</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>TACKLES</th>
                  </tr>
                </thead>
                <tbody>
                  {defInterceptions.length === 0 && <tr><td colSpan={8} style={{ ...tdBase, color: T.textDim, textAlign: 'center' }}>No INT/PD data yet</td></tr>}
                  {defInterceptions.map((p, i) => (
                    <tr key={p.player_id} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                      <td style={{ ...tdBase, textAlign: 'center', color: T.textDim }}>{i + 1}</td>
                      <td style={{ ...tdBase, color: T.textPrimary, fontWeight: 'bold' }}>{p.player_name}</td>
                      <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#4FC3F7', fontWeight: 'bold' }}>{p.def_interceptions}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{p.pass_deflections}</td>
                      <td style={{ ...tdBase, textAlign: 'right', color: '#81C784' }}>{p.def_tds}</td>
                      <td style={{ ...tdBase, textAlign: 'right' }}>{p.tackles}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
