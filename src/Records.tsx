import React, { useEffect, useState } from 'react';

declare const window: any;

type RecordMode = 'alltime' | 'season' | 'awards';
type StatCategory = 'passing' | 'rushing' | 'receiving' | 'tds' | 'tackles' | 'sacks' | 'defInts';

interface RecordRow {
  player_id: number;
  player_name: string;
  position: string;
  team_name: string;
  age: number;
  overall_rating: number;
  dev_trait: string;
  season?: number;
  games_played: number;
  seasons_played?: number;
  is_historical?: boolean;
  pass_yards: number; pass_tds: number; interceptions: number;
  completions: number; pass_attempts: number;
  rush_yards: number; rush_tds: number; rush_attempts: number;
  rec_yards: number; rec_tds: number; receptions: number; targets: number;
  tackles: number; assisted_tackles: number; sacks: number; tfl: number;
  def_interceptions: number; pass_deflections: number; forced_fumbles: number;
}

interface RecordsData {
  passing: RecordRow[]; rushing: RecordRow[]; receiving: RecordRow[];
  tds: RecordRow[]; tackles: RecordRow[]; sacks: RecordRow[]; defInts: RecordRow[];
}

interface AwardWinner {
  id: number; name: string; position: string; position_label: string;
  age: number; overall_rating: number; dev_trait: string;
  team_name: string; team_city: string; games: number;
  pass_yards?: number; pass_tds?: number; interceptions?: number;
  rush_yards?: number; rush_tds?: number;
  rec_yards?: number; rec_tds?: number; receptions?: number;
  tackles?: number; sacks?: number; def_interceptions?: number;
}

interface SeasonAwards {
  mvp: AwardWinner | null; opoy: AwardWinner | null; dpoy: AwardWinner | null;
  oroty: AwardWinner | null; droty: AwardWinner | null;
  coy: { city: string; name: string; wins: number } | null;
}

const TRAIT_META: Record<string, { color: string; short: string }> = {
  'Normal':    { color: '#444',    short: '' },
  'Star':      { color: '#4FC3F7', short: 'S' },
  'Superstar': { color: '#FF8740', short: 'SS' },
  'X-Factor':  { color: '#FFD700', short: 'XF' },
};

function ratingColor(r: number): string {
  if (r >= 90) return '#FFD700';
  if (r >= 80) return '#4caf50';
  if (r >= 70) return '#FF8740';
  return '#888';
}

const CATEGORIES: { id: StatCategory; label: string }[] = [
  { id: 'passing',   label: 'Passing' },
  { id: 'rushing',   label: 'Rushing' },
  { id: 'receiving', label: 'Receiving' },
  { id: 'tds',       label: 'Touchdowns' },
  { id: 'tackles',   label: 'Tackles' },
  { id: 'sacks',     label: 'Sacks' },
  { id: 'defInts',   label: 'INTs / PDs' },
];

type ColDef = { label: string; key: string; fmt?: (v: number) => string };

function columns(cat: StatCategory): ColDef[] {
  const gCol: ColDef = { label: 'G', key: 'games_played' };
  switch (cat) {
    case 'passing':
      return [gCol, { label: 'YDS', key: 'pass_yards' }, { label: 'TD', key: 'pass_tds' },
              { label: 'INT', key: 'interceptions' }, { label: 'CMP', key: 'completions' }, { label: 'ATT', key: 'pass_attempts' }];
    case 'rushing':
      return [gCol, { label: 'YDS', key: 'rush_yards' }, { label: 'TD', key: 'rush_tds' },
              { label: 'ATT', key: 'rush_attempts' }, { label: 'YPC', key: '_ypc', fmt: (v) => v.toFixed(1) }];
    case 'receiving':
      return [gCol, { label: 'YDS', key: 'rec_yards' }, { label: 'TD', key: 'rec_tds' },
              { label: 'REC', key: 'receptions' }, { label: 'TGT', key: 'targets' }];
    case 'tds':
      return [gCol, { label: 'TOT TDs', key: '_total_tds' }, { label: 'PASS TD', key: 'pass_tds' },
              { label: 'RUSH TD', key: 'rush_tds' }, { label: 'REC TD', key: 'rec_tds' }];
    case 'tackles':
      return [gCol, { label: 'SOLO', key: 'tackles' }, { label: 'ASST', key: 'assisted_tackles' },
              { label: 'TOTAL', key: '_total_tkl' }, { label: 'TFL', key: 'tfl' }, { label: 'SACKS', key: 'sacks' }];
    case 'sacks':
      return [gCol, { label: 'SACKS', key: 'sacks' }, { label: 'TFL', key: 'tfl' },
              { label: 'FF', key: 'forced_fumbles' }, { label: 'SOLO TKL', key: 'tackles' }];
    case 'defInts':
      return [gCol, { label: 'INT', key: 'def_interceptions' }, { label: 'PD', key: 'pass_deflections' },
              { label: 'DEF TD', key: '_def_tds' }, { label: 'SOLO TKL', key: 'tackles' }];
  }
}

function getValue(row: RecordRow, key: string): number {
  if (key === '_ypc')       return (row as any).rush_attempts > 0 ? (row as any).rush_yards / (row as any).rush_attempts : 0;
  if (key === '_total_tds') return ((row as any).pass_tds || 0) + ((row as any).rush_tds || 0) + ((row as any).rec_tds || 0);
  if (key === '_total_tkl') return ((row as any).tackles || 0) + ((row as any).assisted_tackles || 0);
  if (key === '_def_tds')   return 0;
  return (row as any)[key] ?? 0;
}

function gridTemplate(cols: ColDef[], mode: RecordMode): string {
  const seasonCol = mode === 'season' ? ' 60px' : '';
  return `30px 1fr 50px 40px ${cols.map(() => '80px').join(' ')}${seasonCol}`;
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', background: active ? '#2a2a2a' : 'transparent',
      color: active ? '#fff' : '#555', border: 'none', borderRadius: 4,
      fontSize: 11, fontWeight: active ? 700 : 400, cursor: 'pointer', letterSpacing: 0.5,
    }}>
      {children}
    </button>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 20px', background: active ? '#e8b800' : '#1a1a1a',
      color: active ? '#000' : '#666', border: 'none', borderRadius: 4,
      fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer', letterSpacing: 0.5,
    }}>
      {children}
    </button>
  );
}

function StatLine({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56 }}>
      <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{value ?? '—'}</span>
      <span style={{ color: '#555', fontSize: 9, letterSpacing: 0.5, marginTop: 1 }}>{label}</span>
    </div>
  );
}

function AwardCard({ award, icon, winner, coy, type }: {
  award: string; icon: string;
  winner?: AwardWinner | null;
  coy?: { city: string; name: string; wins: number } | null;
  type: 'off' | 'def' | 'coy';
}) {
  const accent = type === 'def' ? '#4FC3F7' : type === 'coy' ? '#FF8740' : '#FFD700';
  return (
    <div style={{
      background: '#111', border: `1px solid ${accent}22`,
      borderRadius: 8, padding: '18px 20px', flex: '1 1 260px', minWidth: 240,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 1, marginBottom: 12 }}>
        {icon} {award}
      </div>
      {type === 'coy' ? (
        coy ? (
          <>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              {coy.city} {coy.name}
            </div>
            <div style={{ color: '#555', fontSize: 11 }}>{coy.wins}–{18 - coy.wins} record</div>
          </>
        ) : <div style={{ color: '#444', fontSize: 12 }}>Season in progress</div>
      ) : winner ? (
        <>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{winner.name}</div>
          <div style={{ color: '#555', fontSize: 11, marginBottom: 12 }}>
            {winner.team_city} {winner.team_name} · {winner.position_label || winner.position} · {winner.games}G
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            {type === 'off' && winner.position === 'QB' && <>
              <StatLine label="YDS" value={winner.pass_yards?.toLocaleString()} />
              <StatLine label="TD" value={winner.pass_tds} />
              <StatLine label="INT" value={winner.interceptions} />
            </>}
            {type === 'off' && winner.position === 'RB' && <>
              <StatLine label="YDS" value={winner.rush_yards?.toLocaleString()} />
              <StatLine label="TD" value={winner.rush_tds} />
            </>}
            {type === 'off' && (winner.position === 'WR' || winner.position === 'TE') && <>
              <StatLine label="YDS" value={winner.rec_yards?.toLocaleString()} />
              <StatLine label="TD" value={winner.rec_tds} />
              <StatLine label="REC" value={winner.receptions} />
            </>}
            {type === 'def' && <>
              <StatLine label="TKL" value={winner.tackles} />
              <StatLine label="SACKS" value={winner.sacks} />
              <StatLine label="INT" value={winner.def_interceptions} />
            </>}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: ratingColor(winner.overall_rating), fontWeight: 700, fontSize: 13 }}>
              {winner.overall_rating} OVR
            </span>
            {winner.dev_trait && winner.dev_trait !== 'Normal' && (
              <span style={{
                background: TRAIT_META[winner.dev_trait]?.color ?? '#444',
                color: '#000', fontSize: 8, fontWeight: 700,
                padding: '1px 5px', borderRadius: 3, letterSpacing: 0.8,
              }}>
                {winner.dev_trait}
              </span>
            )}
          </div>
        </>
      ) : <div style={{ color: '#444', fontSize: 12 }}>No qualifying players</div>}
    </div>
  );
}

export default function Records() {
  const [mode, setMode]           = useState<RecordMode>('alltime');
  const [category, setCategory]   = useState<StatCategory>('passing');
  const [alltime, setAlltime]     = useState<RecordsData | null>(null);
  const [season, setSeason]       = useState<RecordsData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [awards, setAwards]       = useState<SeasonAwards | null>(null);
  const [currentSeason, setCurrentSeason] = useState(2025);

  useEffect(() => {
    Promise.all([
      window.api.getAlltimeLeaders(),
      window.api.getSeasonRecords(),
      window.api.getCurrentSeason(),
    ]).then(([at, sr, s]: [RecordsData, RecordsData, number]) => {
      setAlltime(at);
      setSeason(sr);
      setCurrentSeason(s);
      setLoading(false);
      window.api.getSeasonAwards(s).then((aw: SeasonAwards) => setAwards(aw));
    }).catch(() => setLoading(false));
  }, []);

  const data = mode === 'alltime' ? alltime : season;
  const rows: RecordRow[] = data ? (data[category] ?? []) : [];
  const cols = columns(category);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 }}>Historical Records</h1>
        <p style={{ color: '#444', fontSize: 12, margin: '4px 0 0' }}>
          In-game leaders · gold rows are real NFL records to beat
        </p>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <ModeBtn active={mode === 'alltime'} onClick={() => setMode('alltime')}>ALL-TIME LEADERS</ModeBtn>
        <ModeBtn active={mode === 'season'}  onClick={() => setMode('season')}>SEASON RECORDS</ModeBtn>
        <ModeBtn active={mode === 'awards'}  onClick={() => setMode('awards')}>SEASON AWARDS</ModeBtn>
      </div>

      {/* Category tabs — hidden in awards mode */}
      {mode !== 'awards' && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <TabBtn key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
              {c.label.toUpperCase()}
            </TabBtn>
          ))}
        </div>
      )}

      {/* Awards mode */}
      {mode === 'awards' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#e8b800', fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 20 }}>
            {currentSeason} SEASON AWARDS
          </div>
          {!awards?.mvp && !awards?.dpoy ? (
            <div style={{ color: '#444', padding: '40px 12px', fontSize: 13 }}>
              No awards yet — simulate the full regular season first.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <AwardCard award="Most Valuable Player"       icon="🏆" winner={awards?.mvp}   type="off" />
              <AwardCard award="Offensive Player of Year"  icon="⚡" winner={awards?.opoy}  type="off" />
              <AwardCard award="Defensive Player of Year"  icon="🛡️" winner={awards?.dpoy}  type="def" />
              <AwardCard award="Offensive Rookie of Year"  icon="🌟" winner={awards?.oroty} type="off" />
              <AwardCard award="Defensive Rookie of Year"  icon="🌟" winner={awards?.droty} type="def" />
              <AwardCard award="Coach of the Year"         icon="📋" coy={awards?.coy}      type="coy" />
            </div>
          )}
        </div>
      )}

      {/* Leaderboard — hidden in awards mode */}
      {mode !== 'awards' && (
        loading ? (
          <div style={{ color: '#444', padding: 40, textAlign: 'center' }}>Loading records…</div>
        ) : (
          <>
            {/* Column header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate(cols, mode),
              gap: 8, padding: '6px 12px',
              fontSize: 10, color: '#333', letterSpacing: 1,
              borderBottom: '1px solid #1a1a1a', marginBottom: 4,
            }}>
              <div>#</div>
              <div>PLAYER</div>
              <div>POS</div>
              <div>OVR</div>
              {cols.map(c => <div key={c.key}>{c.label}</div>)}
              {mode === 'season' && <div>SEASON</div>}
            </div>

            {/* Player rows — historical records styled with gold accent */}
            {rows.length === 0 ? (
              <div style={{ color: '#444', padding: '24px 12px', fontSize: 13 }}>
                No records yet — simulate some games first.
              </div>
            ) : (
              rows.map((row, idx) => {
                const isHist = !!row.is_historical;
                const trait = !isHist ? (TRAIT_META[row.dev_trait] ?? TRAIT_META['Normal']) : null;
                return (
                  <div key={(row.player_id ?? 0) + '-' + idx} style={{
                    display: 'grid',
                    gridTemplateColumns: gridTemplate(cols, mode),
                    gap: 8, padding: '8px 12px',
                    borderBottom: `1px solid ${isHist ? '#e8b80033' : '#111'}`,
                    borderTop: isHist ? '1px solid #e8b80033' : undefined,
                    background: isHist ? '#130f00' : (idx === 0 ? '#0f0e00' : 'transparent'),
                    marginBottom: isHist ? 2 : 0,
                  }}>
                    {/* Rank / trophy */}
                    <div style={{ display: 'flex', alignItems: 'center', color: isHist ? '#e8b800' : '#444', fontSize: isHist ? 14 : 12 }}>
                      {isHist ? '🏆' : idx + 1}
                    </div>

                    {/* Player name */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{
                          color: isHist ? '#e8b800' : '#ddd',
                          fontWeight: isHist ? 700 : 600,
                          fontSize: 13, whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {row.player_name}
                        </span>
                        {isHist && (
                          <span style={{
                            background: '#e8b800', color: '#000', fontSize: 8, fontWeight: 800,
                            padding: '1px 5px', borderRadius: 3, letterSpacing: 0.8, whiteSpace: 'nowrap',
                          }}>
                            NFL RECORD
                          </span>
                        )}
                        {!isHist && trait?.short && (
                          <span style={{
                            background: trait.color, color: '#000', fontSize: 8, fontWeight: 700,
                            padding: '1px 4px', borderRadius: 3,
                          }}>
                            {trait.short}
                          </span>
                        )}
                      </div>
                      <div style={{ color: isHist ? '#665500' : '#555', fontSize: 10, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.team_name}
                      </div>
                    </div>

                    {/* Position */}
                    <div style={{ display: 'flex', alignItems: 'center', color: isHist ? '#997700' : '#888', fontSize: 11 }}>
                      {row.position}
                    </div>

                    {/* OVR — blank for historical */}
                    <div style={{ display: 'flex', alignItems: 'center', fontWeight: 700, fontSize: 13,
                                  color: isHist ? '#444' : ratingColor(row.overall_rating) }}>
                      {isHist ? '—' : row.overall_rating}
                    </div>

                    {/* Stat columns */}
                    {cols.map(col => {
                      const val = getValue(row, col.key);
                      const formatted = col.fmt ? col.fmt(val) : (isHist && val === 0 ? '—' : val.toLocaleString());
                      const isMainStat = col === cols[1];
                      return (
                        <div key={col.key} style={{
                          display: 'flex', alignItems: 'center',
                          color: isMainStat ? (isHist ? '#e8b800' : '#fff') : (isHist ? '#665500' : '#888'),
                          fontWeight: isMainStat ? 700 : 400,
                          fontSize: isMainStat ? 14 : 12,
                        }}>
                          {formatted}
                        </div>
                      );
                    })}

                    {/* Season year */}
                    {mode === 'season' && (
                      <div style={{ display: 'flex', alignItems: 'center', color: isHist ? '#665500' : '#555', fontSize: 12 }}>
                        {row.season}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            <div style={{ color: '#333', fontSize: 10, padding: '10px 12px' }}>
              {rows.filter(r => !r.is_historical).length} in-game player{rows.filter(r => !r.is_historical).length !== 1 ? 's' : ''} ·{' '}
              {mode === 'alltime' ? 'career totals' : 'single-season bests'} · gold rows are real NFL benchmarks
            </div>
          </>
        )
      )}
    </div>
  );
}