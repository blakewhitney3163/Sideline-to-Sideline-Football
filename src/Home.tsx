import React, { useEffect, useState } from 'react';
import { T } from './theme';
import { Matchup, BoxScoreData, StandingEntry, Champion, SeedEntry, PlayoffGame, InjuredPlayer, FranchiseHealth } from './home/types';
import OffseasonChecklist from './home/OffseasonChecklist';
import Sidebar from './home/Sidebar';
import PlayoffSeedingsView from './home/PlayoffSeedingsView';
import PlayoffBracketView from './home/PlayoffBracketView';
import PlayoffResultsView from './home/PlayoffResultsView';
import SeasonAwardsView from './home/SeasonAwardsView';
import GamePreview from './home/GamePreview';
import GameWeekPrep from './home/GameWeekPrep';
import PreSeasonStaffPanel from './home/PreSeasonStaffPanel';
import { useGameStore } from './store/gameStore';
import TradeOfferCard from './home/TradeOfferCard';
import ChemistryPanel from './home/ChemistryPanel';
import { CpuOffer } from './trades/types';
import { NewsEvent } from './newsCenter/types';

declare const window: any;

interface Props {
  onSeasonAdvance: (nextSeason: number) => void;
  onNavigate: (tab: string) => void;
}

interface PSPromotionAlert {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  ps_ovr: number;
  lowest_active_ovr: number;
}

interface AnnouncingRetirement {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  age: number;
  overall_rating: number;
  annual_salary: number | null;
}

const ovrColor = (v: number) => v >= 80 ? '#4caf50' : v >= 70 ? '#FF8740' : '#e57373';
const ovrGrade = (v: number) => v >= 90 ? 'A+' : v >= 85 ? 'A' : v >= 80 ? 'B+' : v >= 75 ? 'B' : v >= 70 ? 'C+' : v >= 65 ? 'C' : 'D';

const NEWS_ICON: Record<string, string> = {
  retirement: '🏁', hof: '🏛', signing: '✍️', resign: '🔄', release: '✂️',
  trade: '🤝', injury: '🩹', draft_pick: '📋', cpu_signing: '✍️',
  champion: '🏆', milestone: '⭐', award: '🏅', contract: '📝',
  contract_demand: '💰',
};
const newsIcon = (type: string) => NEWS_ICON[type] ?? '📰';
const newsWeekLabel = (week: number) =>
  week === 0 ? 'Offseason' : week >= 19 ? 'Playoffs' : `Wk ${week}`;

export default function Home({ onSeasonAdvance, onNavigate }: Props) {
  const { userTeam, currentSeason, setPlayoffsComplete, incrementSimCount, simCount } = useGameStore();

  const [loading, setLoading] = useState(true);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<number | null>(null);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [simulatingGameId, setSimulatingGameId] = useState<number | null>(null);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [boxScore, setBoxScore] = useState<BoxScoreData | null>(null);
  const [boxScoreLoading, setBoxScoreLoading] = useState(false);
  const [boxScorePlayLog, setBoxScorePlayLog] = useState<any[]>([]);
  const [showBoxScorePlayLog, setShowBoxScorePlayLog] = useState(false);
  const [topAFC, setTopAFC] = useState<StandingEntry[]>([]);
  const [topNFC, setTopNFC] = useState<StandingEntry[]>([]);
  const [champions, setChampions] = useState<Champion[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [playoffSeeds, setPlayoffSeeds] = useState<{ afc: SeedEntry[]; nfc: SeedEntry[] } | null>(null);
  const [playoffResults, setPlayoffResults] = useState<PlayoffGame[] | null>(null);
  const [simulatingPlayoffs, setSimulatingPlayoffs] = useState(false);
  const [playoffState, setPlayoffState] = useState<any>(null);
  const [simulatingPlayoffGameId, setSimulatingPlayoffGameId] = useState<number | null>(null);
  const [userRecord, setUserRecord] = useState<{ wins: number; losses: number } | null>(null);
  const [pendingResigns, setPendingResigns] = useState(0);
  const [draftComplete, setDraftComplete] = useState(false);
  const [draftGenerated, setDraftGenerated] = useState(false);
  const [faOpen, setFaOpen] = useState(false);
    const [offseasonPhase, setOffseasonPhase] = useState('resign');
  const [cpuFaDone, setCpuFaDone] = useState(false);
  const [cpuFaResult, setCpuFaResult] = useState<{ totalSigned: number; teamsActive: number } | null>(null);
  const [rosterSize, setRosterSize] = useState(0);
  const [injuryReport, setInjuryReport] = useState<InjuredPlayer[]>([]);
  const [retiredPlayers, setRetiredPlayers] = useState<{ name: string; position: string; age: number; ovr: number }[]>([]);
  const [statLeaders, setStatLeaders] = useState<any>(null);
  const [psAlert, setPSAlert] = useState<string | null>(null);
  const [psPromotionAlerts, setPSPromotionAlerts] = useState<PSPromotionAlert[]>([]);
  const [announcingRetirements, setAnnouncingRetirements] = useState<AnnouncingRetirement[]>([]);
  const [seasonAwards, setSeasonAwards] = useState<any>(null);
  const [cpuOffers, setCpuOffers] = useState<CpuOffer[]>([]);
  const [offerWorking, setOfferWorking] = useState(false);
  const [userTradeStatus, setUserTradeStatus] = useState<any>(null);
  const [settingStatus, setSettingStatus] = useState(false);
  const [franchiseHealth, setFranchiseHealth] = useState<FranchiseHealth | null>(null);
  const [oppHealth, setOppHealth] = useState<FranchiseHealth | null>(null);
  const [oppScheme, setOppScheme] = useState<{ offenseScheme: string; defenseScheme: string } | null>(null);
  const [userScheme, setUserScheme] = useState<{ offenseScheme: string; defenseScheme: string } | null>(null);
  const [allStandings, setAllStandings] = useState<{ id: number; wins: number; losses: number }[]>([]);
  const [recentNews, setRecentNews] = useState<NewsEvent[]>([]);
  const [teamChemistry, setTeamChemistry] = useState<{ chemistry: number; events: { id: number; week: number; delta: number; reason: string }[]; archetypes: { archetype: string; count: number }[] } | null>(null);
    const [staffSetupComplete, setStaffSetupComplete] = useState(false);
  const [ownerGoals, setOwnerGoals] = useState<any[]>([]);
  const [ownerPatience, setOwnerPatience] = useState<number>(75);

    const fetchRecentNews = async () => {
    const news = await window.api.getNewsFeed({ season: currentSeason, limit: 6 });
    setRecentNews(news ?? []);
  };

  const fetchOwnerData = async () => {
    const [goals, patience] = await Promise.all([
      window.seasonApi.getOwnerGoals(currentSeason),
      window.seasonApi.getOwnerPatience(),
    ]);
    setOwnerGoals(Array.isArray(goals) ? goals : []);
    setOwnerPatience(typeof patience === 'number' ? patience : 75);
  };

  useEffect(() => {
    if (!userTeam) return;
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      setBoxScore(null); setBoxScorePlayLog([]); setConfirming(false); setPlayoffSeeds(null);
      setPlayoffResults(null); setUserRecord(null); setInjuryReport([]);
      setSeasonAwards(null); setStaffSetupComplete(false);

      const [status, dashboard, champs, standings, offseason, injuries, leaders, tradeOffers, tradeStatus, spots, health, psAlerts, announcingRets, news, chemistry] = await Promise.all([
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
        window.api.getPSPromotionAlerts(userTeam.id),
        window.api.getAnnouncingRetirements(),
        window.api.getNewsFeed({ season: currentSeason, limit: 6 }),
        window.api.getTeamChemistry(userTeam.id),
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
      setOffseasonPhase(offseason.offseasonPhase ?? 'resign');
      setRosterSize(spots?.active ?? 0);
      setInjuryReport(injuries ?? []);
      setStatLeaders(leaders);
      setCpuOffers(Array.isArray(tradeOffers) ? tradeOffers : tradeOffers ? [tradeOffers] : []);
      setUserTradeStatus(tradeStatus ?? null);
      setFranchiseHealth(health ?? null);
      setPSPromotionAlerts(psAlerts ?? []);
      setAnnouncingRetirements(announcingRets ?? []);
      setRecentNews(news ?? []);
      setTeamChemistry(chemistry ?? null);

      if (offseason.playoffsComplete) setPlayoffsComplete(true);

      const myTeam = standings.find((t: any) => t.id === userTeam.id);
      if (myTeam) setUserRecord({ wins: myTeam.wins, losses: myTeam.losses });
      setAllStandings(standings);

      if (status.hasSchedule && !seasonDone) {
        const data = await window.api.getWeekMatchups(status.currentWeek);
        if (!cancelled) setMatchups(data);
      } else if (seasonDone && !champForSeason) {
        let pState = await window.api.getPlayoffState(currentSeason);
        if (!pState?.initialized) {
          await window.api.initPlayoffs(currentSeason);
          pState = await window.api.getPlayoffState(currentSeason);
        }
        if (!cancelled) setPlayoffState(pState);
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

  useEffect(() => {
    const userGame = matchups.find(m => m.home_team_id === userTeam?.id || m.away_team_id === userTeam?.id);
    if (!userGame || !userTeam || userGame.is_simulated === 1) {
      setOppHealth(null); setOppScheme(null); setUserScheme(null);
      return;
    }
    const oppId = userGame.home_team_id === userTeam.id ? userGame.away_team_id : userGame.home_team_id;
    let cancelled = false;
    (async () => {
      const [oh, os, us] = await Promise.all([
        window.api.getFranchiseHealth(oppId),
        window.api.getTeamScheme(oppId),
        window.api.getTeamScheme(userTeam.id),
      ]);
      if (!cancelled) { setOppHealth(oh ?? null); setOppScheme(os ?? null); setUserScheme(us ?? null); }
    })();
    return () => { cancelled = true; };
  }, [matchups, userTeam?.id]);

  const refreshOffseasonStatus = async () => {
    const [offseason, spots] = await Promise.all([
      window.api.getOffseasonStatus(),
      userTeam ? window.api.getRosterSpots(userTeam.id) : Promise.resolve(null),
    ]);
    setPendingResigns(offseason.pendingResigns ?? 0);
    setDraftComplete(offseason.draftComplete ?? false);
    setDraftGenerated(offseason.draftGenerated ?? false);
    setFaOpen(offseason.faOpen ?? false);
    setOffseasonPhase(offseason.offseasonPhase ?? 'resign');
    if (spots) setRosterSize(spots.active ?? 0);
  };

  // Re-check offseason checklist whenever a roster action increments simCount
  useEffect(() => {
    if (currentWeek === null && hasSchedule) refreshOffseasonStatus();
  }, [simCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateSchedule = async () => {
    setGeneratingSchedule(true);
    try {
      const result = await window.api.generateSchedule();
      if (result?.error) { alert(`Schedule generation failed: ${result.error}`); setGeneratingSchedule(false); return; }
      const status = await window.api.getCurrentWeek();
      setHasSchedule(status.hasSchedule);
      setCurrentWeek(status.currentWeek);
      if (status.currentWeek !== null) setMatchups(await window.api.getWeekMatchups(status.currentWeek));
      const offers = await window.api.getCpuTradeOffer();
      setCpuOffers(Array.isArray(offers) ? offers : offers ? [offers] : []);
    } catch (err) {
      alert(`Error generating schedule: ${err}`);
    } finally {
      setGeneratingSchedule(false);
    }
  };

  const handleSimulateWeek = async () => {
    if (currentWeek === null || !userTeam) return;
    setSimulating(true);
    const weekResult = await window.api.simulateWeek(currentWeek);
    const [status, dashboard, standings, injuries, psAlerts, news] = await Promise.all([
      window.api.getCurrentWeek(), window.api.getDashboard(currentSeason),
      window.api.getStandings(currentSeason), window.api.getInjuryReport(userTeam.id),
      window.api.getPSPromotionAlerts(userTeam.id),
      window.api.getNewsFeed({ season: currentSeason, limit: 6 }),
    ]);
    setCurrentWeek(status.currentWeek);
    setTopAFC(dashboard.topAFC); setTopNFC(dashboard.topNFC);
    setInjuryReport(injuries ?? []);
    setPSPromotionAlerts(psAlerts ?? []);
    setRecentNews(news ?? []);
    const mine = standings.find((t: any) => t.id === userTeam.id);
    if (mine) setUserRecord({ wins: mine.wins, losses: mine.losses });
    setAllStandings(standings);
    if (weekResult?.userPSOpenSpots > 0)
      setPSAlert(`Practice squad has ${weekResult.userPSOpenSpots} open spot${weekResult.userPSOpenSpots !== 1 ? 's' : ''}. Go to My Team → Practice Squad.`);
    if (status.currentWeek === null && status.hasSchedule) {
      setPlayoffSeeds(await window.api.getPlayoffSeeds());
      setMatchups(await window.api.getWeekMatchups(18));
      let pState = await window.api.getPlayoffState(currentSeason);
      if (!pState?.initialized) {
        await window.api.initPlayoffs(currentSeason);
        pState = await window.api.getPlayoffState(currentSeason);
      }
      setPlayoffState(pState);
    } else if (status.currentWeek) {
      setMatchups(await window.api.getWeekMatchups(status.currentWeek));
    }
    setStatLeaders(await window.api.getStats(currentSeason));
    setFranchiseHealth(await window.api.getFranchiseHealth(userTeam.id));
    setBoxScore(null); setBoxScorePlayLog([]);
    incrementSimCount();
    setSimulating(false);
  };

  const handleSimulateGame = async (gameId: number) => {
    if (!userTeam) return;
    setSimulatingGameId(gameId);
    const result = await window.api.simulateOneGame(gameId);
    if (!result?.success) { setSimulatingGameId(null); return; }
    const [status, dashboard, standings, injuries, psAlerts, news] = await Promise.all([
      window.api.getCurrentWeek(), window.api.getDashboard(currentSeason),
      window.api.getStandings(currentSeason), window.api.getInjuryReport(userTeam.id),
      window.api.getPSPromotionAlerts(userTeam.id),
      window.api.getNewsFeed({ season: currentSeason, limit: 6 }),
    ]);
    setCurrentWeek(status.currentWeek); setTopAFC(dashboard.topAFC); setTopNFC(dashboard.topNFC);
    setInjuryReport(injuries ?? []);
    setPSPromotionAlerts(psAlerts ?? []);
    setRecentNews(news ?? []);
    const mine = standings.find((t: any) => t.id === userTeam.id);
    if (mine) setUserRecord({ wins: mine.wins, losses: mine.losses });
    setAllStandings(standings);
    if (result.userPSOpenSpots > 0)
      setPSAlert(`Practice squad has ${result.userPSOpenSpots} open spot${result.userPSOpenSpots !== 1 ? 's' : ''}. Go to My Team → Practice Squad.`);
    if (currentWeek) setMatchups(await window.api.getWeekMatchups(currentWeek));
    setStatLeaders(await window.api.getStats(currentSeason));
    setFranchiseHealth(await window.api.getFranchiseHealth(userTeam.id));
    incrementSimCount();
    setSimulatingGameId(null);
  };

  const handleBoxScore = async (gameId: number) => {
    if (boxScore?.game?.id === gameId) { setBoxScore(null); setBoxScorePlayLog([]); return; }
    setBoxScoreLoading(true);
    const [data, log] = await Promise.all([
      window.api.getGameBoxScore(gameId),
      window.api.getGamePlayLog(gameId),
    ]);
    setBoxScore(data);
    setBoxScorePlayLog(log ?? []);
    setShowBoxScorePlayLog(false);
    setBoxScoreLoading(false);
  };

  const handleSimulatePlayoffGame = async (gameId: number) => {
    setSimulatingPlayoffGameId(gameId);
    await window.api.simulatePlayoffGame(gameId);
    const pState = await window.api.getPlayoffState(currentSeason);
    setPlayoffState(pState);
    if (pState?.complete) {
      setPlayoffsComplete(true);
      const [champs, results, awards] = await Promise.all([
        window.api.getChampions(),
        window.api.getPlayoffs(currentSeason),
        window.api.getSeasonAwards(currentSeason),
      ]);
      setChampions(champs);
      setPlayoffResults(results);
      setSeasonAwards(awards);
    }
    await fetchRecentNews();
    setSimulatingPlayoffGameId(null);
  };

  const handleSimulatePlayoffs = async () => {
    setSimulatingPlayoffs(true);
    await window.api.simulatePlayoffs(currentSeason);
    const [results, champs] = await Promise.all([
      window.api.getPlayoffs(currentSeason),
      window.api.getChampions(),
    ]);
    setPlayoffResults(results);
    setChampions(champs);
    const champForSeason = champs.find((c: Champion) => c.season === currentSeason);
    if (champForSeason) {
      setPlayoffsComplete(true);
      setSeasonAwards(await window.api.getSeasonAwards(currentSeason));
    }
    await fetchRecentNews();
    setSimulatingPlayoffs(false);
  };

  const handleAdvance = async () => {
    setAdvancing(true);
    const result = await window.api.advanceSeason();
    setRetiredPlayers(result?.retired ?? []);
    setAnnouncingRetirements(result?.announcingRetirements ?? []);
    onSeasonAdvance(result.nextSeason);
    setAdvancing(false);
    setConfirming(false);
  };

  const handleOpenFreeAgency = async () => {
    await window.api.openFreeAgency();
    await refreshOffseasonStatus();
  };

    const handleAdvancePhase = async () => {
    const result = await window.api.advanceOffseasonPhase();
    setOffseasonPhase(result.phase);
  };

  const handleRunCpuFa = async () => {
    const result = await window.api.cpuFaSigning();
    setCpuFaResult(result);
    setCpuFaDone(true);
    await refreshOffseasonStatus();
  };

  const handleMakeOffer = async (playerId: number): Promise<{ accepted: boolean; name: string; salary?: number }> => {
    const result = await window.api.makeRetentionOffer(playerId);
    const fresh = await window.api.getAnnouncingRetirements();
    setAnnouncingRetirements(fresh ?? []);
    return result;
  };

  const handleLetGo = async (playerId: number): Promise<void> => {
    await window.api.dismissRetirement(playerId);
    const fresh = await window.api.getAnnouncingRetirements();
    setAnnouncingRetirements(fresh ?? []);
  };

  const handleAcceptOffer = async (offer: CpuOffer) => {
    if (offerWorking) return;
    setOfferWorking(true);
    await window.api.acceptCpuTradeOffer({
      myPlayerId: offer.requestedPlayer.id,
      theirPlayerId: offer.offeredPlayer.id,
      theirTeamId: offer.fromTeamId,
      theirPickId: offer.offeredPick?.id ?? null,
    });
    setCpuOffers(prev => prev.filter(o => o.requestedPlayer.id !== offer.requestedPlayer.id));
    setOfferWorking(false);
  };

  const handleDeclineOffer = (offer: CpuOffer) => {
    setCpuOffers(prev => prev.filter(o => o.requestedPlayer.id !== offer.requestedPlayer.id));
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
  const showAlerts = hasSchedule && !allWeeksDone && (seriousInjuries.length > 0 || psAlert || psPromotionAlerts.length > 0);

  if (loading || !userTeam)
    return <div style={{ color: T.textMuted, padding: 40, textAlign: 'center' }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {!hasSchedule && !staffSetupComplete && userTeam && (
          <PreSeasonStaffPanel
            teamId={userTeam.id}
            season={currentSeason}
            onConfirm={() => setStaffSetupComplete(true)}
            onGenerateSchedule={handleGenerateSchedule}
            generatingSchedule={generatingSchedule}
          />
        )}

        {cpuOffers.map((offer, i) => (
          <TradeOfferCard
            key={i}
            offer={offer}
            currentSeason={currentSeason}
            working={offerWorking}
            onAccept={() => handleAcceptOffer(offer)}
            onDecline={() => handleDeclineOffer(offer)}
            onViewDetails={() => onNavigate('trades')}
          />
        ))}

        {hasSchedule && !allWeeksDone && userGame && (
          <div style={{ background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: T.textMuted, marginBottom: 16, textTransform: 'uppercase' }}>
              Your Game — Week {currentWeek}
            </div>
            {!isGameSimmed && userTeam && (
              <GameWeekPrep
                season={currentSeason}
                week={currentWeek}
                opponentTeamId={isHome ? userGame.away_team_id : userGame.home_team_id}
                opponentName={oppTeamName ?? 'Opponent'}
                injuredPlayers={injuryReport ?? []}
              />
            )}
            {!isGameSimmed ? (
              <>
                {oppHealth && userScheme && oppScheme && userRecord && franchiseHealth ? (
                  <GamePreview
                    userTeamName={`${userTeam.city} ${userTeam.name}`}
                    userRecord={userRecord}
                    userHealth={franchiseHealth}
                    userScheme={userScheme}
                    userIsHome={isHome ?? false}
                    oppTeamName={oppTeamName ?? ''}
                    oppRecord={allStandings.find(t => t.id === (isHome ? userGame.away_team_id : userGame.home_team_id)) ?? { wins: 0, losses: 0 }}
                    oppHealth={oppHealth}
                    oppScheme={oppScheme}
                  />
                ) : (
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
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => handleSimulateGame(userGame.id)}
                    disabled={!!simulating || !!simulatingGameId}
                    style={{
                      flex: 1, padding: '10px 0',
                      background: simulatingGameId === userGame.id ? '#1a3a1a' : '#0a2a0a',
                      border: '1px solid #4caf50', borderRadius: 5, color: '#4caf50',
                      fontWeight: 700, fontSize: 12,
                      cursor: (simulating || !!simulatingGameId) ? 'not-allowed' : 'pointer',
                      opacity: (simulating || !!simulatingGameId) ? 0.5 : 1,
                    }}
                  >
                    {simulatingGameId === userGame.id ? 'Simulating...' : '▶ Sim My Game'}
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
                  onClick={handleSimulateWeek}
                  disabled={!!simulating}
                  style={{
                    width: '100%', padding: '10px 0', marginBottom: 8,
                    background: simulating ? T.bgCard : '#0a1a2a',
                    border: `1px solid ${simulating ? T.borderMid : '#4FC3F7'}`,
                    borderRadius: 5, color: simulating ? T.textMuted : '#4FC3F7',
                    fontWeight: 700, fontSize: 12,
                    cursor: simulating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {simulating ? 'Advancing Week...' : currentWeek === 17 ? '▶ End Regular Season' : `▶ Advance to Week ${(currentWeek ?? 1) + 1}`}
                </button>
                <button
                  onClick={() => handleBoxScore(userGame.id)}
                  disabled={boxScoreLoading}
                  style={{ width: '100%', padding: '8px 0', background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 4, color: T.textMuted, cursor: 'pointer', fontSize: 11 }}
                >
                  {boxScoreLoading ? 'Loading...' : boxScore?.game?.id === userGame.id ? '▲ Hide Box Score' : '▼ View Box Score'}
                </button>
                {boxScore && boxScore.game.id === userGame.id && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${T.borderFaint}`, paddingTop: 12 }}>
                    <div style={{ display: 'flex', fontSize: 10, marginBottom: 12, background: T.bgCard, borderRadius: 4, padding: '6px 10px', gap: 6, alignItems: 'center', fontFamily: 'monospace' }}>
                      {[
                        { name: boxScore.game.home_team, scores: [boxScore.game.home_q1, boxScore.game.home_q2, boxScore.game.home_q3, boxScore.game.home_q4], total: boxScore.game.home_score },
                        { name: boxScore.game.away_team, scores: [boxScore.game.away_q1, boxScore.game.away_q2, boxScore.game.away_q3, boxScore.game.away_q4], total: boxScore.game.away_score },
                      ].map((team, ti) => (
                        <div key={ti} style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 3 }}>{team.name}</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {team.scores.map((s, qi) => (
                              <span key={qi} style={{ color: T.textDim }}>Q{qi + 1}: <span style={{ color: T.textSecondary }}>{s ?? 0}</span></span>
                            ))}
                            <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#4FC3F7' }}>{team.total}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {[
                      { label: 'PASSING',   rows: boxScore.players.filter(p => p.pass_attempts > 0).sort((a, b) => b.pass_yards - a.pass_yards).slice(0, 6),  cols: ['pass_yards','completions','pass_attempts','pass_tds','interceptions'] },
                      { label: 'RUSHING',   rows: boxScore.players.filter(p => p.rush_attempts > 0).sort((a, b) => b.rush_yards - a.rush_yards).slice(0, 6),  cols: ['rush_yards','rush_attempts','rush_tds'] },
                      { label: 'RECEIVING', rows: boxScore.players.filter(p => p.targets > 0).sort((a, b) => b.rec_yards - a.rec_yards).slice(0, 6),           cols: ['rec_yards','receptions','targets','rec_tds'] },
                    ].filter(s => s.rows.length > 0).map(section => (
                      <div key={section.label} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1.5, marginBottom: 4 }}>{section.label}</div>
                        {section.rows.map((p, i) => {
                          const isHomePlayer = p.team_id === boxScore.game.home_team_id;
                          const teamLabel = isHomePlayer ? boxScore.game.home_team : boxScore.game.away_team;
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, padding: '2px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                              <span style={{ color: '#aaa', flex: 2 }}>{p.player_name}</span>
                              <span style={{ fontSize: 9, color: isHomePlayer ? '#4FC3F7' : '#FF8740', marginRight: 8, opacity: 0.7, minWidth: 60, textAlign: 'right', fontFamily: 'monospace' }}>{teamLabel}</span>
                              {section.cols.map(col => (
                                <span key={col} style={{ color: '#4FC3F7', fontFamily: 'monospace', minWidth: 30, textAlign: 'right' }}>{(p as any)[col] ?? 0}</span>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {boxScorePlayLog.length > 0 && (
                      <div style={{ marginTop: 8, borderTop: `1px solid ${T.borderFaint}`, paddingTop: 8 }}>
                        <button
                          onClick={() => setShowBoxScorePlayLog(x => !x)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: showBoxScorePlayLog ? 8 : 0 }}
                        >
                          <span style={{ fontSize: 8, letterSpacing: 1.5, color: T.textMuted, textTransform: 'uppercase' }}>Play-by-Play</span>
                          <span style={{ fontSize: 9, color: T.textDim }}>{showBoxScorePlayLog ? '▲' : '▼'}</span>
                        </button>
                        {showBoxScorePlayLog && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {[1,2,3,4].map(q => {
                              const plays = boxScorePlayLog.filter((p: any) => p.quarter === q);
                              if (!plays.length) return null;
                              const ICON: Record<string,string> = { td:'🏈', fg:'🎯', turnover:'⚡', bigplay:'💨' };
                              const COLOR: Record<string,string> = { td:'#4caf50', fg:'#4FC3F7', turnover:'#FF8740', bigplay:'#FFD700' };
                              return (
                                <div key={q}>
                                  <div style={{ fontSize: 8, color: T.textDim, letterSpacing: 1, padding: '4px 0 2px', borderBottom: `1px solid ${T.borderFaint}` }}>Q{q}</div>
                                  {plays.map((play: any, i: number) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                                      <span style={{ fontSize: 11, flexShrink: 0 }}>{ICON[play.type] ?? '•'}</span>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 10, color: COLOR[play.type] ?? T.textSecondary, lineHeight: 1.3 }}>{play.description}</div>
                                        <div style={{ fontSize: 8, color: T.textDim, marginTop: 1 }}>{play.teamName}</div>
                                      </div>
                                      <span style={{ fontSize: 9, fontFamily: 'monospace', color: T.textMuted, whiteSpace: 'nowrap' }}>{play.awayScore}–{play.homeScore}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

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

        {showAlerts && (
          <div style={{ background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '14px 20px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: T.textMuted, marginBottom: 10, textTransform: 'uppercase' }}>Active Alerts</div>
            {seriousInjuries.slice(0, 5).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, minWidth: 26, textAlign: 'center', background: p.injury_status === 'ir' ? '#1a0a0a' : '#140a00', color: p.injury_status === 'ir' ? '#e57373' : '#FF8740' }}>
                  {p.injury_status === 'ir' ? 'IR' : 'OUT'}
                </span>
                <span style={{ fontSize: 12, color: T.textSecondary, flex: 1 }}>{p.first_name[0]}. {p.last_name}</span>
                <span style={{ fontSize: 10, color: T.textMuted }}>{p.position_label || p.position}</span>
                <span style={{ fontSize: 10, color: T.textDim }}>{p.injury_type}{p.weeks_out > 0 ? ` · ${p.weeks_out}wk` : ''}</span>
              </div>
            ))}
            {psPromotionAlerts.slice(0, 4).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, minWidth: 26, textAlign: 'center', background: '#0a2a0a', color: '#4caf50' }}>
                  PS↑
                </span>
                <span style={{ fontSize: 12, color: T.textSecondary, flex: 1 }}>{p.first_name[0]}. {p.last_name}</span>
                <span style={{ fontSize: 10, color: T.textMuted }}>{p.position_label || p.position}</span>
                <span style={{ fontSize: 10, color: '#4caf50', fontFamily: 'monospace' }}>
                  {p.ps_ovr} <span style={{ color: T.textDim }}>vs</span> {p.lowest_active_ovr}
                </span>
                <button onClick={() => onNavigate('myteam')} style={{ fontSize: 9, color: '#4caf50', background: 'none', border: '1px solid #1a4a1a', borderRadius: 3, padding: '2px 7px', cursor: 'pointer' }}>
                  Promote
                </button>
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

        {allWeeksDone && !isPlayoffsComplete && (
          <PlayoffBracketView
            state={playoffState}
            onSimulateGame={handleSimulatePlayoffGame}
            onSimulateAll={handleSimulatePlayoffs}
            simulatingGameId={simulatingPlayoffGameId}
            simulatingAll={simulatingPlayoffs}
          />
        )}

        {allWeeksDone && isPlayoffsComplete && (
          <>
            <SeasonAwardsView awards={seasonAwards} season={currentSeason} />
            <OffseasonChecklist
              pendingResigns={pendingResigns}
              draftComplete={draftComplete}
              draftGenerated={draftGenerated}
              faOpen={faOpen}
              rosterSize={rosterSize}
              announcingRetirements={announcingRetirements}
              refreshOffseasonStatus={refreshOffseasonStatus}
              onNavigate={onNavigate}
              onOpenFreeAgency={handleOpenFreeAgency}
              onMakeOffer={handleMakeOffer}
              onLetGo={handleLetGo}
                            offseasonPhase={offseasonPhase}
              onAdvancePhase={handleAdvancePhase}
              onRunCpuFa={handleRunCpuFa}
              cpuFaDone={cpuFaDone}
              cpuFaResult={cpuFaResult}
            />
            <PlayoffResultsView results={playoffResults} champion={currentChampion} />
          </>
        )}

        {teamChemistry && (
          <ChemistryPanel chemistry={teamChemistry.chemistry} events={teamChemistry.events} archetypes={teamChemistry.archetypes ?? []} />
        )}

        <div style={{ background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '14px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: T.textMuted, textTransform: 'uppercase' }}>Recent News</div>
            <button
              onClick={() => onNavigate('news')}
              style={{ fontSize: 9, color: '#FF8740', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 0.5 }}
            >
              → News Center
            </button>
          </div>
          {recentNews.length === 0 ? (
            <div style={{ fontSize: 10, color: T.textDim, textAlign: 'center', padding: '10px 0' }}>
              No news yet — simulate games to generate events.
            </div>
          ) : (
            recentNews.map(event => (
              <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                <span style={{ fontSize: 14, lineHeight: 1.2, flexShrink: 0 }}>{newsIcon(event.event_type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: T.textSecondary, lineHeight: 1.3 }}>{event.headline}</div>
                  {event.detail && (
                    <div style={{ fontSize: 9, color: T.textDim, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {event.detail}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 9, color: T.textDim, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {newsWeekLabel(event.week)}
                </span>
              </div>
            ))
          )}
        </div>

      </div>

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
        onGenerateSchedule={staffSetupComplete ? handleGenerateSchedule : undefined}
        onSimulateWeek={handleSimulateWeek}
        onSimulatePlayoffs={handleSimulatePlayoffs}
        onConfirm={() => setConfirming(true)}
        onCancelConfirm={() => setConfirming(false)}
        onAdvance={handleAdvance}
                onSetTradeStatus={handleSetTradeStatus}
        ownerGoals={ownerGoals}
        ownerPatience={ownerPatience}
      />
    </div>
  );
}
