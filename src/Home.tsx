import React, { useEffect, useState } from 'react';

declare const window: any;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Matchup {
  id: number;
  week: number;
  home_team: string;
  away_team: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  is_simulated: number;
}

interface BoxScorePlayer {
  player_name: string;
  position: string;
  team_id: number;
  pass_attempts: number;
  completions: number;
  pass_yards: number;
  pass_tds: number;
  interceptions: number;
  rush_attempts: number;
  rush_yards: number;
  rush_tds: number;
  targets: number;
  receptions: number;
  rec_yards: number;
  rec_tds: number;
}

interface BoxScoreData {
  game: {
    id: number;
    home_score: number;
    away_score: number;
    home_team: string;
    away_team: string;
    home_team_id: number;
    away_team_id: number;
  };
  players: BoxScorePlayer[];
}

interface StandingEntry {
  team_name: string;
  wins: number;
  losses: number;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const btn = (bg: string, fg: string, disabled: boolean, border = 'none'): React.CSSProperties => ({
  padding: '9px 18px',
  background: disabled ? '#2a2a2a' : bg,
  border,
  borderRadius: 5,
  color: disabled ? '#555' : fg,
  fontWeight: 'bold',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 13,
});

// ─── Home ─────────────────────────────────────────────────────────────────────

export default function Home({ currentSeason, onSeasonAdvance }: Props) {
  const [loading, setLoading] = useState(true);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<number | null>(null);
  const [viewWeek, setViewWeek] = useState(1);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [boxScore, setBoxScore] = useState<BoxScoreData | null>(null);
  const [boxScoreLoading, setBoxScoreLoading] = useState(false);
  const [topAFC, setTopAFC] = useState<StandingEntry[]>([]);
  const [topNFC, setTopNFC] = useState<StandingEntry[]>([]);
  const [champions, setChampions] = useState<Champion[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const refreshSidebar = async () => {
    const [dashboard, champs] = await Promise.all([
      window.api.getDashboard(currentSeason),
      window.api.getChampions(),
    ]);
    setTopAFC(dashboard.topAFC);
    setTopNFC(dashboard.topNFC);
    setChampions(champs);
  };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      const status = await window.api.getCurrentWeek();
      if (cancelled) return;

      setHasSchedule(status.hasSchedule);
      setCurrentWeek(status.currentWeek);

      if (status.hasSchedule) {
        const week = status.currentWeek ?? 17;
        setViewWeek(week);
        const data = await window.api.getWeekMatchups(week);
        if (!cancelled) setMatchups(data);
      }

      await refreshSidebar();
      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [currentSeason]);

  const handleGenerateSchedule = async () => {
    setGeneratingSchedule(true);
    await window.api.generateSchedule();
    const status = await window.api.getCurrentWeek();
    setHasSchedule(status.hasSchedule);
    setCurrentWeek(status.currentWeek);
    setViewWeek(1);
    const data = await window.api.getWeekMatchups(1);
    setMatchups(data);
    setGeneratingSchedule(false);
  };

  const handleSimulateWeek = async () => {
    if (currentWeek === null) return;
    const weekToSim = currentWeek;
    setSimulating(true);
    await window.api.simulateWeek(weekToSim);
    const status = await window.api.getCurrentWeek();
    setCurrentWeek(status.currentWeek);
    // Stay on viewWeek to show results, re-fetch in case viewWeek === weekToSim
    const data = await window.api.getWeekMatchups(viewWeek);
    setMatchups(data);
    await refreshSidebar();
    setSimulating(false);
  };

  const handleViewWeek = async (week: number) => {
    if (week < 1 || week > 17) return;
    setViewWeek(week);
    setBoxScore(null);
    const data = await window.api.getWeekMatchups(week);
    setMatchups(data);
  };

  const handleBoxScore = async (gameId: number) => {
    if (boxScore?.game?.id === gameId) {
      setBoxScore(null);
      return;
    }
    setBoxScoreLoading(true);
    setBoxScore(null);
    const data = await window.api.getGameBoxScore(gameId);
    setBoxScore(data);
    setBoxScoreLoading(false);
  };

  const handleAdvance = async () => {
    setAdvancing(true);
    const result = await window.api.advanceSeason();
    setAdvancing(false);
    setConfirming(false);
    onSeasonAdvance(result.nextSeason);
  };

  const allWeeksDone = hasSchedule && currentWeek === null;
  const weekIsPlayed = matchups.length > 0 && matchups.every(m => m.is_simulated === 1);

  if (loading) {
    return <div style={{ padding: 40, color: '#444', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div style={{ padding: 20, color: '#fff', fontFamily: 'sans-serif', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>

      {/* ─── Header ─────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #1e1e1e',
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#FF8740' }}>
            {currentSeason} NFL Season
          </div>
          <div style={{ fontSize: 12, color: '#444', marginTop: 2 }}>
            {!hasSchedule
              ? 'No schedule generated yet'
              : allWeeksDone
              ? 'Regular season complete'
              : `Week ${currentWeek} of 17 up next`}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!hasSchedule && (
            <button onClick={handleGenerateSchedule} disabled={generatingSchedule} style={btn('#FF8740', '#000', generatingSchedule)}>
              {generatingSchedule ? 'Generating...' : `▶ Start ${currentSeason} Season`}
            </button>
          )}
          {hasSchedule && currentWeek !== null && (
            <button onClick={handleSimulateWeek} disabled={simulating} style={btn('#FF8740', '#000', simulating)}>
              {simulating ? `Simulating Week ${currentWeek}...` : `▶ Simulate Week ${currentWeek}`}
            </button>
          )}
          {allWeeksDone && !confirming && (
            <button onClick={() => setConfirming(true)} style={btn('#1a1a1a', '#ccc', false, '1px solid #333')}>
              Advance to {currentSeason + 1} →
            </button>
          )}
          {allWeeksDone && confirming && (
            <>
              <span style={{ fontSize: 12, color: '#666' }}>Ages players + retires veterans. Confirm?</span>
              <button onClick={handleAdvance} disabled={advancing} style={btn('#FF8740', '#000', advancing)}>
                {advancing ? 'Advancing...' : 'Confirm'}
              </button>
              <button onClick={() => setConfirming(false)} style={btn('#1a1a1a', '#666', false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* Matchups */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!hasSchedule ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#252525' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🏈</div>
              <div style={{ fontSize: 15 }}>No schedule for {currentSeason} yet.</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Click "Start {currentSeason} Season" to generate all 17 weeks.</div>
            </div>
          ) : (
            <>
              {/* Week nav */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => handleViewWeek(viewWeek - 1)}
                  disabled={viewWeek <= 1}
                  style={{
                    padding: '4px 12px', background: '#141414', border: '1px solid #222',
                    borderRadius: 4, color: viewWeek <= 1 ? '#2a2a2a' : '#666',
                    cursor: viewWeek <= 1 ? 'not-allowed' : 'pointer', fontSize: 12,
                  }}
                >←</button>
                <span style={{ fontWeight: 'bold', fontSize: 14, width: 72, textAlign: 'center' }}>
                  WEEK {viewWeek}
                </span>
                <button
                  onClick={() => handleViewWeek(viewWeek + 1)}
                  disabled={viewWeek >= 17}
                  style={{
                    padding: '4px 12px', background: '#141414', border: '1px solid #222',
                    borderRadius: 4, color: viewWeek >= 17 ? '#2a2a2a' : '#666',
                    cursor: viewWeek >= 17 ? 'not-allowed' : 'pointer', fontSize: 12,
                  }}
                >→</button>
                {matchups.length > 0 && (
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 10, marginLeft: 4, letterSpacing: 0.5,
                    background: weekIsPlayed ? '#0a160a' : '#160e00',
                    color: weekIsPlayed ? '#4caf50' : '#FF8740',
                  }}>
                    {weekIsPlayed ? '● FINAL' : '● UPCOMING'}
                  </span>
                )}
              </div>

              {/* Game cards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {matchups.map(game => {
                  const played = game.is_simulated === 1;
                  const homeWon = played && (game.home_score ?? 0) > (game.away_score ?? 0);
                  const awayWon = played && (game.away_score ?? 0) > (game.home_score ?? 0);
                  const expanded = boxScore?.game?.id === game.id;

                  return (
                    <div key={game.id} style={{
                      background: expanded ? '#101a10' : '#161616',
                      border: `1px solid ${expanded ? '#1a381a' : played ? '#1c1c1c' : '#181828'}`,
                      borderRadius: 6, padding: '9px 10px',
                    }}>
                      {/* Home row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{
                          fontSize: 11, fontWeight: homeWon ? '700' : '400',
                          color: homeWon ? '#fff' : played ? '#444' : '#999',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          maxWidth: played ? '73%' : '100%',
                        }}>
                          {homeWon && <span style={{ color: '#FF8740' }}>▸ </span>}
                          {game.home_team}
                        </span>
                        {played && (
                          <span style={{ fontSize: 15, fontWeight: homeWon ? '700' : '400', color: homeWon ? '#fff' : '#383838', flexShrink: 0 }}>
                            {game.home_score}
                          </span>
                        )}
                      </div>
                      {/* Away row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: played ? 7 : 4 }}>
                        <span style={{
                          fontSize: 11, fontWeight: awayWon ? '700' : '400',
                          color: awayWon ? '#fff' : played ? '#444' : '#999',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          maxWidth: played ? '73%' : '100%',
                        }}>
                          {awayWon && <span style={{ color: '#FF8740' }}>▸ </span>}
                          {game.away_team}
                        </span>
                        {played && (
                          <span style={{ fontSize: 15, fontWeight: awayWon ? '700' : '400', color: awayWon ? '#fff' : '#383838', flexShrink: 0 }}>
                            {game.away_score}
                          </span>
                        )}
                      </div>
                      {!played && <div style={{ fontSize: 9, color: '#252525', letterSpacing: 0.5 }}>PREVIEW</div>}
                      {played && (
                        <button
                          onClick={() => handleBoxScore(game.id)}
                          style={{
                            width: '100%', padding: '3px 0',
                            background: expanded ? '#142014' : '#111',
                            border: `1px solid ${expanded ? '#1a381a' : '#1e1e1e'}`,
                            borderRadius: 3, color: expanded ? '#4caf50' : '#333',
                            cursor: 'pointer', fontSize: 9, letterSpacing: 0.5,
                          }}
                        >
                          {expanded ? '▲ BOX SCORE' : '▼ BOX SCORE'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Box score panel */}
              {(boxScore || boxScoreLoading) && (
                <div style={{ marginTop: 12, background: '#0a0a0a', border: '1px solid #1a381a', borderRadius: 8, padding: 16 }}>
                  {boxScoreLoading
                    ? <div style={{ color: '#2a2a2a', textAlign: 'center', padding: 20 }}>Loading box score...</div>
                    : boxScore ? <BoxScore data={boxScore} />
                    : null}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: 196, flexShrink: 0 }}>
          {topAFC.length > 0 && (
            <SidebarBlock title="AFC LEADERS">
              {topAFC.map((t, i) => (
                <SidebarRow key={i} left={`${i + 1}. ${t.team_name}`} right={`${t.wins}-${t.losses}`} />
              ))}
            </SidebarBlock>
          )}
          {topNFC.length > 0 && (
            <SidebarBlock title="NFC LEADERS">
              {topNFC.map((t, i) => (
                <SidebarRow key={i} left={`${i + 1}. ${t.team_name}`} right={`${t.wins}-${t.losses}`} />
              ))}
            </SidebarBlock>
          )}
          {champions.length > 0 && (
            <SidebarBlock title="SB CHAMPIONS">
              {champions.slice(0, 6).map((c, i) => (
                <SidebarRow key={i} left={String(c.season)} right={c.team_name} dimLeft />
              ))}
            </SidebarBlock>
          )}
          {topAFC.length === 0 && topNFC.length === 0 && (
            <div style={{ color: '#222', fontSize: 12, textAlign: 'center', paddingTop: 30 }}>
              Simulate games<br />to see standings
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar helpers ──────────────────────────────────────────────────────────

function SidebarBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontWeight: 'bold', color: '#FF8740', letterSpacing: 1, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SidebarRow({ left, right, dimLeft }: { left: string; right: string; dimLeft?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 6,
      padding: '3px 0', borderBottom: '1px solid #111',
      fontSize: 11,
    }}>
      <span style={{ color: dimLeft ? '#444' : '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {left}
      </span>
      <span style={{ color: dimLeft ? '#888' : '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', flex: 1 }}>
        {right}
      </span>
    </div>
  );
}

// ─── Box Score ────────────────────────────────────────────────────────────────

function BoxScore({ data }: { data: BoxScoreData }) {
  const { game, players } = data;
  const homeWon = game.home_score > game.away_score;

  return (
    <div>
      {/* Score header */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 40, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #161616' }}>
        {[
          { name: game.home_team, score: game.home_score, won: homeWon, side: 'HOME' },
          { name: game.away_team, score: game.away_score, won: !homeWon, side: 'AWAY' },
        ].map((t, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#333', letterSpacing: 1, marginBottom: 3 }}>{t.side}</div>
            <div style={{ fontSize: 12, color: t.won ? '#ccc' : '#444', marginBottom: 2 }}>{t.name}</div>
            <div style={{ fontSize: 30, fontWeight: 'bold', color: t.won ? '#FF8740' : '#333' }}>{t.score}</div>
          </div>
        ))}
      </div>
      {/* Two-column stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <TeamStats players={players.filter(p => p.team_id === game.home_team_id)} teamName={game.home_team} />
        <TeamStats players={players.filter(p => p.team_id === game.away_team_id)} teamName={game.away_team} />
      </div>
    </div>
  );
}

function TeamStats({ teamName, players }: { teamName: string; players: BoxScorePlayer[] }) {
  const passers = players.filter(p => p.pass_attempts > 0).sort((a, b) => b.pass_yards - a.pass_yards);
  const rushers = players.filter(p => p.rush_attempts > 0).sort((a, b) => b.rush_yards - a.rush_yards).slice(0, 3);
  const receivers = players.filter(p => p.targets > 0).sort((a, b) => b.rec_yards - a.rec_yards).slice(0, 4);
  const nickname = teamName.split(' ').pop()?.toUpperCase() ?? teamName;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 'bold', color: '#FF8740', marginBottom: 8 }}>{nickname}</div>
      {passers.length > 0 && (
        <StatSection title="PASSING">
          {passers.map((p, i) => (
            <StatRow key={i} name={p.player_name}
              line={`${p.completions}/${p.pass_attempts} · ${p.pass_yards} yds · ${p.pass_tds} TD${p.interceptions ? ` · ${p.interceptions} INT` : ''}`} />
          ))}
        </StatSection>
      )}
      {rushers.length > 0 && (
        <StatSection title="RUSHING">
          {rushers.map((p, i) => (
            <StatRow key={i} name={p.player_name}
              line={`${p.rush_attempts} car · ${p.rush_yards} yds${p.rush_tds ? ` · ${p.rush_tds} TD` : ''}`} />
          ))}
        </StatSection>
      )}
      {receivers.length > 0 && (
        <StatSection title="RECEIVING">
          {receivers.map((p, i) => (
            <StatRow key={i} name={p.player_name}
              line={`${p.receptions}/${p.targets} · ${p.rec_yards} yds${p.rec_tds ? ` · ${p.rec_tds} TD` : ''}`} />
          ))}
        </StatSection>
      )}
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, color: '#2e2e2e', letterSpacing: 1, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function StatRow({ name, line }: { name: string; line: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 11, color: '#999', fontWeight: '600' }}>{name}</div>
      <div style={{ fontSize: 10, color: '#444' }}>{line}</div>
    </div>
  );
}