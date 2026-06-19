import React, { useEffect, useState } from 'react';
import { T } from './theme';
import { StatsData, StatCategory, DefSubCat, TeamEntry, SelectedPlayer } from './stats/types';
import PlayerCard from './stats/PlayerCard';
import TeamStatsTable from './stats/TeamStatsTable';
import PassingTable from './stats/PassingTable';
import RushingTable from './stats/RushingTable';
import ReceivingTable from './stats/ReceivingTable';
import DefenseTable from './stats/DefenseTable';
import SpecialTeamsTable from './stats/SpecialTeamsTable';
import { useGameStore } from './store/gameStore';

declare const window: any;

const CATEGORIES: { id: StatCategory; label: string }[] = [
  { id: 'passing', label: 'Passing' },
  { id: 'rushing', label: 'Rushing' },
  { id: 'receiving', label: 'Receiving' },
  { id: 'defense', label: 'Defense' },
  { id: 'special_teams', label: 'Special Teams' },
];

export default function Stats() {
  const { currentSeason, simCount } = useGameStore();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [category, setCategory] = useState<StatCategory>('passing');
  const [defSubCat, setDefSubCat] = useState<DefSubCat>('tackles');
  const [viewSeason, setViewSeason] = useState(currentSeason);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ matched: number; skipped: number } | null>(null);
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamEntry | null>(null);
  const [teamStats, setTeamStats] = useState<any[] | null>(null);
  const [viewMode, setViewMode] = useState<'players' | 'teams'>('players');
  const [teamSeasonStats, setTeamSeasonStats] = useState<any[] | null>(null);
  const [teamSortKey, setTeamSortKey] = useState('ppg');
  const [teamSortDir, setTeamSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    window.api.getSeasons().then((seasons: number[]) => setAvailableSeasons(seasons));
    window.api.getTeams().then((data: TeamEntry[]) => setTeams(data));
  }, []);

  useEffect(() => { setViewSeason(currentSeason); }, [currentSeason]);
  useEffect(() => { window.api.getStats(viewSeason).then((data: StatsData) => setStats(data)); }, [viewSeason, simCount]);

  useEffect(() => {
    if (viewMode === 'teams') {
      window.api.getTeamSeasonStats(viewSeason).then((rows: any[]) => setTeamSeasonStats(rows));
    }
  }, [viewMode, viewSeason]);

  useEffect(() => {
    setTeamStats(null);
    if (selectedTeam) {
      window.api.getTeamStats(selectedTeam.id, viewSeason).then((rows: any[]) => setTeamStats(rows));
    }
  }, [selectedTeam?.id, viewSeason]);

  const handleImport = async () => {
    setImporting(true); setImportResult(null);
    const result = await window.api.importNflverseStats();
    setImportResult(result); setImporting(false);
  };

  const handleTeamSort = (k: string) => {
    if (teamSortKey === k) setTeamSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setTeamSortKey(k); setTeamSortDir('desc'); }
  };

  if (!stats) return <div style={{ padding: 24, color: T.textDim }}>Loading...</div>;

  const teamPassing = teamStats ? [...teamStats].filter(p => (p.pass_attempts ?? 0) > 0).sort((a, b) => (b.pass_yards ?? 0) - (a.pass_yards ?? 0)) : null;
  const teamRushing = teamStats ? [...teamStats].filter(p => (p.rush_attempts ?? 0) > 0).sort((a, b) => (b.rush_yards ?? 0) - (a.rush_yards ?? 0)) : null;
  const teamReceiving = teamStats ? [...teamStats].filter(p => (p.targets ?? 0) > 0).sort((a, b) => (b.rec_yards ?? 0) - (a.rec_yards ?? 0)) : null;
  const teamTackles = teamStats ? [...teamStats].filter(p => (p.tackles ?? 0) + (p.assisted_tackles ?? 0) > 0).sort((a, b) => ((b.tackles ?? 0) + (b.assisted_tackles ?? 0)) - ((a.tackles ?? 0) + (a.assisted_tackles ?? 0))) : null;
  const teamSacks = teamStats ? [...teamStats].filter(p => (p.sacks ?? 0) > 0).sort((a, b) => (b.sacks ?? 0) - (a.sacks ?? 0)) : null;
  const teamDefInts = teamStats ? [...teamStats].filter(p => (p.def_interceptions ?? 0) > 0 || (p.pass_deflections ?? 0) > 0).sort((a, b) => (b.def_interceptions ?? 0) - (a.def_interceptions ?? 0)) : null;
  const teamKickers = teamStats ? [...teamStats].filter(p => (p.fg_att ?? 0) > 0).sort((a, b) => (b.fg_made ?? 0) - (a.fg_made ?? 0)) : null;

  const filterSearch = (rows: any[]) =>
    searchQuery ? rows.filter(p => p.player_name?.toLowerCase().includes(searchQuery.toLowerCase())) : rows;

  const passing = filterSearch(teamPassing ?? stats.passing);
  const rushing = filterSearch(teamRushing ?? stats.rushing);
  const receiving = filterSearch(teamReceiving ?? stats.receiving);
  const tackles = filterSearch(teamTackles ?? (stats.tackles ?? []));
  const sacks = filterSearch(teamSacks ?? (stats.sacks ?? []));
  const defInterceptions = filterSearch(teamDefInts ?? (stats.defInterceptions ?? []));
  const kickers = filterSearch(teamKickers ?? (stats.kickers ?? []));

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1000, margin: '0 auto' }}>
      {selectedPlayer && (
        <div onClick={() => setSelectedPlayer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <PlayerCard
            player={selectedPlayer}
            currentSeason={currentSeason}
            onClose={() => setSelectedPlayer(null)}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary }}>
            {viewMode === 'teams'
              ? `${viewSeason} Team Stats`
              : (selectedTeam ? `${selectedTeam.city} ${selectedTeam.name} — ` : '') + `${viewSeason} Season Leaders`}
          </div>
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Click any player to view their full stats</div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button onClick={() => setViewMode('players')} style={{ padding: '4px 10px', fontSize: 10, background: viewMode === 'players' ? '#FF8740' : T.bgCard, color: viewMode === 'players' ? '#000' : T.textDim, border: `1px solid ${viewMode === 'players' ? '#FF8740' : T.borderFaint}`, borderRadius: 3, cursor: 'pointer', fontWeight: viewMode === 'players' ? 700 : 400 }}>PLAYERS</button>
          <button onClick={() => setViewMode('teams')} style={{ padding: '4px 10px', fontSize: 10, background: viewMode === 'teams' ? '#FF8740' : T.bgCard, color: viewMode === 'teams' ? '#000' : T.textDim, border: `1px solid ${viewMode === 'teams' ? '#FF8740' : T.borderFaint}`, borderRadius: 3, cursor: 'pointer', fontWeight: viewMode === 'teams' ? 700 : 400 }}>TEAMS</button>
        </div>

        <button onClick={handleImport} disabled={importing} style={{ padding: '5px 12px', background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 4, color: T.textDim, fontSize: 11, cursor: importing ? 'not-allowed' : 'pointer' }}>
          {importing ? 'importing...' : '↻ sync NFL history'}
        </button>
        {importResult && <span style={{ fontSize: 11, color: '#4caf50' }}>✓ {importResult.matched} players matched</span>}

        <select onChange={e => { const id = Number(e.target.value); setSelectedTeam(id ? teams.find(t => t.id === id) ?? null : null); }}
          style={{ background: T.bgPage, color: T.textPrimary, border: `1px solid ${T.borderFaint}`, borderRadius: 4, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace' }}>
          <option value="">All Teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
        </select>

        {availableSeasons.length > 1 && (
          <select onChange={e => setViewSeason(Number(e.target.value))} value={viewSeason}
            style={{ background: T.bgPage, color: T.textPrimary, border: `1px solid ${T.borderFaint}`, borderRadius: 4, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace' }}>
            {availableSeasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setCategory(cat.id)} style={{
            padding: '7px 18px',
            background: category === cat.id ? T.bgGreen : T.bgPage,
            color: category === cat.id ? '#4caf50' : T.textMuted,
            border: `1px solid ${category === cat.id ? '#2a4a2a' : T.bgCard}`,
            borderRadius: 4, cursor: 'pointer', fontWeight: category === cat.id ? 'bold' : 'normal',
            fontSize: 12, fontFamily: 'monospace',
          }}>{cat.label}</button>
        ))}
        {viewMode === 'players' && (
          <input
            placeholder="Search player..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ marginLeft: 'auto', background: T.bgPage, border: `1px solid ${T.borderFaint}`, borderRadius: 4, color: T.textPrimary, padding: '6px 12px', fontSize: 12, fontFamily: 'monospace', outline: 'none', width: 180 }}
          />
        )}
      </div>

      {viewMode === 'teams' && (
        <TeamStatsTable
          rows={teamSeasonStats ?? []}
          sortKey={teamSortKey}
          sortDir={teamSortDir}
          onSort={handleTeamSort}
          category={category}
        />
      )}

      {viewMode === 'players' && (
        <>
          {category === 'passing' && <PassingTable rows={passing} selectedPlayer={selectedPlayer} onSelectPlayer={setSelectedPlayer} searchQuery={searchQuery} />}
          {category === 'rushing' && <RushingTable rows={rushing} selectedPlayer={selectedPlayer} onSelectPlayer={setSelectedPlayer} searchQuery={searchQuery} />}
          {category === 'receiving' && <ReceivingTable rows={receiving} selectedPlayer={selectedPlayer} onSelectPlayer={setSelectedPlayer} searchQuery={searchQuery} />}
          {category === 'defense' && (
            <DefenseTable
              defSubCat={defSubCat}
              setDefSubCat={setDefSubCat}
              tackles={tackles}
              sacks={sacks}
              defInterceptions={defInterceptions}
              selectedPlayer={selectedPlayer}
              onSelectPlayer={setSelectedPlayer}
              searchQuery={searchQuery}
            />
          )}
          {category === 'special_teams' && <SpecialTeamsTable kickers={kickers} selectedPlayer={selectedPlayer} onSelectPlayer={setSelectedPlayer} searchQuery={searchQuery} />}
        </>
      )}
    </div>
  );
}
