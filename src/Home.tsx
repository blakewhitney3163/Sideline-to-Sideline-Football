import React, { useEffect, useState } from 'react';
import { T } from './theme';

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

interface SeedEntry {
  id: number;
  city: string;
  name: string;
  team_name: string;
  wins: number;
  losses: number;
}

interface PlayoffGame {
  week: number;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
}

interface InjuredPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  injury_status: string;
  weeks_out: number;
  injury_type: string;
}

interface UserTeam {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
}

interface Props {
  currentSeason: number;
  onSeasonAdvance: (nextSeason: number) => void;
  userTeam: UserTeam;
  onNavigate: (tab: string) => void;
  onPlayoffsComplete: () => void;
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const btn = (bg: string, fg: string, disabled: boolean, border = 'none'): React.CSSProperties => ({
  padding: '9px 18px',
  background: disabled ? T.borderMid : bg,
  border,
  borderRadius: 5,
  color: disabled ? T.textMuted : fg,
  fontWeight: 'bold',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 13,
});

const smallBtn = (bg: string, fg: string, disabled: boolean): React.CSSProperties => ({
  padding: '5px 12px',
  background: disabled ? T.borderMid : bg,
  border: 'none',
  borderRadius: 4,
  color: disabled ? T.textMuted : fg,
  fontWeight: 'bold',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 12,
});

function injuryBadge(status: string): { label: string; color: string; bg: string } {
  if (status === 'ir')           return { label: 'IR',  color: '#e57373', bg: T.bgRed };
  if (status === 'out')          return { label: 'OUT', color: '#FF8740', bg: T.bgOrange };
  if (status === 'questionable') return { label: 'Q',   color: '#FFD700', bg: T.bgGold };
  return                                { label: '',    color: T.textMuted,    bg: 'transparent' };
}

// ─── Home ─────────────────────────────────────────────────────────────────────

export default function Home({ currentSeason, onSeasonAdvance, userTeam, onNavigate, onPlayoffsComplete }: Props) {
  const [loading,            setLoading]            = useState(true);
  const [hasSchedule,        setHasSchedule]        = useState(false);
  const [currentWeek,        setCurrentWeek]        = useState<number | null>(null);
  const [viewWeek,           setViewWeek]           = useState(1);
  const [matchups,           setMatchups]           = useState<Matchup[]>([]);
  const [simulating,         setSimulating]         = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [boxScore,           setBoxScore]           = useState<BoxScoreData | null>(null);
  const [boxScoreLoading,    setBoxScoreLoading]    = useState(false);
  const [topAFC,             setTopAFC]             = useState<StandingEntry[]>([]);
  const [topNFC,             setTopNFC]             = useState<StandingEntry[]>([]);
  const [champions,          setChampions]          = useState<Champion[]>([]);
  const [confirming,         setConfirming]         = useState(false);
  const [advancing,          setAdvancing]          = useState(false);
  const [playoffSeeds,       setPlayoffSeeds]       = useState<{ afc: SeedEntry[]; nfc: SeedEntry[] } | null>(null);
  const [playoffResults,     setPlayoffResults]     = useState<PlayoffGame[] | null>(null);
  const [simulatingPlayoffs, setSimulatingPlayoffs] = useState(false);
  const [userRecord,         setUserRecord]         = useState<{ wins: number; losses: number } | null>(null);
  const [pendingResigns,     setPendingResigns]     = useState(0);
  const [draftComplete,      setDraftComplete]      = useState(false);
  const [draftGenerated,     setDraftGenerated]     = useState(false);
   const [injuryReport,       setInjuryReport]       = useState<InjuredPlayer[]>([]);
  const [retiredPlayers,     setRetiredPlayers]     = useState<{ name: string; position: string; age: number; ovr: number }[]>([]);
  const [statLeaders, setStatLeaders] = useState<any | null>(null);
  const [psAlert, setPSAlert] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      setBoxScore(null);
      setConfirming(false);
      setPlayoffSeeds(null);
      setPlayoffResults(null);
      setUserRecord(null);
      setInjuryReport([]);

      const [status, dashboard, champs, standings, offseason, injuries, leaders] = await Promise.all([
  window.api.getCurrentWeek(),
  window.api.getDashboard(currentSeason),
  window.api.getChampions(),
  window.api.getStandings(currentSeason),
  window.api.getOffseasonStatus(),
  window.api.getInjuryReport(userTeam.id),
  window.api.getStats(currentSeason),
]);

      if (cancelled) return;

      const seasonDone     = status.hasSchedule && status.currentWeek === null;
      const champForSeason = champs.find((c: Champion) => c.season === currentSeason);

      setHasSchedule(status.hasSchedule);
      setCurrentWeek(status.currentWeek);
      setTopAFC(dashboard.topAFC);
      setTopNFC(dashboard.topNFC);
      setChampions(champs);
      setPendingResigns(offseason.pendingResigns ?? 0);
      setDraftComplete(offseason.draftComplete ?? false);
      setDraftGenerated(offseason.draftGenerated ?? false);
      setInjuryReport(injuries ?? []);
      setStatLeaders(leaders);

      if (offseason.playoffsComplete) onPlayoffsComplete();

      const myTeam = standings.find((t: any) => t.id === userTeam.id);
      if (myTeam) setUserRecord({ wins: myTeam.wins, losses: myTeam.losses });

      if (status.hasSchedule && !seasonDone) {
        const week = status.currentWeek!;
        setViewWeek(week);
        const data = await window.api.getWeekMatchups(week);
        if (!cancelled) setMatchups(data);
      } else if (seasonDone && !champForSeason) {
        const [seeds, weekData] = await Promise.all([
          window.api.getPlayoffSeeds(),
          window.api.getWeekMatchups(18),
        ]);
        if (!cancelled) { setPlayoffSeeds(seeds); setMatchups(weekData); setViewWeek(18); }
      } else if (seasonDone && champForSeason) {
        const [results, weekData] = await Promise.all([
          window.api.getPlayoffs(currentSeason),
          window.api.getWeekMatchups(18),
        ]);
        if (!cancelled) { setPlayoffResults(results); setMatchups(weekData); setViewWeek(18); }
      }

      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [currentSeason]);

  const refreshOffseasonStatus = async () => {
    const offseason = await window.api.getOffseasonStatus();
    setPendingResigns(offseason.pendingResigns ?? 0);
    setDraftComplete(offseason.draftComplete ?? false);
    setDraftGenerated(offseason.draftGenerated ?? false);
  };

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
  setSimulating(true);
  const weekResult = await window.api.simulateWeek(currentWeek);
  const [status, dashboard, standings, injuries] = await Promise.all([
    window.api.getCurrentWeek(),
    window.api.getDashboard(currentSeason),
    window.api.getStandings(currentSeason),
    window.api.getInjuryReport(userTeam.id),
  ]);
  setCurrentWeek(status.currentWeek);
  setTopAFC(dashboard.topAFC);
  setTopNFC(dashboard.topNFC);
  const mine = standings.find((t: any) => t.id === userTeam.id);
  if (mine) setUserRecord({ wins: mine.wins, losses: mine.losses });
  setInjuryReport(injuries ?? []);
  const data = await window.api.getWeekMatchups(viewWeek);
  setMatchups(data);

  if (weekResult?.userPSOpenSpots > 0) {
    setPSAlert(`Practice squad has ${weekResult.userPSOpenSpots} open spot${weekResult.userPSOpenSpots !== 1 ? 's' : ''}. Sign free agents in Franchise → Practice Squad tab.`);
  }
  setSimulating(false);
};

  const handleSimulatePlayoffs = async () => {
    setSimulatingPlayoffs(true);
    await window.api.simulatePlayoffs(currentSeason);
    const [champs, results] = await Promise.all([
      window.api.getChampions(),
      window.api.getPlayoffs(currentSeason),
    ]);
    setChampions(champs);
    setPlayoffResults(results);
    setPlayoffSeeds(null);
    onPlayoffsComplete();
    await refreshOffseasonStatus();
    setSimulatingPlayoffs(false);
  };

  const handleViewWeek = async (week: number) => {
    if (week < 1 || week > 18) return;
    setViewWeek(week);
    setBoxScore(null);
    const data = await window.api.getWeekMatchups(week);
    setMatchups(data);
  };

  const handleBoxScore = async (gameId: number) => {
    if (boxScore?.game?.id === gameId) { setBoxScore(null); return; }
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
    if (result.retired?.length > 0) setRetiredPlayers(result.retired);
    onSeasonAdvance(result.nextSeason);
  };

  const allWeeksDone    = hasSchedule && currentWeek === null;
  const currentChampion = champions.find(c => c.season === currentSeason);
  const playoffsComplete = !!currentChampion;
  const weekIsPlayed    = matchups.length > 0 && matchups.every(m => m.is_simulated === 1);

  if (loading) {
    return <div style={{ color: T.textMuted, padding: 40, fontFamily: 'monospace' }}>Loading...</div>;
  }

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'monospace', color: T.textPrimary, background: T.bgPage, minHeight: '100vh' }}>

      {/* ─── Header ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>{currentSeason} NFL Season</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
            {!hasSchedule
              ? 'No schedule generated yet'
              : allWeeksDone && playoffsComplete
              ? `${currentSeason} season complete`
              : allWeeksDone
              ? 'Regular season complete — playoffs ready'
              : `Week ${currentWeek} of 18 up next`}
          </div>
          {userRecord && (
            <div style={{ fontSize: 12, color: '#FF8740', marginTop: 4 }}>
              {userTeam.name}: {userRecord.wins}-{userRecord.losses}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {!hasSchedule && (
            <button onClick={handleGenerateSchedule} disabled={generatingSchedule} style={btn(T.bgGreen, '#4caf50', generatingSchedule)}>
              {generatingSchedule ? 'Generating...' : `▶ Start ${currentSeason} Season`}
            </button>
          )}
          {hasSchedule && currentWeek !== null && (
            <button onClick={handleSimulateWeek} disabled={simulating} style={btn(T.bgGreen, '#4caf50', simulating)}>
              {simulating ? `Simulating Week ${currentWeek}...` : `▶ Simulate Week ${currentWeek}`}
            </button>
          )}
          {allWeeksDone && !playoffsComplete && (
            <button onClick={handleSimulatePlayoffs} disabled={simulatingPlayoffs} style={btn('#1a2a2a', '#4FC3F7', simulatingPlayoffs)}>
              {simulatingPlayoffs ? 'Simulating Playoffs...' : '▶ Simulate Playoffs'}
            </button>
          )}
          {allWeeksDone && playoffsComplete && (
            <>
              {!confirming && (
                <button onClick={() => setConfirming(true)}
                  style={btn(T.bgCard, pendingResigns > 0 ? '#FF8740' : T.textPrimary, false, `1px solid ${T.borderStrong}`)}>
                  {pendingResigns > 0 ? `⚠ ${pendingResigns} pending — Advance anyway?` : `Advance to ${currentSeason + 1} →`}
                </button>
              )}
              {confirming && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: T.textMuted }}>Ages players + retires veterans. Confirm?</span>
                  <button onClick={handleAdvance} disabled={advancing} style={btn('#1a4a1a', '#4caf50', advancing)}>
                    {advancing ? 'Advancing...' : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirming(false)} style={btn(T.bgCard, T.textMuted, false)}>Cancel</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

  {/* Retirements */}
      {retiredPlayers.length > 0 && (
        <div style={{ background: T.bgRed, border: '1px solid #2a1a1a', borderRadius: 8, padding: '14px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#e57373', letterSpacing: 2 }}>RETIREMENTS — {currentSeason - 1} OFFSEASON</div>
            <button onClick={() => setRetiredPlayers([])} style={{ fontSize: 10, background: 'none', border: 'none', color: T.textDim, cursor: 'pointer' }}>dismiss</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
            {retiredPlayers.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ color: T.textMuted, fontSize: 10, width: 28 }}>{p.position}</span>
                <span style={{ color: T.textMuted }}>{p.name}</span>
                <span style={{ color: T.textDim, fontSize: 10, marginLeft: 'auto' }}>Age {p.age} · {p.ovr} OVR</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Offseason Checklist ─────────────────────── */}
      {allWeeksDone && playoffsComplete && (
        <div style={{ background: T.bgPage, border: `1px solid ${T.borderFaint}`, borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#FF8740', letterSpacing: 2 }}>OFFSEASON CHECKLIST</div>
            <button onClick={refreshOffseasonStatus}
              style={{ fontSize: 10, color: T.borderStrong, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              ↺ refresh
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
            <span style={{ fontSize: 16, width: 20, textAlign: 'center', color: pendingResigns === 0 ? '#4caf50' : '#FF8740' }}>
              {pendingResigns === 0 ? '✓' : '⚠'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: pendingResigns === 0 ? '#4caf50' : '#FF8740' }}>
                Re-signing Window {pendingResigns > 0 ? `— ${pendingResigns} decision${pendingResigns !== 1 ? 's' : ''} pending` : '— Complete'}
              </div>
              <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
                {pendingResigns > 0 ? 'Players on expiring contracts need a decision before the season ends' : 'All expiring contracts addressed'}
              </div>
            </div>
            <button onClick={() => onNavigate('franchise')} style={{
              padding: '4px 12px', background: T.bgPanel, border: `1px solid ${T.borderMid}`,
              borderRadius: 3, color: T.textMuted, fontSize: 10, cursor: 'pointer',
            }}>→ Franchise</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
            <span style={{ fontSize: 9, width: 20, textAlign: 'center', color: T.textDim }}>OPT</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: T.textMuted }}>
                Free Agency <span style={{ fontSize: 9, color: T.borderStrong, marginLeft: 6, letterSpacing: 1 }}>OPTIONAL</span>
              </div>
              <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>Sign replacements for departing players</div>
            </div>
            <button onClick={() => onNavigate('franchise')} style={{
              padding: '4px 12px', background: T.bgPanel, border: `1px solid ${T.borderMid}`,
              borderRadius: 3, color: T.textMuted, fontSize: 10, cursor: 'pointer',
            }}>→ Free Agents</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
            <span style={{ fontSize: 16, width: 20, textAlign: 'center', color: draftComplete ? '#4caf50' : T.textMuted }}>
              {draftComplete ? '✓' : '○'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: draftComplete ? '#4caf50' : T.textMuted }}>
                NFL Draft {draftComplete ? '— Complete' : draftGenerated ? '— In Progress' : '— Not Started'}
              </div>
              <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>
                {draftComplete ? '7 rounds complete — rookies added to rosters' : '7 rounds · reverse standings order · CPU auto-picks'}
              </div>
            </div>
            <button onClick={() => onNavigate('draft')} style={{
              padding: '4px 12px',
              background: draftComplete ? T.bgPanel : T.bgGreen,
              border: `1px solid ${draftComplete ? T.borderMid : '#1a4a1a'}`,
              borderRadius: 3, color: draftComplete ? T.textMuted : '#4caf50', fontSize: 10, cursor: 'pointer',
            }}>
              {draftComplete ? '→ View' : '→ Draft'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Body ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24 }}>

        {/* Main panel */}
        <div>
          {!hasSchedule ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: T.borderStrong }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏈</div>
              <div style={{ fontSize: 14, marginBottom: 6 }}>No schedule for {currentSeason} yet.</div>
              <div style={{ fontSize: 12 }}>Click "Start {currentSeason} Season" to generate all 18 weeks.</div>
            </div>
          ) : allWeeksDone && playoffsComplete ? (
            <PlayoffResultsView results={playoffResults} champion={currentChampion} />
          ) : allWeeksDone && !playoffsComplete ? (
            <PlayoffSeedingsView seeds={playoffSeeds} />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={() => handleViewWeek(viewWeek - 1)} disabled={viewWeek <= 1}
                  style={{ padding: '4px 12px', background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 4, color: viewWeek <= 1 ? T.borderStrong : T.textMuted, cursor: viewWeek <= 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}>←</button>
                <span style={{ fontSize: 13, color: T.textMuted, letterSpacing: 1 }}>WEEK {viewWeek}</span>
                <button onClick={() => handleViewWeek(viewWeek + 1)} disabled={viewWeek >= 18}
                  style={{ padding: '4px 12px', background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 4, color: viewWeek >= 18 ? T.borderStrong : T.textMuted, cursor: viewWeek >= 18 ? 'not-allowed' : 'pointer', fontSize: 12 }}>→</button>
                {matchups.length > 0 && (
                  <span style={{ fontSize: 10, color: weekIsPlayed ? '#4caf50' : '#FF8740', letterSpacing: 1 }}>
                    ● {weekIsPlayed ? 'FINAL' : 'UPCOMING'}
                  </span>
                )}
              </div>
              
              {psAlert && (
  <div style={{
    background: '#0d2a0d', border: '1px solid #4caf50', borderRadius: 6,
    padding: '10px 16px', marginBottom: 14,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  }}>
    <span style={{ color: '#4caf50', fontSize: 13 }}>⚠ {psAlert}</span>
    <button onClick={() => setPSAlert(null)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
  </div>
)}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {matchups.map(game => {
                  const played   = game.is_simulated === 1;
                  const homeWon  = played && (game.home_score ?? 0) > (game.away_score ?? 0);
                  const awayWon  = played && (game.away_score ?? 0) > (game.home_score ?? 0);
                  const expanded = boxScore?.game?.id === game.id;
                  const isUserGame = game.home_team_id === userTeam.id || game.away_team_id === userTeam.id;

                  return (
                    <div key={game.id} style={{ background: T.bgPage, border: `1px solid ${isUserGame ? '#1e2e1e' : T.bgCard}`, borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 8, padding: '10px 14px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {homeWon && <span style={{ color: '#4caf50', fontSize: 10 }}>▸</span>}
                          <span style={{ color: played ? (homeWon ? '#fff' : T.textMuted) : T.textPrimary, fontSize: 12 }}>{game.home_team}</span>
                        </div>
                        {played && <span style={{ fontSize: 15, fontWeight: 'bold', color: homeWon ? '#fff' : T.textMuted }}>{game.home_score}</span>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          <span style={{ color: played ? (awayWon ? '#fff' : T.textMuted) : T.textPrimary, fontSize: 12 }}>{game.away_team}</span>
                          {awayWon && <span style={{ color: '#4caf50', fontSize: 10 }}>▸</span>}
                        </div>
                        {played && <span style={{ fontSize: 15, fontWeight: 'bold', color: awayWon ? '#fff' : T.textMuted }}>{game.away_score}</span>}
                        {!played && (
                          <span style={{ fontSize: 9, color: isUserGame ? '#4caf50' : T.borderStrong, letterSpacing: 1, gridColumn: '2 / 5' }}>
                            {isUserGame ? '◆ YOUR GAME' : 'PREVIEW'}
                          </span>
                        )}
                      </div>
                      {played && (
                        <button onClick={() => handleBoxScore(game.id)} style={{
                          width: '100%', padding: '3px 0', background: expanded ? T.bgGreen : T.bgPage,
                          border: 'none', borderTop: `1px solid ${expanded ? '#1a381a' : T.bgInput}`,
                          color: expanded ? '#4caf50' : T.borderStrong, cursor: 'pointer', fontSize: 9, letterSpacing: 0.5,
                        }}>
                          {expanded ? '▲ BOX SCORE' : '▼ BOX SCORE'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {(boxScore || boxScoreLoading) && (
                <div style={{ marginTop: 16 }}>
                  {boxScoreLoading
                    ? <div style={{ color: T.borderStrong, fontSize: 12 }}>Loading box score...</div>
                    : boxScore ? <BoxScore data={boxScore} /> : null}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Injury Report */}
          {injuryReport.length > 0 && (
            <SidebarBlock title="INJURY REPORT">
              {injuryReport.map((p, i) => {
                const badge = injuryBadge(p.injury_status);
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${T.bgPanel}` }}>
                    <span style={{
                      fontSize: 9, fontWeight: 'bold', color: badge.color,
                      background: badge.bg, border: `1px solid ${badge.color}`,
                      borderRadius: 2, padding: '1px 4px', minWidth: 24, textAlign: 'center', flexShrink: 0,
                    }}>{badge.label}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.first_name[0]}. {p.last_name}
                        <span style={{ color: T.textDim, marginLeft: 5 }}>{p.position_label || p.position}</span>
                      </div>
                      <div style={{ fontSize: 9, color: T.textDim, marginTop: 1 }}>
                        {p.injury_type}{p.weeks_out > 0 ? ` · ${p.weeks_out}wk` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: T.textDim, flexShrink: 0 }}>{p.overall_rating}</span>
                  </div>
                );
              })}
            </SidebarBlock>
          )}

          {topAFC.length > 0 && (
            <SidebarBlock title="AFC LEADERS">
              {topAFC.map((t, i) => <SidebarRow key={i} left={t.team_name} right={`${t.wins}-${t.losses}`} />)}
            </SidebarBlock>
          )}
          {topNFC.length > 0 && (
            <SidebarBlock title="NFC LEADERS">
              {topNFC.map((t, i) => <SidebarRow key={i} left={t.team_name} right={`${t.wins}-${t.losses}`} />)}
            </SidebarBlock>
          )}
          {champions.length > 0 && (
            <SidebarBlock title="CHAMPIONS">
              {champions.slice(0, 6).map((c, i) => <SidebarRow key={i} left={String(c.season)} right={c.team_name} dimLeft />)}
            </SidebarBlock>
          )}
          {statLeaders && (statLeaders.passing?.length > 0 || statLeaders.rushing?.length > 0) && (
  <SidebarBlock title="SEASON LEADERS">
    {[
      { label: 'PASS YDS', p: statLeaders.passing?.[0], val: (p: any) => p.pass_yards?.toLocaleString() },
      { label: 'RUSH YDS', p: statLeaders.rushing?.[0], val: (p: any) => p.rush_yards?.toLocaleString() },
      { label: 'REC YDS', p: statLeaders.receiving?.[0], val: (p: any) => p.rec_yards?.toLocaleString() },
      { label: 'SACKS', p: statLeaders.sacks?.[0], val: (p: any) => Number(p.sacks ?? 0).toFixed(1) },
      { label: 'TACKLES', p: statLeaders.tackles?.[0], val: (p: any) => ((p.tackles ?? 0) + (p.assisted_tackles ?? 0)).toString() },
    ].filter(r => r.p).map(({ label, p, val }) => (
      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
        <span style={{ fontSize: 9, color: T.textDim, width: 52, flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 11, color: T.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player_name}</span>
        <span style={{ fontSize: 11, color: '#4FC3F7', fontWeight: 'bold', fontFamily: 'monospace' }}>{val(p)}</span>
      </div>
    ))}
  </SidebarBlock>
)}
          {topAFC.length === 0 && topNFC.length === 0 && (
            <div style={{ color: T.borderStrong, fontSize: 12 }}>Simulate games to see standings</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Playoff Seedings ─────────────────────────────────────────────────────────

function PlayoffSeedingsView({ seeds }: { seeds: { afc: SeedEntry[]; nfc: SeedEntry[] } | null }) {
  if (!seeds) return <div style={{ color: T.borderStrong, fontSize: 12 }}>Loading seeds...</div>;
  return (
    <div>
      <div style={{ fontSize: 11, color: T.textMuted, letterSpacing: 2, marginBottom: 16 }}>PLAYOFF SEEDINGS — TOP 7 PER CONFERENCE</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <SeedingList title="AFC" seeds={seeds.afc} />
        <SeedingList title="NFC" seeds={seeds.nfc} />
      </div>
    </div>
  );
}

function SeedingList({ title, seeds }: { title: string; seeds: SeedEntry[] }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 8 }}>{title}</div>
      {seeds.map((team, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid #111', fontSize: 12 }}>
          <span style={{ color: T.textDim, width: 16, textAlign: 'right' }}>{i + 1}</span>
          <span style={{ color: T.textPrimary, flex: 1 }}>{team.team_name}</span>
          <span style={{ color: T.textMuted }}>{team.wins}-{team.losses}</span>
          {i === 0 && <span style={{ fontSize: 9, color: '#FF8740', letterSpacing: 1 }}>BYE</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Playoff Results ──────────────────────────────────────────────────────────

function PlayoffResultsView({ results, champion }: { results: PlayoffGame[] | null; champion?: Champion }) {
  if (!results || results.length === 0) return <div style={{ color: T.borderStrong, fontSize: 12 }}>Loading playoff results...</div>;

  const rounds = [
    { week: 18, label: 'WILD CARD',                cols: 'repeat(3, 1fr)' },
    { week: 19, label: 'DIVISIONAL',               cols: 'repeat(4, 1fr)' },
    { week: 20, label: 'CONFERENCE CHAMPIONSHIPS', cols: 'repeat(2, 1fr)' },
    { week: 21, label: 'SUPER BOWL',               cols: '1fr' },
  ];

  return (
    <div>
      {champion && (
        <div style={{ background: T.bgPage, border: '1px solid #2a2a1a', borderRadius: 8, padding: '16px 20px', marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#FF8740', letterSpacing: 2, marginBottom: 6 }}>{champion.season} SUPER BOWL CHAMPION</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#FFD700' }}>🏆 {champion.team_name}</div>
        </div>
      )}
      {rounds.map(({ week, label, cols }) => {
        const games = results.filter(g => g.week === week);
        if (games.length === 0) return null;
        const isSB = week === 21;
        return (
          <div key={week} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 10 }}>{label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8 }}>
              {games.map((game, i) => {
                const homeWon = game.home_score > game.away_score;
                return (
                  <div key={i} style={{ background: T.bgPage, border: `1px solid ${isSB ? '#2a2a1a' : T.bgCard}`, borderRadius: 6, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ color: homeWon ? '#fff' : T.textMuted, fontSize: 12 }}>
                        {homeWon && <span style={{ color: '#4caf50', marginRight: 4 }}>▸</span>}{game.home_team}
                      </span>
                      <span style={{ fontWeight: 'bold', color: homeWon ? '#fff' : T.textMuted }}>{game.home_score}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: !homeWon ? '#fff' : T.textMuted, fontSize: 12 }}>
                        {!homeWon && <span style={{ color: '#4caf50', marginRight: 4 }}>▸</span>}{game.away_team}
                      </span>
                      <span style={{ fontWeight: 'bold', color: !homeWon ? '#fff' : T.textMuted }}>{game.away_score}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function SidebarBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: T.bgPage, border: `1px solid ${T.borderFaint}`, borderRadius: 6, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function SidebarRow({ left, right, dimLeft }: { left: string; right: string; dimLeft?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, borderBottom: `1px solid ${T.bgPanel}` }}>
      <span style={{ color: dimLeft ? T.textMuted : T.textMuted }}>{left}</span>
      <span style={{ color: T.textPrimary }}>{right}</span>
    </div>
  );
}

// ─── Box Score ────────────────────────────────────────────────────────────────

function BoxScore({ data }: { data: BoxScoreData }) {
  const { game, players } = data;
  const homeWon = game.home_score > game.away_score;
  return (
    <div style={{ background: '#0f0f0f', border: `1px solid ${T.borderFaint}`, borderRadius: 6, padding: '14px' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[
          { name: game.home_team, score: game.home_score, won: homeWon,  side: 'HOME' },
          { name: game.away_team, score: game.away_score, won: !homeWon, side: 'AWAY' },
        ].map((t, i) => (
          <div key={i} style={{ flex: 1, background: T.bgPage, borderRadius: 4, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 1, marginBottom: 4 }}>{t.side}</div>
            <div style={{ fontSize: 12, color: T.textMuted }}>{t.name}</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: t.won ? '#fff' : T.textDim }}>{t.score}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TeamStats teamName={game.home_team} players={players.filter(p => p.team_id === game.home_team_id)} />
        <TeamStats teamName={game.away_team} players={players.filter(p => p.team_id === game.away_team_id)} />
      </div>
    </div>
  );
}

function TeamStats({ teamName, players }: { teamName: string; players: BoxScorePlayer[] }) {
  const passers   = players.filter(p => p.pass_attempts > 0).sort((a, b) => b.pass_yards - a.pass_yards);
  const rushers   = players.filter(p => p.rush_attempts > 0).sort((a, b) => b.rush_yards - a.rush_yards).slice(0, 3);
  const receivers = players.filter(p => p.targets > 0).sort((a, b) => b.rec_yards - a.rec_yards).slice(0, 4);
  const nickname  = teamName.split(' ').pop()?.toUpperCase() ?? teamName;
  return (
    <div>
      <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1, marginBottom: 8 }}>{nickname}</div>
      {passers.length > 0 && (
        <StatSection title="PASSING">
          {passers.map((p, i) => <StatRow key={i} name={p.player_name} line={`${p.completions}/${p.pass_attempts} ${p.pass_yards}yd ${p.pass_tds}td`} />)}
        </StatSection>
      )}
      {rushers.length > 0 && (
        <StatSection title="RUSHING">
          {rushers.map((p, i) => <StatRow key={i} name={p.player_name} line={`${p.rush_attempts}car ${p.rush_yards}yd ${p.rush_tds}td`} />)}
        </StatSection>
      )}
      {receivers.length > 0 && (
        <StatSection title="RECEIVING">
          {receivers.map((p, i) => <StatRow key={i} name={p.player_name} line={`${p.receptions}/${p.targets} ${p.rec_yards}yd ${p.rec_tds}td`} />)}
        </StatSection>
      )}
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, color: T.borderStrong, letterSpacing: 1, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function StatRow({ name, line }: { name: string; line: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '2px 0', borderBottom: '1px solid #111' }}>
      <span style={{ color: T.textMuted }}>{name}</span>
      <span style={{ color: T.textMuted }}>{line}</span>
    </div>
  );
}
