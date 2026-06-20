import React, { useEffect, useState } from 'react';
import { T } from './theme';
import { Matchup, BoxScoreData, StandingEntry, Champion, SeedEntry, PlayoffGame, InjuredPlayer, FranchiseHealth } from './home/types';
import OffseasonChecklist from './home/OffseasonChecklist';
import Sidebar from './home/Sidebar';
import PlayoffSeedingsView from './home/PlayoffSeedingsView';
import PlayoffResultsView from './home/PlayoffResultsView';
import SeasonAwardsView from './home/SeasonAwardsView';
import { useGameStore } from './store/gameStore';
import TradeOfferCard from './home/TradeOfferCard';
import { CpuOffer } from './trades/types';

declare const window: any;

interface Props {
  onSeasonAdvance: (nextSeason: number) => void;
  onNavigate: (tab: string) => void;
}

const ovrColor = (v: number) => v >= 80 ? '#4caf50' : v >= 70 ? '#FF8740' : '#e57373';
const ovrGrade = (v: number) => v >= 90 ? 'A+' : v >= 85 ? 'A' : v >= 80 ? 'B+' : v >= 75 ? 'B' : v >= 70 ? 'C+' : v >= 65 ? 'C' : 'D';

export default function Home({ onSeasonAdvance, onNavigate }: Props) {
  const { userTeam, currentSeason, setPlayoffsComplete, incrementSimCount } = useGameStore();

  const [loading, setLoading] = useState(true);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<number | null>(null);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [simulatingGameId, setSimulatingGameId] = useState<number | null>(null);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [boxScore, setBoxScore] = useState<BoxScoreData | null>(null);
  const [boxScoreLoading, setBoxScoreLoading] = useState(false);
  const [topAFC, setTopAFC] = useState<StandingEntry[]>([]);
  const [topNFC, setTopNFC] = useState<StandingEntry[]>([]);
  const [champions, setChampions] = useState<Champion[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [playoffSeeds, setPlayoffSeeds] = useState<{ afc: SeedEntry[]; nfc: SeedEntry[] } | null>(null);
  const [playoffResults, setPlayoffResults] = useState<PlayoffGame[] | null>(null);
  const [simulatingPlayoffs, setSimulatingPlayoffs] = useState(false);
  const [userRecord, setUserRecord] = useState<{ wins: number; losses: number } | null>(null);
  const [pendingResigns, setPendingResigns] = useState(0);
  const [draftComplete, setDraftComplete] = useState(false);
  const [draftGenerated, setDraftGenerated] = useState(false);
  const [faOpen, setFaOpen] = useState(false);
  const [rosterSize, setRosterSize] = useState(0);
  const [injuryReport, setInjuryReport] = useState<InjuredPlayer[]>([]);
  const [retiredPlayers, setRetiredPlayers] = useState<{ name: string; position: string; age: number; ovr: number }[]>([]);
  const [statLeaders, setStatLeaders] = useState<any>(null);
  const [psAlert, setPSAlert] = useState<string | null>(null);
  const [seasonAwards, setSeasonAwards] = useState<any>(null);
  const [cpuOffer, setCpuOffer] = useState<CpuOffer | null>(null);
  const [offerHandled, setOfferHandled] = useState(false);
  const [offerWorking, setOfferWorking] = useState(false);
  const [userTradeStatus, setUserTradeStatus] = useState<any>(null);
  const [settingStatus, setSettingStatus] = useState(false);
  const [franchiseHealth, setFranchiseHealth] = useState<FranchiseHealth | null>(null);

  useEffect(() => {
    if (!userTeam) return;
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      setBoxScore(null); setConfirming(false); setPlayoffSeeds(null);
      setPlayoffResults(null); setUserRecord(null); setInjuryReport([]);
      setSeasonAwards(null);

      const [status, dashboard, champs, standings, offseason, injuries, leaders, tradeOffer, tradeStatus, spots, health] = await Promise.all([
        window.api.getCurrentWeek(),
        window.api.getDashboard(currentSeason),
        window.api.getChampions(),
        window.api.getStandings(currentSeason),
        window.api.getOffseasonStatus(),
        window.api.getInjuryReport(userTeam.id),
        window.api.getStats(currentSeason),
        window.api.getCpuTradeOffer(),
        window.api.getTeamStatus(userTeam.id),
        window.api.getRosterSpots(userTeam.id),
        window.api.getFranchiseHealth(userTeam.id),
      ]);
      if (cancelled) return;

      const seasonDone = status.hasSchedule && status.currentWeek === null;
      const champForSeason = champs.find((c: Champion) => c.season === currentSeason);

      setHasSchedule(status.hasSchedule);
      setCurrentWeek(status.currentWeek);
      setTopAFC(dashboard.topAFC);
      setTopNFC(dashboard.topNFC);
      setChampions(champs);
      setPendingResigns(offseason.pendingResigns ?? 0);
      setDraftComplete(offseason.draftComplete ?? false);
      setDraftGenerated(offseason.draftGenerated ?? false);
      setFaOpen(offseason.faOpen ?? false);
      setRosterSize(spots?.active ?? 0);
      setInjuryReport(injuries ?? []);
      setStatLeaders(leaders);
      setCpuOffer(tradeOffer ?? null);
      setOfferHandled(false);
      setUserTradeStatus(tradeStatus ?? null);
      setFranchiseHealth(health ?? null);

      if (offseason.playoffsComplete) setPlayoffsComplete(true);

      const myTeam = standings.find((t: any) => t.id === userTeam.id);
      if (myTeam) setUserRecord({ wins: myTeam.wins, losses: myTeam.losses });

      if (status.hasSchedule && !seasonDone) {
        const data = await window.api.getWeekMatchups(status.currentWeek);
        if (!cancelled) setMatchups(data);
      } else if (seasonDone && !champForSeason) {
        const [seeds, weekData] = await Promise.all([window.api.getPlayoffSeeds(), window.api.getWeekMatchups(18)]);
        if (!cancelled) { setPlayoffSeeds(seeds); setMatchups(weekData); }
      } else if (seasonDone && champForSeason) {
        const [results, weekData, awards] = await Promise.all([
          window.api.getPlayoffs(currentSeason),
          window.api.getWeekMatchups(18),
          window.api.getSeasonAwards(currentSeason),
        ]);
        if (!cancelled) { setPlayoffResults(results); setMatchups(weekData); setSeasonAwards(awards); }
      }

      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [currentSeason, userTeam?.id]);

  const refreshOffseasonStatus = async () => {
    const [offseason, spots] = await Promise.all([
      window.api.getOffseasonStatus(),
      userTeam ? window.api.getRosterSpots(userTeam.id) : Promise.resolve(null),
    ]);
    setPendingResigns(offseason.pendingResigns ?? 0);
    setDraftComplete(offseason.draftComplete ?? false);
    setDraftGenerated(offseason.draftGenerated ?? false);
    setFaOpen(offseason.faOpen ?? false);
    if (spots) setRosterSize(spots.active ?? 0);
  };

  const handleGenerateSchedule = async () => {
    setGeneratingSchedule(true);
    await window.api.generateSchedule();
    const status = await window.api.getCurrentWeek();
    setHasSchedule(status.hasSchedule);
    setCurrentWeek(status.currentWeek);
    setMatchups(await window.api.getWeekMatchups(status.currentWeek));
    const tradeOffer = await window.api.getCpuTradeOffer();
    setCpuOffer(tradeOffer ?? null);
    setOfferHandled(false);
    setGeneratingSchedule(false);
  };

  const handleSimulateWeek = async () => {
    if (currentWeek === null || !userTeam) return;
    setSimulating(true);
    const weekResult = await window.api.simulateWeek(currentWeek);
    const [status, dashboard, standings, injuries] = await Promise.all([
      window.api.getCurrentWeek(), window.api.getDashboard(currentSeason),
      window.api.getStandings(currentSeason), window.api.getInjuryReport(userTeam.id),
    ]);
    setCurrentWeek(status.currentWeek);
    setTopAFC(dashboard.topAFC); setTopNFC(dashboard.topNFC);
    setInjuryReport(injuries ?? []);
    const mine = standings.find((t: any) => t.id === userTeam.id);
    if (mine) setUserRecord({ wins: mine.wins, losses: mine.losses });
    if (weekResult?.userPSOpenSpots > 0)
      setPSAlert(`Practice squad has ${weekResult.userPSOpenSpots} open spot${weekResult.userPSOpenSpots !== 1 ? 's' : ''}. Go to My Team → Practice Squad.`);
    if (status.currentWeek === null && status.hasSchedule) {
      const seeds = await window.api.getPlayoffSeeds();
      setPlayoffSeeds(seeds);
      setMatchups(await window.api.getWeekMatchups(18));
    } else if (status.currentWeek) {
      setMatchups(await window.api.getWeekMatchups(status.currentWeek));
    }
    setStatLeaders(await window.api.getStats(currentSeason));
    setFranchiseHealth(await window.api.getFranchiseHealth(userTeam.id));
    setBoxScore(null);
    incrementSimCount();
    setSimulating(false);
  };

  const handleSimulateGame = async (gameId: number) => {
    if (!userTeam) return;
    setSimulatingGameId(gameId);
    const result = await window.api.simulateOneGame(gameId);
    if (!result?.success) { setSimulatingGameId(null); return; }
    const [status, dashboard, standings, injuries] = await Promise.all([
      window.api.getCurrentWeek(), window.api.getDashboard(currentSeason),
      window.api.getStandings(currentSeason), window.api.getInjuryReport(userTeam.id),
    ]);
    setCurrentWeek(status.currentWeek); setTopAFC(dashboard.topAFC); setTopNFC(dashboard.topNFC);
    setInjuryReport(injuries ?? []);
    const mine = standings.find((t: any) => t.id === userTeam.id);
    if (mine) setUserRecord({ wins: mine.wins, losses: mine.losses });
    if (result.userPSOpenSpots > 0)
      setPSAlert(`Practice squad has ${result.userPSOpenSpots} open spot${result.userPSOpenSpots !== 1 ? 's' : ''}. Go to My Team → Practice Squad.`);
    if (result.weekComplete) {
      setStatLeaders(await window.api.getStats(currentSeason));
      if (status.currentWeek === null && status.hasSchedule) {
        setPlayoffSeeds(await window.api.getPlayoffSeeds());
        setMatchups(await window.api.getWeekMatchups(18));
      } else if (status.currentWeek) {
        setMatchups(await window.api.getWeekMatchups(status.currentWeek));
      }
    } else if (currentWeek) {
      setMatchups(await window.api.getWeekMatchups(currentWeek));
    }
    setFranchiseHealth(await window.api.getFranchiseHealth(userTeam.id));
    setSimulatingGameId(null);
  };

  const handleBoxScore = async (gameId: number) => {
    if (boxScore?.game?.id === gameId) { setBoxScore(null); return; }
    setBoxScoreLoading(true);
    const data = await window.api.getGameBoxScore(gameId);
    setBoxScore(data);
    setBoxScoreLoading(false);
  };

  const handleSimulatePlayoffs = async () => {
    setSimulatingPlayoffs(true);
    const results = await window.api.simulatePlayoffs(currentSeason);
    setPlayoffResults(results);
    const champs = await window.api.getChampions();
    setChampions(champs);
    const champForSeason = champs.find((c: Champion) => c.season === currentSeason);
    if (champForSeason) {
      setPlayoffsComplete(true);
      const awards = await window.api.getSeasonAwards(currentSeason);
      setSeasonAwards(awards);
    }
    setSimulatingPlayoffs(false);
  };

  const handleAdvance = async () => {
    setAdvancing(true);
    const result = await window.api.advanceSeason();
    const retired = result?.retiredPlayers ?? [];
    setRetiredPlayers(retired);
    onSeasonAdvance(result.nextSeason);
    setAdvancing(false);
    setConfirming(false);
  };

  const handleOpenFreeAgency = async () => {
    await window.api.openFreeAgency();
    await refreshOffseasonStatus();
  };

  const handleAcceptOffer = async () => {
    if (!cpuOffer || offerWorking) return;
    setOfferWorking(true);
    await window.api.acceptCpuTradeOffer({
  myPlayerId: cpuOffer.requestedPlayer.id,
  theirPlayerId: cpuOffer.offeredPlayer.id,
  theirTeamId: cpuOffer.fromTeamId,
  theirPickId: cpuOffer.offeredPick?.id ?? null,
});
    setCpuOffer(null);
    setOfferHandled(true);
    setOfferWorking(false);
  };

  const handleDeclineOffer = async () => {
    if (!cpuOffer || offerWorking) return;
    setOfferWorking(true);
    setCpuOffer(null);
    setOfferHandled(true);
    setOfferWorking(false);
  };

  const handleSetTradeStatus = async (status: string) => {
    setSettingStatus(true);
    await window.api.setTradeStatus(userTeam!.id, status);
    const updated = await window.api.getTeamStatus(userTeam!.id);
    setUserTradeStatus(updated);
    setSettingStatus(false);
  };

  const allWeeksDone = hasSchedule && currentWeek === null;
  const currentChampion = champions.find(c => c.season === currentSeason);
  const isPlayoffsComplete = !!currentChampion;

  const userGame = matchups.find(m => m.home_team_id === userTeam?.id || m.away_team_id === userTeam?.id);
  const isHome = userGame?.home_team_id === userTeam?.id;
  const userScore = isHome ? userGame?.home_score : userGame?.away_score;
  const oppScore = isHome ? userGame?.away_score : userGame?.home_score;
  const oppTeamName = isHome ? userGame?.away_team : userGame?.home_team;
  const isGameSimmed = (userGame?.is_simulated ?? 0) === 1;
  const userWon = isGameSimmed && (userScore ?? 0) > (oppScore ?? 0);

  const seriousInjuries = injuryReport.filter(p => p.injury_status === 'ir' || p.injury_status === 'out');

  if (loading || !userTeam)
    return <div style={{ color: T.textMuted, padding: 40, textAlign: 'center' }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Trade offer */}
        {cpuOffer && !offerHandled && (
          <TradeOfferCard
            offer={cpuOffer} currentSeason={currentSeason} working={offerWorking}
            onAccept={handleAcceptOffer} onDecline={handleDeclineOffer}
            onViewDetails={() => onNavigate('trades')}
          />
        )}

        {/* Week card */}
        {hasSchedule && !allWeeksDone && userGame && (
          <div style={{ background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: T.textMuted, marginBottom: 16, textTransform: 'uppercase' }}>
              Your Game — Week {currentWeek}
            </div>

            {!isGameSimmed ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#4FC3F7' }}>{userTeam.city} {userTeam.name}</div>
                    <div style={{ fontSize: 9, color: T.textDim, marginTop: 3, letterSpacing: 1 }}>{isHome ? 'HOME' : 'AWAY'}</div>
                  </div>
                  <div style={{ fontSize: 14, color: T.borderStrong, fontWeight: 700, fontFamily: 'monospace' }}>VS</div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#aaa' }}>{oppTeamName}</div>
                    <div style={{ fontSize: 9, color: T.textDim, marginTop: 3, letterSpacing: 1 }}>{isHome ? 'AWAY' : 'HOME'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => handleSimulateGame(userGame.id)}
                    disabled={!!simulating || !!simulatingGameId}
                    style={{
                      flex: 1, padding: '10px 0',
                      background: simulatingGameId === userGame.id ? '#1a3a1a' : '#0a2a0a',
                      border: '1px solid #4caf50', borderRadius: 5, color: '#4caf50',
                      fontWeight: 700, fontSize: 12, cursor: (simulating || !!simulatingGameId) ? 'not-allowed' : 'pointer',
                      opacity: (simulating || !!simulatingGameId) ? 0.5 : 1,
                    }}
                  >
                    {simulatingGameId === userGame.id ? 'Simulating...' : '▶ Sim My Game'}
                  </button>
                  <button
                    onClick={handleSimulateWeek}
                    disabled={!!simulating || !!simulatingGameId}
                    style={{
                      flex: 1, padding: '10px 0', background: T.bgCard,
                      border: `1px solid ${T.borderMid}`, borderRadius: 5, color: T.textMuted,
                      fontWeight: 700, fontSize: 12, cursor: (simulating || !!simulatingGameId) ? 'not-allowed' : 'pointer',
                      opacity: (simulating || !!simulatingGameId) ? 0.5 : 1,
                    }}
                  >
                    {simulating ? 'Simulating Week...' : '▶ Sim Full Week'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>{userTeam.city} {userTeam.name}</div>
                    <div style={{ fontSize: 40, fontWeight: 900, color: userWon ? '#4caf50' : '#e57373', fontFamily: 'monospace' }}>{userScore}</div>
                  </div>
                  <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1 }}>FINAL</div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 4 }}>{oppTeamName}</div>
                    <div style={{ fontSize: 40, fontWeight: 900, color: !userWon ? '#4caf50' : '#e57373', fontFamily: 'monospace' }}>{oppScore}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: userWon ? '#4caf50' : '#e57373', marginBottom: 12, letterSpacing: 2 }}>
                  {userWon ? 'VICTORY' : 'DEFEAT'}
                </div>
                <button
                  onClick={() => handleBoxScore(userGame.id)}
                  disabled={boxScoreLoading}
                  style={{ width: '100%', padding: '8px 0', background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 4, color: T.textMuted, cursor: 'pointer', fontSize: 11 }}
                >
                  {boxScoreLoading ? 'Loading...' : boxScore?.game?.id === userGame.id ? '▲ Hide Box Score' : '▼ View Box Score'}
                </button>
                {boxScore && boxScore.game.id === userGame.id && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${T.borderFaint}`, paddingTop: 12 }}>
                    {[
                      { label: 'PASSING',   rows: boxScore.players.filter(p => p.pass_attempts > 0).sort((a, b) => b.pass_yards - a.pass_yards).slice(0, 4),  cols: ['pass_yards','completions','pass_attempts','pass_tds','interceptions'], heads: ['YDS','CMP','ATT','TD','INT'] },
                      { label: 'RUSHING',   rows: boxScore.players.filter(p => p.rush_attempts > 0).sort((a, b) => b.rush_yards - a.rush_yards).slice(0, 4),  cols: ['rush_yards','rush_attempts','rush_tds'], heads: ['YDS','CAR','TD'] },
                      { label: 'RECEIVING', rows: boxScore.players.filter(p => p.targets > 0).sort((a, b) => b.rec_yards - a.rec_yards).slice(0, 4),           cols: ['rec_yards','receptions','targets','rec_tds'], heads: ['YDS','REC','TGT','TD'] },
                    ].filter(s => s.rows.length > 0).map(section => (
                      <div key={section.label} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1.5, marginBottom: 4 }}>{section.label}</div>
                        {section.rows.map((p, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                            <span style={{ color: '#aaa', flex: 2 }}>{p.player_name}</span>
                            {section.cols.map(col => (
                              <span key={col} style={{ color: '#4FC3F7', fontFamily: 'monospace', minWidth: 30, textAlign: 'right' }}>{(p as any)[col] ?? 0}</span>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Roster Health */}
        {hasSchedule && !allWeeksDone && franchiseHealth && franchiseHealth.overall_ovr > 0 && (
          <div style={{ background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: T.textMuted, marginBottom: 12, textTransform: 'uppercase' }}>Roster Health</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[
                { label: 'OFFENSE', value: franchiseHealth.offense_ovr },
                { label: 'DEFENSE', value: franchiseHealth.defense_ovr },
                { label: 'OVERALL', value: franchiseHealth.overall_ovr },
              ].map(({ label, value }) => (
                <div key={label} style={{ flex: 1, textAlign: 'center', background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 6, padding: '8px 0' }}>
                  <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: ovrColor(value) }}>{value}</div>
                  <div style={{ fontSize: 9, color: ovrColor(value), opacity: 0.7 }}>{ovrGrade(value)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {franchiseHealth.groups.map(g => (
                <div key={g.group} style={{ textAlign: 'center', background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 4, padding: '4px 0' }}>
                  <div style={{ fontSize: 7, color: T.textMuted }}>{g.group}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: ovrColor(g.avg_ovr) }}>{g.avg_ovr}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Alerts */}
        {hasSchedule && !allWeeksDone && (seriousInjuries.length > 0 || psAlert) && (
          <div style={{ background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '14px 20px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: T.textMuted, marginBottom: 10, textTransform: 'uppercase' }}>Active Alerts</div>
            {seriousInjuries.slice(0, 5).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, minWidth: 26, textAlign: 'center',
                  background: p.injury_status === 'ir' ? '#1a0a0a' : '#140a00',
                  color: p.injury_status === 'ir' ? '#e57373' : '#FF8740',
                }}>
                  {p.injury_status === 'ir' ? 'IR' : 'OUT'}
                </span>
                <span style={{ fontSize: 12, color: T.textSecondary, flex: 1 }}>{p.first_name[0]}. {p.last_name}</span>
                <span style={{ fontSize: 10, color: T.textMuted }}>{p.position_label || p.position}</span>
                <span style={{ fontSize: 10, color: T.textDim }}>{p.injury_type}{p.weeks_out > 0 ? ` · ${p.weeks_out}wk` : ''}</span>
              </div>
            ))}
            {psAlert && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
                <span style={{ fontSize: 11, color: '#FF8740' }}>⚠ {psAlert}</span>
                <button onClick={() => setPSAlert(null)} style={{ fontSize: 9, color: T.textDim, background: 'none', border: 'none', cursor: 'pointer' }}>dismiss</button>
              </div>
            )}
          </div>
        )}

        {/* Playoff seedings */}
        {allWeeksDone && !isPlayoffsComplete && (
          <PlayoffSeedingsView seeds={playoffSeeds} onSimulate={handleSimulatePlayoffs} simulating={simulatingPlayoffs} />
        )}

        {/* Post-season */}
        {allWeeksDone && isPlayoffsComplete && (
          <>
            <SeasonAwardsView awards={seasonAwards} season={currentSeason} />
            <OffseasonChecklist
              pendingResigns={pendingResigns}
              draftComplete={draftComplete}
              draftGenerated={draftGenerated}
              faOpen={faOpen}
              rosterSize={rosterSize}
              refreshOffseasonStatus={refreshOffseasonStatus}
              onNavigate={onNavigate}
              onOpenFreeAgency={handleOpenFreeAgency}
            />
            <PlayoffResultsView results={playoffResults} champion={currentChampion} />
          </>
        )}
      </div>

      {/* Sidebar */}
      <Sidebar
        userTeam={userTeam}
        currentSeason={currentSeason}
        userRecord={userRecord}
        hasSchedule={hasSchedule}
        allWeeksDone={allWeeksDone}
        isPlayoffsComplete={isPlayoffsComplete}
        currentWeek={currentWeek}
        matchups={matchups}
        simulating={simulating}
        simulatingPlayoffs={simulatingPlayoffs}
        generatingSchedule={generatingSchedule}
        advancing={advancing}
        confirming={confirming}
        pendingResigns={pendingResigns}
        retiredPlayers={retiredPlayers}
        setRetiredPlayers={setRetiredPlayers}
        injuryReport={injuryReport}
        topAFC={topAFC}
        topNFC={topNFC}
        champions={champions}
        statLeaders={statLeaders}
        userTradeStatus={userTradeStatus}
        settingStatus={settingStatus}
        onGenerateSchedule={handleGenerateSchedule}
        onSimulateWeek={handleSimulateWeek}
        onSimulatePlayoffs={handleSimulatePlayoffs}
        onConfirm={() => setConfirming(true)}
        onCancelConfirm={() => setConfirming(false)}
        onAdvance={handleAdvance}
        onSetTradeStatus={handleSetTradeStatus}
      />
    </div>
  );
}
