import React, { useEffect, useState } from 'react';
import { T } from './theme';
import {
  Matchup, BoxScoreData, StandingEntry, Champion, SeedEntry,
  PlayoffGame, InjuredPlayer, UserTeam,
} from './home/types';
import SeasonHeader from './home/SeasonHeader';
import OffseasonChecklist from './home/OffseasonChecklist';
import WeeklySchedule from './home/WeeklySchedule';
import Sidebar from './home/Sidebar';
import PlayoffSeedingsView from './home/PlayoffSeedingsView';
import PlayoffResultsView from './home/PlayoffResultsView';

declare const window: any;

interface Props {
  currentSeason: number;
  onSeasonAdvance: (nextSeason: number) => void;
  userTeam: UserTeam;
  onNavigate: (tab: string) => void;
  onPlayoffsComplete: () => void;
}

export default function Home({ currentSeason, onSeasonAdvance, userTeam, onNavigate, onPlayoffsComplete }: Props) {
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
  const [injuryReport, setInjuryReport] = useState<InjuredPlayer[]>([]);
  const [retiredPlayers, setRetiredPlayers] = useState<{ name: string; position: string; age: number; ovr: number }[]>([]);
  const [statLeaders, setStatLeaders] = useState<any>(null);
  const [psAlert, setPSAlert] = useState<string | null>(null);

  useEffect(() => {
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

      if (offseason.playoffsComplete) onPlayoffsComplete();

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
    setHasSchedule(status.hasSchedule); setCurrentWeek(status.currentWeek); setViewWeek(1);
    setMatchups(await window.api.getWeekMatchups(1));
    setGeneratingSchedule(false);
  };

  const handleSimulateWeek = async () => {
    if (currentWeek === null) return;
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
    onPlayoffsComplete();
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

  const allWeeksDone    = hasSchedule && currentWeek === null;
  const currentChampion = champions.find(c => c.season === currentSeason);
  const playoffsComplete = !!currentChampion;

  if (loading) return <div style={{ color: T.textMuted, padding: 32 }}>Loading...</div>;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>

      <SeasonHeader
        currentSeason={currentSeason} userTeam={userTeam} userRecord={userRecord}
        hasSchedule={hasSchedule} allWeeksDone={allWeeksDone} playoffsComplete={playoffsComplete}
        currentWeek={currentWeek} matchups={matchups}
        simulating={simulating} simulatingGameId={simulatingGameId}
        generatingSchedule={generatingSchedule} simulatingPlayoffs={simulatingPlayoffs}
        pendingResigns={pendingResigns} advancing={advancing}
        confirming={confirming} setConfirming={setConfirming}
        retiredPlayers={retiredPlayers} setRetiredPlayers={setRetiredPlayers}
        handleGenerateSchedule={handleGenerateSchedule}
        handleSimulateWeek={handleSimulateWeek}
        handleSimulateGame={handleSimulateGame}
        handleSimulatePlayoffs={handleSimulatePlayoffs}
        handleAdvance={handleAdvance}
      />

      {allWeeksDone && playoffsComplete && (
        <OffseasonChecklist
          pendingResigns={pendingResigns} draftComplete={draftComplete} draftGenerated={draftGenerated}
          refreshOffseasonStatus={refreshOffseasonStatus} onNavigate={onNavigate}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>
        {/* Main content */}
        <div>
          {!hasSchedule ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: T.textDim }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏈</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.textMuted, marginBottom: 8 }}>No schedule for {currentSeason} yet.</div>
              <div style={{ fontSize: 13 }}>Click "Start {currentSeason} Season" to generate all 18 weeks.</div>
            </div>
          ) : allWeeksDone && playoffsComplete ? (
            <PlayoffResultsView results={playoffResults} champion={currentChampion} />
          ) : allWeeksDone && !playoffsComplete ? (
            <PlayoffSeedingsView seeds={playoffSeeds} />
          ) : (
            <WeeklySchedule
              viewWeek={viewWeek} matchups={matchups}
              boxScore={boxScore} boxScoreLoading={boxScoreLoading}
              simulating={simulating} simulatingGameId={simulatingGameId}
              userTeam={userTeam} psAlert={psAlert} setPSAlert={setPSAlert}
              handleViewWeek={handleViewWeek}
              handleSimulateGame={handleSimulateGame}
              handleBoxScore={handleBoxScore}
            />
          )}
        </div>

        {/* Sidebar */}
        <Sidebar
          injuryReport={injuryReport} topAFC={topAFC} topNFC={topNFC}
          champions={champions} statLeaders={statLeaders}
        />
      </div>

    </div>
  );
}
