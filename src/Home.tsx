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
import { useGameStore } from './store/gameStore';

declare const window: any;

interface Props {
  onSeasonAdvance: (nextSeason: number) => void;
  onNavigate: (tab: string) => void;
}

export default function Home({ onSeasonAdvance, onNavigate }: Props) {
  const { userTeam, currentSeason, setPlayoffsComplete } = useGameStore();

  const [loading, setLoading]                       = useState(true);
  const [hasSchedule, setHasSchedule]               = useState(false);
  const [currentWeek, setCurrentWeek]               = useState<number | null>(null);
  const [viewWeek, setViewWeek]                     = useState(1);
  const [matchups, setMatchups]                     = useState<Matchup[]>([]);
  const [simulating, setSimulating]                 = useState(false);
  const [simulatingGameId, setSimulatingGameId]     = useState<number | null>(null);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [boxScore, setBoxScore]                     = useState<BoxScoreData | null>(null);
  const [boxScoreLoading, setBoxScoreLoading]       = useState(false);
  const [topAFC, setTopAFC]                         = useState<StandingEntry[]>([]);
  const [topNFC, setTopNFC]                         = useState<StandingEntry[]>([]);
  const [champions, setChampions]                   = useState<Champion[]>([]);
  const [confirming, setConfirming]                 = useState(false);
  const [advancing, setAdvancing]                   = useState(false);
  const [playoffSeeds, setPlayoffSeeds]             = useState<{ afc: SeedEntry[]; nfc: SeedEntry[] } | null>(null);
  const [playoffResults, setPlayoffResults]         = useState<PlayoffGame[] | null>(null);
  const [simulatingPlayoffs, setSimulatingPlayoffs] = useState(false);
  const [userRecord, setUserRecord]                 = useState<{ wins: number; losses: number } | null>(null);
  const [pendingResigns, setPendingResigns]         = useState(0);
  const [draftComplete, setDraftComplete]           = useState(false);
  const [draftGenerated, setDraftGenerated]         = useState(false);
  const [injuryReport, setInjuryReport]             = useState<InjuredPlayer[]>([]);
  const [retiredPlayers, setRetiredPlayers]         = useState<{ name: string; position: string; age: number; ovr: number }[]>([]);
  const [statLeaders, setStatLeaders]               = useState<any | null>(null);
  const [psAlert, setPSAlert]                       = useState<string | null>(null);

  useEffect(() => {
    if (!userTeam) return;
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      setBoxScore(null); setConfirming(false); setPlayoffSeeds(null);
      setPlayoffResults(null); setUserRecord(null); setInjuryReport([]);

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
      setInjuryReport(injuries ?? []);
      setStatLeaders(leaders);

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
        const [results, weekData] = await Promise.all([window.api.getPlayoffs(currentSeason), window.api.getWeekMatchups(18)]);
        if (!cancelled) { setPlayoffResults(results); setMatchups(weekData); setViewWeek(18); }
      }

      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [currentSeason, userTeam?.id]);

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
    setHasSchedule(status.hasSchedule); setCurrentWeek(status.currentWeek); setViewWeek(1);
    setMatchups(await window.api.getWeekMatchups(1));
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
    if (weekResult?.userPSOpenSpots > 0) setPSAlert(`Practice squad has ${weekResult.userPSOpenSpots} open spot${weekResult.userPSOpenSpots !== 1 ? 's' : ''}. Sign free agents in Franchise → Practice Squad tab.`);
    if (status.currentWeek === null && status.hasSchedule) {
      const seeds = await window.api.getPlayoffSeeds();
      setPlayoffSeeds(seeds);
      setMatchups(await window.api.getWeekMatchups(18)); setViewWeek(18);
    }
    setStatLeaders(await window.api.getStats(currentSeason));
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
    if (result.userPSOpenSpots > 0) setPSAlert(`Practice squad has ${result.userPSOpenSpots} open spot${result.userPSOpenSpots !== 1 ? 's' : ''}. Sign free agents in Franchise → Practice Squad tab.`);
    if (result.weekComplete) {
      setStatLeaders(await window.api.getStats(currentSeason));
      if (status.currentWeek === null && status.hasSchedule) {
        setPlayoffSeeds(await window.api.getPlayoffSeeds());
        setMatchups(await window.api.getWeekMatchups(18)); setViewWeek(18);
      }
    }
    setSimulatingGameId(null);
  };

  const handleSimulatePlayoffs = async () => {
    setSimulatingPlayoffs(true);
    await window.api.simulatePlayoffs(currentSeason);
    const [champs, results] = await Promise.all([window.api.getChampions(), window.api.getPlayoffs(currentSeason)]);
    setChampions(champs); setPlayoffResults(results); setPlayoffSeeds(null);
    setPlayoffsComplete(true);
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
    setAdvancing(true);
    const result = await window.api.advanceSeason();
    setAdvancing(false); setConfirming(false);
    if (result.retired?.length > 0) setRetiredPlayers(result.retired);
    onSeasonAdvance(result.nextSeason);
  };

  const allWeeksDone      = hasSchedule && currentWeek === null;
  const currentChampion   = champions.find(c => c.season === currentSeason);
  const isPlayoffsComplete = !!currentChampion;

  if (loading || !userTeam) return <div style={{ color: '#555', padding: 40 }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        <SeasonHeader
          currentSeason={currentSeason}
          hasSchedule={hasSchedule}
          currentWeek={currentWeek}
          onGenerateSchedule={handleGenerateSchedule}
          generatingSchedule={generatingSchedule}
          onSimulateWeek={handleSimulateWeek}
          simulating={simulating}
          userRecord={userRecord}
          confirming={confirming}
          onConfirmAdvance={() => setConfirming(true)}
          onCancelAdvance={() => setConfirming(false)}
          onAdvance={handleAdvance}
          advancing={advancing}
          retiredPlayers={retiredPlayers}
          psAlert={psAlert}
          onDismissPSAlert={() => setPSAlert(null)}
        />

        {allWeeksDone && isPlayoffsComplete && (
          <OffseasonChecklist
            pendingResigns={pendingResigns}
            draftComplete={draftComplete}
            draftGenerated={draftGenerated}
            onNavigate={onNavigate}
            onRefresh={refreshOffseasonStatus}
          />
        )}

        {!hasSchedule ? (
          <div style={{ textAlign: 'center', color: T.textMuted, padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏈</div>
            <div style={{ fontSize: 16, marginBottom: 6 }}>No schedule for {currentSeason} yet.</div>
            <div style={{ fontSize: 13, color: T.textDim }}>Click "Start {currentSeason} Season" to generate all 18 weeks.</div>
          </div>
        ) : allWeeksDone && isPlayoffsComplete ? (
          <PlayoffResultsView
            results={playoffResults}
            champions={champions}
            currentSeason={currentSeason}
          />
        ) : allWeeksDone && !isPlayoffsComplete ? (
          <PlayoffSeedingsView
            seeds={playoffSeeds}
            simulatingPlayoffs={simulatingPlayoffs}
            onSimulatePlayoffs={handleSimulatePlayoffs}
          />
        ) : (
          <WeeklySchedule
            matchups={matchups}
            viewWeek={viewWeek}
            currentWeek={currentWeek}
            onViewWeek={handleViewWeek}
            onSimulateGame={handleSimulateGame}
            simulatingGameId={simulatingGameId}
            boxScore={boxScore}
            boxScoreLoading={boxScoreLoading}
            onBoxScore={handleBoxScore}
            userTeamId={userTeam.id}
          />
        )}
      </div>

      <Sidebar
        topAFC={topAFC}
        topNFC={topNFC}
        champions={champions}
        injuryReport={injuryReport}
        statLeaders={statLeaders}
        currentSeason={currentSeason}
        userTeamId={userTeam.id}
      />
    </div>
  );
}
