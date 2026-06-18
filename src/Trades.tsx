import React, { useEffect, useState } from 'react';
import { T } from './theme';
import { Team, Player, DraftPick, TeamStatus, CpuOffer, TeamNeed } from './trades/types';
import { calcTradeValue, calcPickValue } from './trades/tradeUtils';
import RosterPanel from './trades/RosterPanel';
import TradeSummary from './trades/TradeSummary';
import CpuOfferBanner from './trades/CpuOfferBanner';
import TeamSelector from './trades/TeamSelector';
import TeamStatusBanner from './trades/TeamStatusBanner';

declare const window: any;

interface Props { userTeam: { id: number; city: string; name: string }; }

const DEADLINE = 8;

export default function Trades({ userTeam }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [teamStatus, setTeamStatus] = useState<TeamStatus | null>(null);
  const [myRoster, setMyRoster] = useState<Player[]>([]);
  const [theirRoster, setTheirRoster] = useState<Player[]>([]);
  const [myPicks, setMyPicks] = useState<DraftPick[]>([]);
  const [theirPicks, setTheirPicks] = useState<DraftPick[]>([]);
  const [mySelected, setMySelected] = useState<number[]>([]);
  const [theirSelected, setTheirSelected] = useState<number[]>([]);
  const [myPicksSelected, setMyPicksSelected] = useState<number[]>([]);
  const [theirPicksSelected, setTheirPicksSelected] = useState<number[]>([]);
  const [myPos, setMyPos] = useState('ALL');
  const [theirPos, setTheirPos] = useState('ALL');
  const [result, setResult] = useState<{ accepted: boolean; reason?: string } | null>(null);
  const [proposing, setProposing] = useState(false);
  const [needs, setNeeds] = useState<TeamNeed[]>([]);
  const [weekInfo, setWeekInfo] = useState<{ hasSchedule: boolean; currentWeek: number | null } | null>(null);
  const [currentSeason, setCurrentSeason] = useState(2025);
  const [cpuOffer, setCpuOffer] = useState<CpuOffer | null>(null);
  const [offerHandled, setOfferHandled] = useState(false);
  const [offerWorking, setOfferWorking] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);

  useEffect(() => {
    Promise.all([
      window.api.getTeams(),
      window.api.getRoster(userTeam.id),
      window.api.getTeamNeeds(userTeam.id),
      window.api.getCurrentWeek(),
      window.api.getCurrentSeason(),
      window.api.getTradeablePicks(userTeam.id),
      window.api.getCpuTradeOffer(),
    ]).then(([allTeams, roster, n, wi, season, picks, offer]: any[]) => {
      setTeams(allTeams.filter((t: Team) => t.id !== userTeam.id));
      setMyRoster(roster); setNeeds(n); setWeekInfo(wi);
      setCurrentSeason(season); setMyPicks(picks); setCpuOffer(offer);
    });
  }, [userTeam.id]);

  const handleSelectTeam = async (teamId: number) => {
    setSelectedTeamId(teamId);
    setMySelected([]); setTheirSelected([]);
    setMyPicksSelected([]); setTheirPicksSelected([]);
    setResult(null); setTeamStatus(null);
    const [roster, status, picks] = await Promise.all([
      window.api.getRoster(teamId),
      window.api.getTeamStatus(teamId),
      window.api.getTradeablePicks(teamId),
    ]);
    setTheirRoster(roster); setTeamStatus(status); setTheirPicks(picks);
  };

  const handleSetOverride = async (value: string) => {
    if (!selectedTeamId) return;
    setSavingOverride(true);
    await window.api.setTeamTradeStatus({ teamId: selectedTeamId, status: value === 'auto' ? null : value });
    setTeamStatus(await window.api.getTeamStatus(selectedTeamId));
    setSavingOverride(false);
  };

  const toggleMine   = (id: number) => { setResult(null); setMySelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };
  const toggleTheirs = (id: number) => { setResult(null); setTheirSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };
  const toggleMyPick = (id: number) => { setResult(null); setMyPicksSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };
  const toggleTheirPick = (id: number) => { setResult(null); setTheirPicksSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };

  const handlePropose = async () => {
    if (!canPropose) return;
    setProposing(true);
    const res = await window.api.proposeTrade({
      myPlayerIds: mySelected, theirPlayerIds: theirSelected,
      theirTeamId: selectedTeamId!, myPickIds: myPicksSelected, theirPickIds: theirPicksSelected,
    });
    setResult(res);
    if (res.accepted) {
      const [myNew, theirNew, myNewPicks, theirNewPicks] = await Promise.all([
        window.api.getRoster(userTeam.id), window.api.getRoster(selectedTeamId!),
        window.api.getTradeablePicks(userTeam.id), window.api.getTradeablePicks(selectedTeamId!),
      ]);
      setMyRoster(myNew); setTheirRoster(theirNew);
      setMyPicks(myNewPicks); setTheirPicks(theirNewPicks);
      setMySelected([]); setTheirSelected([]);
      setMyPicksSelected([]); setTheirPicksSelected([]);
    }
    setProposing(false);
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
    if (res.success) {
      const [newRoster, newPicks] = await Promise.all([
        window.api.getRoster(userTeam.id),
        window.api.getTradeablePicks(userTeam.id),
      ]);
      setMyRoster(newRoster); setMyPicks(newPicks);
      setCpuOffer(null); setOfferHandled(true);
    }
    setOfferWorking(false);
  };

  const myValue = [
    ...mySelected.map(id => { const p = myRoster.find(x => x.id === id); return p ? calcTradeValue(p.overall_rating, p.age, p.position, p.dev_trait) : 0; }),
    ...myPicksSelected.map(id => { const pk = myPicks.find(x => x.id === id); return pk ? calcPickValue(pk.round, pk.season, currentSeason) : 0; }),
  ].reduce((a, b) => a + b, 0);

  const theirValue = [
    ...theirSelected.map(id => { const p = theirRoster.find(x => x.id === id); return p ? calcTradeValue(p.overall_rating, p.age, p.position, p.dev_trait) : 0; }),
    ...theirPicksSelected.map(id => { const pk = theirPicks.find(x => x.id === id); return pk ? calcPickValue(pk.round, pk.season, currentSeason) : 0; }),
  ].reduce((a, b) => a + b, 0);

  const canPropose = (mySelected.length > 0 || myPicksSelected.length > 0) &&
                     (theirSelected.length > 0 || theirPicksSelected.length > 0) &&
                     selectedTeamId !== null;

  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  const isPastDeadline = !!(weekInfo?.hasSchedule && (!weekInfo.currentWeek || weekInfo.currentWeek > DEADLINE));
  const weeksToDeadline = weekInfo?.currentWeek ? Math.max(0, DEADLINE - weekInfo.currentWeek + 1) : null;

  const myFiltered    = myRoster.filter(p => myPos === 'ALL' || p.position === myPos);
  const theirFiltered = theirRoster.filter(p => theirPos === 'ALL' || p.position === theirPos);

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>

      <div style={{ marginBottom: 16 }}>
        <h1 style={{ color: T.textPrimary, fontSize: 20, fontWeight: 700, margin: 0 }}>Trade Center</h1>
        {weekInfo?.hasSchedule && (
          <p style={{ color: T.textDim, fontSize: 11, margin: '4px 0 0' }}>
            {isPastDeadline
              ? 'Trade deadline has passed.'
              : `Trade deadline: Week ${DEADLINE}${weeksToDeadline !== null ? ` · ${weeksToDeadline} week${weeksToDeadline !== 1 ? 's' : ''} remaining` : ''}`}
          </p>
        )}
      </div>

      {cpuOffer && !offerHandled && (
        <CpuOfferBanner
          cpuOffer={cpuOffer}
          offerWorking={offerWorking}
          currentSeason={currentSeason}
          onAccept={handleAcceptOffer}
          onDecline={() => setOfferHandled(true)}
        />
      )}

      <TeamSelector teams={teams} selectedTeamId={selectedTeamId} onSelect={handleSelectTeam} />

      {!selectedTeamId ? (
        <div style={{ color: T.textDim, fontSize: 13, padding: '20px 0' }}>
          Select a team above to build a trade.
        </div>
      ) : (
        <>
          {teamStatus && (
            <TeamStatusBanner
              selectedTeam={selectedTeam}
              teamStatus={teamStatus}
              savingOverride={savingOverride}
              onSetOverride={handleSetOverride}
            />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px 1fr', gap: 12, alignItems: 'start' }}>
            <RosterPanel
              title="Your Roster"
              subtitle={`${userTeam.city} ${userTeam.name}`}
              players={myFiltered}
              picks={myPicks}
              selectedPlayers={mySelected}
              selectedPicks={myPicksSelected}
              posFilter={myPos}
              onPosFilter={setMyPos}
              onTogglePlayer={toggleMine}
              onTogglePick={toggleMyPick}
              accent="#4caf50"
              needs={needs}
              currentSeason={currentSeason}
            />

            <TradeSummary
              myRoster={myRoster} theirRoster={theirRoster}
              myPicks={myPicks} theirPicks={theirPicks}
              mySelected={mySelected} theirSelected={theirSelected}
              myPicksSelected={myPicksSelected} theirPicksSelected={theirPicksSelected}
              myValue={myValue} theirValue={theirValue}
              canPropose={canPropose}
              isPastDeadline={isPastDeadline}
              teamStatus={teamStatus}
              result={result}
              proposing={proposing}
              currentSeason={currentSeason}
              onPropose={handlePropose}
            />

            <RosterPanel
              title={`${selectedTeam?.city} ${selectedTeam?.name}`}
              subtitle={teamStatus ? `${teamStatus.wins}–${teamStatus.losses} · ${teamStatus.status}` : ''}
              players={theirFiltered}
              picks={theirPicks}
              selectedPlayers={theirSelected}
              selectedPicks={theirPicksSelected}
              posFilter={theirPos}
              onPosFilter={setTheirPos}
              onTogglePlayer={toggleTheirs}
              onTogglePick={toggleTheirPick}
              accent="#FF8740"
              currentSeason={currentSeason}
            />
          </div>
        </>
      )}
    </div>
  );
}
