import React, { useEffect, useState } from 'react';
import { T } from './theme';

declare const window: any;

type StatCategory = 'passing' | 'rushing' | 'receiving' | 'defense';

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
  passing: PassingLeader[];
  rushing: RushingLeader[];
  receiving: ReceivingLeader[];
  tackles: TacklesLeader[];
  sacks: SacksLeader[];
  defInterceptions: DefIntLeader[];
}

interface SeasonStats {
  games: number;
  pass_yards: number; pass_tds: number; interceptions: number;
  completions: number; pass_attempts: number;
  rush_yards: number; rush_tds: number; rush_attempts: number;
  rec_yards: number; rec_tds: number; receptions: number; targets: number;
}

interface CareerSeasonStats extends SeasonStats { season: number; }

interface SelectedPlayer {
  player_id: number; player_name: string; team_name: string;
  overall_rating: number; age: number; position: string; dev_trait: string;
}

interface Props { currentSeason: number; }

const TRAIT_META: Record<string, { color: string; label: string }> = {
  'Normal':    { color: T.textDim,    label: '' },
  'Star':      { color: '#4FC3F7', label: 'Star' },
  'Superstar': { color: '#FF8740', label: 'Superstar' },
  'X-Factor':  { color: '#FFD700', label: 'X-Factor' },
};

function ovrColor(r: number): string {
  if (r >= 90) return '#FFD700';
  if (r >= 80) return '#4FC3F7';
  if (r >= 70) return '#81C784';
  return T.textSecondary;
}

function isQB(pos: string)   { return pos === 'QB'; }
function isRB(pos: string)   { return ['RB', 'HB', 'FB'].includes(pos); }
function isWRTE(pos: string) { return ['WR', 'TE'].includes(pos); }

// ─── Player Card ──────────────────────────────────────────────────────────────

function StatGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #111', fontSize: 12 }}>
      <span style={{ color: T.textDim }}>{label}</span>
      <span style={{ color: color ?? T.textPrimary, fontWeight: 'bold' }}>{value}</span>
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
    }).catch(() => {
      setSeasonStats(null);
      setCareerStats([]);
      setLoading(false);
    });
  }, [player.player_id]);

  const trait       = TRAIT_META[player.dev_trait] ?? TRAIT_META['Normal'];
  const pos         = player.position;
  const showPassing   = isQB(pos);
  const showRushing   = isQB(pos) || isRB(pos);
  const showReceiving = isRB(pos) || isWRTE(pos);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{ position: 'relative', width: 420, background: T.bgPage, borderLeft: `1px solid ${T.borderFaint}`, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${T.borderFaint}`, background: '#0a0a0a' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4 }}>{player.player_name}</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>{player.position} · {player.team_name} · Age {player.age}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 20, fontWeight: 'bold', color: ovrColor(player.overall_rating) }}>{player.overall_rating}</span>
                <span style={{ fontSize: 9, color: T.borderStrong }}>OVR</span>
                {trait.label && <span style={{ fontSize: 9, color: trait.color, border: `1px solid ${trait.color}`, borderRadius: 2, padding: '1px 6px', letterSpacing: 0.5 }}>{trait.label}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textDim, fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, color: T.borderStrong, fontSize: 12 }}>Loading stats...</div>
        ) : (
          <div style={{ padding: '16px 20px', flex: 1 }}>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 12 }}>{currentSeason} SEASON</div>
            {seasonStats && (
              <div style={{ marginBottom: 24 }}>
                {showPassing && (seasonStats.pass_attempts ?? 0) > 0 && (
                  <StatGroup label="PASSING">
                    <StatRow label="Yards"       value={seasonStats.pass_yards ?? 0} />
                    <StatRow label="TDs"         value={seasonStats.pass_tds ?? 0} color="#81C784" />
                    <StatRow label="INTs"        value={seasonStats.interceptions ?? 0} color="#e57373" />
                    <StatRow label="Completions" value={`${seasonStats.completions ?? 0}/${seasonStats.pass_attempts ?? 0}`} />
                    <StatRow label="Comp %"      value={(seasonStats.pass_attempts ?? 0) > 0 ? ((seasonStats.completions / seasonStats.pass_attempts) * 100).toFixed(1) + '%' : '-'} />
                  </StatGroup>
                )}
                {showRushing && (seasonStats.rush_attempts ?? 0) > 0 && (
                  <StatGroup label="RUSHING">
                    <StatRow label="Yards"   value={seasonStats.rush_yards ?? 0} />
                    <StatRow label="TDs"     value={seasonStats.rush_tds ?? 0} color="#81C784" />
                    <StatRow label="Carries" value={seasonStats.rush_attempts ?? 0} />
                    <StatRow label="YPC"     value={(seasonStats.rush_attempts ?? 0) > 0 ? ((seasonStats.rush_yards ?? 0) / seasonStats.rush_attempts).toFixed(1) : '-'} />
                  </StatGroup>
                )}
                {showReceiving && (seasonStats.targets ?? 0) > 0 && (
                  <StatGroup label="RECEIVING">
                    <StatRow label="Yards"   value={seasonStats.rec_yards ?? 0} />
                    <StatRow label="TDs"     value={seasonStats.rec_tds ?? 0} color="#81C784" />
                    <StatRow label="Rec/Tgt" value={`${seasonStats.receptions ?? 0}/${seasonStats.targets ?? 0}`} />
                    <StatRow label="YPR"     value={(seasonStats.receptions ?? 0) > 0 ? ((seasonStats.rec_yards ?? 0) / seasonStats.receptions).toFixed(1) : '-'} />
                  </StatGroup>
                )}
                {(seasonStats.pass_attempts ?? 0) === 0 && (seasonStats.rush_attempts ?? 0) === 0 && (seasonStats.targets ?? 0) === 0 && (
                  <div style={{ color: T.borderStrong, fontSize: 12 }}>No stats recorded this season.</div>
                )}
              </div>
            )}
            {careerStats.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 12 }}>CAREER ({careerStats.length} SEASON{careerStats.length !== 1 ? 'S' : ''})</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ color: T.borderStrong, borderBottom: `1px solid ${T.borderFaint}`, textAlign: 'right' }}>
                        <th style={{ textAlign: 'left', padding: '4px 6px' }}>YR</th>
                        <th style={{ padding: '4px 6px' }}>G</th>
                        {showPassing && <><th style={{ padding: '4px 6px' }}>PYDS</th><th style={{ padding: '4px 6px' }}>PTD</th><th style={{ padding: '4px 6px' }}>INT</th></>}
                        {showRushing && <><th style={{ padding: '4px 6px' }}>RYDS</th><th style={{ padding: '4px 6px' }}>RTD</th></>}
                        {showReceiving && <><th style={{ padding: '4px 6px' }}>RECYDS</th><th style={{ padding: '4px 6px' }}>RECTD</th><th style={{ padding: '4px 6px' }}>REC</th></>}
                      </tr>
                    </thead>
                    <tbody>
                      {careerStats.map((s, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #111', background: s.season === currentSeason ? T.bgGreen : 'transparent' }}>
                          <td style={{ padding: '5px 6px', color: s.season === currentSeason ? '#4caf50' : T.textMuted }}>{s.season}</td>
                          <td style={{ padding: '5px 6px', color: T.textDim, textAlign: 'right' }}>{s.games ?? 0}</td>
                          {showPassing && <><td style={{ padding: '5px 6px', color: T.textPrimary, textAlign: 'right' }}>{s.pass_yards ?? 0}</td><td style={{ padding: '5px 6px', color: '#81C784', textAlign: 'right' }}>{s.pass_tds ?? 0}</td><td style={{ padding: '5px 6px', color: '#e57373', textAlign: 'right' }}>{s.interceptions ?? 0}</td></>}
                          {showRushing && <><td style={{ padding: '5px 6px', color: T.textPrimary, textAlign: 'right' }}>{s.rush_yards ?? 0}</td><td style={{ padding: '5px 6px', color: '#81C784', textAlign: 'right' }}>{s.rush_tds ?? 0}</td></>}
                          {showReceiving && <><td style={{ padding: '5px 6px', color: T.textPrimary, textAlign: 'right' }}>{s.rec_yards ?? 0}</td><td style={{ padding: '5px 6px', color: '#81C784', textAlign: 'right' }}>{s.rec_tds ?? 0}</td><td style={{ padding: '5px 6px', color: T.textMuted, textAlign: 'right' }}>{s.receptions ?? 0}</td></>}
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

type DefSubCat = 'tackles' | 'sacks' | 'interceptions';

export default function Stats({ currentSeason }: Props) {
  const [stats,            setStats]            = useState<StatsData | null>(null);
  const [category,         setCategory]         = useState<StatCategory>('passing');
  const [defSubCat,        setDefSubCat]        = useState<DefSubCat>('tackles');
  const [viewSeason,       setViewSeason]       = useState<number>(currentSeason);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [selectedPlayer,   setSelectedPlayer]   = useState<SelectedPlayer | null>(null);
  const [importing,        setImporting]        = useState(false);
  const [importResult,     setImportResult]     = useState<{ matched: number; skipped: number } | null>(null);

  useEffect(() => {
    window.api.getSeasons().then((seasons: number[]) => setAvailableSeasons(seasons));
  }, []);

  useEffect(() => { setViewSeason(currentSeason); }, [currentSeason]);

  useEffect(() => {
    window.api.getStats(viewSeason).then((data: StatsData) => setStats(data));
  }, [viewSeason]);

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    const result = await window.api.importNflverseStats();
    setImportResult(result);
    setImporting(false);
  };

  if (!stats) return <div style={{ padding: 40, color: T.textMuted, fontFamily: 'monospace' }}>Loading...</div>;

  const categories: { id: StatCategory; label: string }[] = [
    { id: 'passing',   label: 'Passing' },
    { id: 'rushing',   label: 'Rushing' },
    { id: 'receiving', label: 'Receiving' },
    { id: 'defense',   label: 'Defense' },
  ];

  const rowStyle = (i: number, p: BasePlayer): React.CSSProperties => ({
    borderBottom: `1px solid ${T.borderFaint}`,
background: selectedPlayer?.player_id === p.player_id ? T.bgGreen : i % 2 === 0 ? T.bgCard : 'transparent',
    cursor: 'pointer',
  });

  const tdBase: React.CSSProperties = { padding: '9px 10px', fontFamily: 'monospace', fontSize: 12 };
  const thStyle: React.CSSProperties = { ...tdBase, color: T.borderStrong, fontSize: 10, letterSpacing: 1 };

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'monospace', color: T.textPrimary, background: T.bgPage, minHeight: '100vh' }}>

      {selectedPlayer && (
        <PlayerCard player={selectedPlayer} currentSeason={viewSeason} onClose={() => setSelectedPlayer(null)} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>{viewSeason} Season Leaders</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Click any player to view their full stats</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleImport} disabled={importing} style={{
            padding: '5px 14px', background: T.bgPage, border: '1px solid #1a2a1a', borderRadius: 4,
            color: importing ? T.borderStrong : '#4caf50', cursor: importing ? 'not-allowed' : 'pointer',
            fontSize: 11, fontFamily: 'monospace',
          }}>
            {importing ? 'Importing...' : '↓ Import NFL History'}
          </button>
          {importResult && <span style={{ fontSize: 10, color: '#4caf50' }}>✓ {importResult.matched} players matched</span>}
          {availableSeasons.length > 1 && (
            <select value={viewSeason} onChange={e => setViewSeason(Number(e.target.value))} style={{
              background: T.bgPage, color: T.textPrimary, border: `1px solid ${T.borderFaint}`, borderRadius: 4,
              padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
            }}>
              {availableSeasons.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
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
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `1px solid ${T.borderFaint}` }}>
              <th style={thStyle}>#</th><th style={thStyle}>PLAYER</th><th style={thStyle}>TEAM</th>
              <th style={thStyle}>OVR</th><th style={thStyle}>YDS</th><th style={thStyle}>TD</th>
              <th style={thStyle}>INT</th><th style={thStyle}>CMP</th><th style={thStyle}>ATT</th><th style={thStyle}>PCT</th>
            </tr>
          </thead>
          <tbody>
            {stats.passing.map((p, i) => (
              <tr key={i} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                <td style={{ ...tdBase, color: T.borderStrong }}>{i + 1}</td>
                <td style={{ ...tdBase, color: selectedPlayer?.player_id === p.player_id ? '#4caf50' : '#fff', fontWeight: 'bold' }}>{p.player_name}</td>
                <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                <td style={{ ...tdBase, color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                <td style={{ ...tdBase, color: '#4FC3F7', fontWeight: 'bold' }}>{p.pass_yards}</td>
                <td style={{ ...tdBase, color: '#81C784' }}>{p.pass_tds}</td>
                <td style={{ ...tdBase, color: '#e57373' }}>{p.interceptions}</td>
                <td style={{ ...tdBase, color: T.textMuted }}>{p.completions}</td>
                <td style={{ ...tdBase, color: T.textMuted }}>{p.pass_attempts}</td>
                <td style={{ ...tdBase, color: T.textMuted }}>{p.pass_attempts > 0 ? ((p.completions / p.pass_attempts) * 100).toFixed(1) + '%' : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Rushing */}
      {category === 'rushing' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `1px solid ${T.borderFaint}` }}>
              <th style={thStyle}>#</th><th style={thStyle}>PLAYER</th><th style={thStyle}>TEAM</th>
              <th style={thStyle}>OVR</th><th style={thStyle}>YDS</th><th style={thStyle}>TD</th>
              <th style={thStyle}>CAR</th><th style={thStyle}>YPC</th>
            </tr>
          </thead>
          <tbody>
            {stats.rushing.map((p, i) => (
              <tr key={i} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                <td style={{ ...tdBase, color: T.borderStrong }}>{i + 1}</td>
                <td style={{ ...tdBase, color: selectedPlayer?.player_id === p.player_id ? '#4caf50' : '#fff', fontWeight: 'bold' }}>{p.player_name}</td>
                <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                <td style={{ ...tdBase, color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                <td style={{ ...tdBase, color: '#4FC3F7', fontWeight: 'bold' }}>{p.rush_yards}</td>
                <td style={{ ...tdBase, color: '#81C784' }}>{p.rush_tds}</td>
                <td style={{ ...tdBase, color: T.textMuted }}>{p.rush_attempts}</td>
                <td style={{ ...tdBase, color: T.textMuted }}>{p.rush_attempts > 0 ? (p.rush_yards / p.rush_attempts).toFixed(1) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Receiving */}
      {category === 'receiving' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: `1px solid ${T.borderFaint}` }}>
              <th style={thStyle}>#</th><th style={thStyle}>PLAYER</th><th style={thStyle}>TEAM</th>
              <th style={thStyle}>OVR</th><th style={thStyle}>YDS</th><th style={thStyle}>TD</th>
              <th style={thStyle}>REC</th><th style={thStyle}>TGT</th><th style={thStyle}>YPR</th>
            </tr>
          </thead>
          <tbody>
            {stats.receiving.map((p, i) => (
              <tr key={i} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                <td style={{ ...tdBase, color: T.borderStrong }}>{i + 1}</td>
                <td style={{ ...tdBase, color: selectedPlayer?.player_id === p.player_id ? '#4caf50' : '#fff', fontWeight: 'bold' }}>{p.player_name}</td>
                <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                <td style={{ ...tdBase, color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                <td style={{ ...tdBase, color: '#4FC3F7', fontWeight: 'bold' }}>{p.rec_yards}</td>
                <td style={{ ...tdBase, color: '#81C784' }}>{p.rec_tds}</td>
                <td style={{ ...tdBase, color: T.textMuted }}>{p.receptions}</td>
                <td style={{ ...tdBase, color: T.textMuted }}>{p.targets}</td>
                <td style={{ ...tdBase, color: T.textMuted }}>{p.receptions > 0 ? (p.rec_yards / p.receptions).toFixed(1) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Defense */}
      {category === 'defense' && (
        <div>
          {/* Defense sub-tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {([
              { id: 'tackles',       label: 'Tackles' },
              { id: 'sacks',         label: 'Sacks' },
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
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `1px solid ${T.borderFaint}` }}>
                  <th style={thStyle}>#</th><th style={thStyle}>PLAYER</th><th style={thStyle}>TEAM</th>
                  <th style={thStyle}>OVR</th><th style={thStyle}>SOLO</th><th style={thStyle}>AST</th>
                  <th style={thStyle}>TOT</th><th style={thStyle}>SACKS</th><th style={thStyle}>TFL</th><th style={thStyle}>FF</th>
                </tr>
              </thead>
              <tbody>
                {(stats.tackles ?? []).map((p, i) => (
                  <tr key={i} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                    <td style={{ ...tdBase, color: T.borderStrong }}>{i + 1}</td>
                    <td style={{ ...tdBase, color: selectedPlayer?.player_id === p.player_id ? '#4caf50' : '#fff', fontWeight: 'bold' }}>{p.player_name}</td>
                    <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                    <td style={{ ...tdBase, color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                    <td style={{ ...tdBase, color: '#4FC3F7', fontWeight: 'bold' }}>{p.tackles}</td>
                    <td style={{ ...tdBase, color: T.textMuted }}>{p.assisted_tackles}</td>
                    <td style={{ ...tdBase, color: T.textPrimary }}>{(p.tackles ?? 0) + (p.assisted_tackles ?? 0)}</td>
                    <td style={{ ...tdBase, color: '#FF8740' }}>{Number(p.sacks ?? 0).toFixed(1)}</td>
                    <td style={{ ...tdBase, color: T.textMuted }}>{p.tfl}</td>
                    <td style={{ ...tdBase, color: T.textMuted }}>{p.forced_fumbles}</td>
                  </tr>
                ))}
                {(stats.tackles ?? []).length === 0 && (
                  <tr><td colSpan={10} style={{ ...tdBase, color: T.borderStrong, textAlign: 'center', padding: 32 }}>No defensive stats yet — simulate some games first</td></tr>
                )}
              </tbody>
            </table>
          )}

          {defSubCat === 'sacks' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `1px solid ${T.borderFaint}` }}>
                  <th style={thStyle}>#</th><th style={thStyle}>PLAYER</th><th style={thStyle}>TEAM</th>
                  <th style={thStyle}>OVR</th><th style={thStyle}>SACKS</th><th style={thStyle}>TFL</th>
                  <th style={thStyle}>FF</th><th style={thStyle}>SOLO TKL</th>
                </tr>
              </thead>
              <tbody>
                {(stats.sacks ?? []).map((p, i) => (
                  <tr key={i} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                    <td style={{ ...tdBase, color: T.borderStrong }}>{i + 1}</td>
                    <td style={{ ...tdBase, color: selectedPlayer?.player_id === p.player_id ? '#4caf50' : '#fff', fontWeight: 'bold' }}>{p.player_name}</td>
                    <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                    <td style={{ ...tdBase, color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                    <td style={{ ...tdBase, color: '#FF8740', fontWeight: 'bold' }}>{Number(p.sacks ?? 0).toFixed(1)}</td>
                    <td style={{ ...tdBase, color: T.textMuted }}>{p.tfl}</td>
                    <td style={{ ...tdBase, color: T.textMuted }}>{p.forced_fumbles}</td>
                    <td style={{ ...tdBase, color: T.textMuted }}>{p.tackles}</td>
                  </tr>
                ))}
                {(stats.sacks ?? []).length === 0 && (
                  <tr><td colSpan={8} style={{ ...tdBase, color: T.borderStrong, textAlign: 'center', padding: 32 }}>No sack data yet</td></tr>
                )}
              </tbody>
            </table>
          )}

          {defSubCat === 'interceptions' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `1px solid ${T.borderFaint}` }}>
                  <th style={thStyle}>#</th><th style={thStyle}>PLAYER</th><th style={thStyle}>TEAM</th>
                  <th style={thStyle}>OVR</th><th style={thStyle}>INT</th><th style={thStyle}>PD</th>
                  <th style={thStyle}>DEF TD</th><th style={thStyle}>TACKLES</th>
                </tr>
              </thead>
              <tbody>
                {(stats.defInterceptions ?? []).map((p, i) => (
                  <tr key={i} style={rowStyle(i, p)} onClick={() => setSelectedPlayer(p)}>
                    <td style={{ ...tdBase, color: T.borderStrong }}>{i + 1}</td>
                    <td style={{ ...tdBase, color: selectedPlayer?.player_id === p.player_id ? '#4caf50' : '#fff', fontWeight: 'bold' }}>{p.player_name}</td>
                    <td style={{ ...tdBase, color: T.textMuted }}>{p.team_name}</td>
                    <td style={{ ...tdBase, color: ovrColor(p.overall_rating), fontWeight: 'bold' }}>{p.overall_rating}</td>
                    <td style={{ ...tdBase, color: '#4FC3F7', fontWeight: 'bold' }}>{p.def_interceptions}</td>
                    <td style={{ ...tdBase, color: T.textMuted }}>{p.pass_deflections}</td>
                    <td style={{ ...tdBase, color: '#81C784' }}>{p.def_tds}</td>
                    <td style={{ ...tdBase, color: T.textMuted }}>{p.tackles}</td>
                  </tr>
                ))}
                {(stats.defInterceptions ?? []).length === 0 && (
                  <tr><td colSpan={8} style={{ ...tdBase, color: T.borderStrong, textAlign: 'center', padding: 32 }}>No INT/PD data yet</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}