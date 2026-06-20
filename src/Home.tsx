import React, { useEffect, useState } from 'react';
import { T } from './theme';
import {
  Matchup, BoxScoreData, StandingEntry, Champion, SeedEntry,
  PlayoffGame, InjuredPlayer,
} from './home/types';
import SeasonHeader from './home/SeasonHeader';
import OffseasonChecklist from './home/OffseasonChecklist';
import WeeklySchedule from './home/WeeklySchedule';
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

export default function Home({ onSeasonAdvance, onNavigate }: Props) {
  const { userTeam, currentSeason, setPlayoffsComplete, incrementSimCount } = useGameStore();

  const [loading, setLoading] = useState(true);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<number | null>(null);
  const [viewWeek, setViewWeek] = useState(1);
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
  const [franchiseHealth, setFranchiseHealth] = useState<any>(null);

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
        const week = status.currentWeek!;
        setViewWeek(week);
        const data = await window.api.getWeekMatchups(week);
        if (!cancelled) setMatchups(data);
      } else if (seasonDone && !champForSeason) {
        const [seeds, weekData] = await Promise.all([window.api.getPlayoffSeeds(), window.api.getWeekMatchups(18)]);
        if (!cancelled) { setPlayoffSeeds(seeds); setMatchups(weekData); setViewWeek(18); }
      } else if (seasonDone && champForSeason) {
        const [results, weekData, awards] = await Promise.all([
          window.api.getPlayoffs(currentSeason),
          window.api.getWeekMatchups(18),
          window.api.getSeasonAwards(currentSeason),
        ]);
        if (!cancelled) {
          setPlayoffResults(results); setMatchups(weekData); setViewWeek(18); setSeasonAwards(awards);
        }
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
    setViewWeek(1);
    setMatchups(await window.api.getWeekMatchups(1));
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
    setCurrentWeek(status.currentWeek); setTopAFC(dashboard.topAFC); setTopNFC(dashboard.topNFC);
    setInjuryReport(injuries ?? []);
    const mine = standings.find((t: any) => t.id === userTeam.id);
    if (mine) setUserRecord({ wins: mine.wins, losses: mine.losses });
    setMatchups(await window.api.getWeekMatchups(viewWeek));
    if (weekResult?.userPSOpenSpots > 0)
      setPSAlert(`Practice squad has ${weekResult.userPSOpenSpots} open spot${weekResult.userPSOpenSpots !== 1 ? 's' : ''}. Sign free agents in Franchise → Practice Squad tab.`);
    if (status.currentWeek === null && status.hasSchedule) {
      const seeds = await window.api.getPlayoffSeeds();
      setPlayoffSeeds(seeds);
      setMatchups(await window.api.getWeekMatchups(18)); setViewWeek(18);
    }
    setStatLeaders(await window.api.getStats(currentSeason));
    setFranchiseHealth(await window.api.getFranchiseHealth(userTeam.id));
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
    setMatchups(await window.api.getWeekMatchups(viewWeek));
    if (result.userPSOpenSpots > 0)
      setPSAlert(`Practice squad has ${result.userPSOpenSpots} open spot${result.userPSOpenSpots !== 1 ? 's' : ''}. Sign free agents in Franchise → Practice Squad tab.`);
    if (result.weekComplete) {
      setStatLeaders(await window.api.getStats(currentSeason));
      if (status.currentWeek === null && status.hasSchedule) {
        setPlayoffSeeds(await window.api.getPlayoffSeeds());
        setMatchups(await window.api.getWeekMatchups(18)); setViewWeek(18);
      }
    }
    setFranchiseHealth(await window.api.getFranchiseHealth(userTeam.id));
    incrementSimCount();
    setSimulatingGameId(null);
  };

  const handleSimulatePlayoffs = async () => {
    setSimulatingPlayoffs(true);
    await window.api.simulatePlayoffs(currentSeason);
    const [champs, results, awards] = await Promise.all([
      window.api.getChampions(),
      window.api.getPlayoffs(currentSeason),
      window.api.getSeasonAwards(currentSeason),
    ]);
    setChampions(champs); setPlayoffResults(results); setPlayoffSeeds(null);
    setPlayoffsComplete(true);
    setSeasonAwards(awards);
    await refreshOffseasonStatus();
    setSimulatingPlayoffs(false);
  };

  const handleViewWeek = async (week: number) => {
    if (week < 1 || week > 18) return;
    setViewWeek(week); setBoxScore(null);
    setMatchups(await window.api.getWeekMatchups(week));
  };

  const handleBoxScore = async (gameId: number) => {
    if (boxScore?.game?.id === gameId) { setBoxScore(null); return; }
    setBoxScoreLoading(true); setBoxScore(null);
    setBoxScore(await window.api.getGameBoxScore(gameId));
    setBoxScoreLoading(false);
  };

  const handleAdvance = async () => {
    if (userTeam) {
      const spots = await window.api.getRosterSpots(userTeam.id);
      if (spots && spots.active > 53) {
        alert(`You must cut ${spots.active - 53} player(s) before advancing the season.\n\nGo to Franchise → Active Roster to make cuts.`);
        return;
      }
    }
    setAdvancing(true);
    const result = await window.api.advanceSeason();
    setAdvancing(false); setConfirming(false);
    if (result.retired?.length > 0) setRetiredPlayers(result.retired);
    onSeasonAdvance(result.nextSeason);
  };

  const handleOpenFreeAgency = async () => {
    await window.api.openFreeAgency();
    await refreshOffseasonStatus();
  };

  const handleAcceptOffer = async () => {
    if (!cpuOffer || offerWorking) return;
    setOfferWorking(true);
    const res = await window.api.acceptCpuTradeOffer({
      myPlayerId: cpuOffer.requestedPlayer.id,
      theirPlayerId: cpuOffer.offeredPlayer.id,
      theirTeamId: cpuOffer.fromTeamId,
      theirPickId: cpuOffer.offeredPick?.id ?? null,
    });
    if (res.success) { setCpuOffer(null); setOfferHandled(true); }
    setOfferWorking(false);
  };

  const handleDeclineOffer = () => {
    setCpuOffer(null);
    setOfferHandled(true);
  };

  const handleSetTradeStatus = async (status: string) => {
    if (!userTeam || settingStatus) return;
    setSettingStatus(true);
    await window.api.setTeamTradeStatus({ teamId: userTeam.id, status: status === 'auto' ? null : status });
    const updated = await window.api.getTeamStatus(userTeam.id);
    setUserTradeStatus(updated);
    setSettingStatus(false);
  };

  const allWeeksDone = hasSchedule && currentWeek === null;
  const currentChampion = champions.find(c => c.season === currentSeason);
  const isPlayoffsComplete = !!currentChampion;

  if (loading || !userTeam)
    return <div style={{ color: T.textMuted, padding: 40, textAlign: 'center' }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', gap: 0, height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {cpuOffer && !offerHandled && (
          <TradeOfferCard
            offer={cpuOffer}
            currentSeason={currentSeason}
            working={offerWorking}
            onAccept={handleAcceptOffer}
            onDecline={handleDeclineOffer}
            onViewDetails={() => onNavigate('trades')}
          />
        )}

        {allWeeksDone && isPlayoffsComplete && (
          <SeasonAwardsView awards={seasonAwards} season={currentSeason} />
        )}

        {!hasSchedule ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textMuted }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏈</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary, marginBottom: 8 }}>
              No schedule for {currentSeason} yet.
            </div>
            <div style={{ fontSize: 14, marginBottom: 24 }}>
              Click "Start {currentSeason} Season" to generate all 18 weeks.
            </div>
          </div>
        ) : allWeeksDone && isPlayoffsComplete ? (
          <>
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
        ) : allWeeksDone && !isPlayoffsComplete ? (
          <PlayoffSeedingsView
            seeds={playoffSeeds}
            onSimulate={handleSimulatePlayoffs}
            simulating={simulatingPlayoffs}
          />
        ) : (
          <WeeklySchedule
            matchups={matchups}
            viewWeek={viewWeek}
            userTeam={userTeam}
            simulating={simulating}
            simulatingGameId={simulatingGameId}
            boxScore={boxScore}
            boxScoreLoading={boxScoreLoading}
            psAlert={psAlert}
            onSimulateWeek={handleSimulateWeek}
            onSimulateGame={handleSimulateGame}
            onViewWeek={handleViewWeek}
            onBoxScore={handleBoxScore}
            onDismissAlert={() => setPSAlert(null)}
          />
        )}
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
        franchiseHealth={franchiseHealth}
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
