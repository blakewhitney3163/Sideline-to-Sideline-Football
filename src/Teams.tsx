import React, { useEffect, useState } from 'react';
import { T } from './theme';
import { Team, Player, PlayerStats, CareerSeasonStats } from './teams/types';
import { getRatingCols, getAvailablePositions } from './teams/teamsUtils';
import TeamSidebar from './teams/TeamSidebar';
import PlayerList from './teams/PlayerList';
import PlayerProfile from './teams/PlayerProfile';

declare const window: any;

export default function Teams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [careerStats, setCareerStats] = useState<CareerSeasonStats[]>([]);
  const [statsView, setStatsView] = useState<'season' | 'career'>('season');

  useEffect(() => {
    Promise.all([
      window.api.getTeams(),
      window.api.getUserTeam(),
    ]).then(([data, userTeam]: [Team[], any]) => {
      setTeams(data);
      if (userTeam) {
        const match = data.find((t: Team) => t.id === userTeam.id);
        if (match) {
          setSelectedTeam(match);
          window.api.getRoster(match.id).then((rosterData: Player[]) => {
            setRoster(rosterData);
            const positions = getAvailablePositions(rosterData);
            if (positions.length > 0) setSelectedPosition(positions[0]);
          });
        }
      }
    });
  }, []);

  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team);
    setSelectedPlayer(null);
    setSelectedPosition('');
    window.api.getRoster(team.id).then((data: Player[]) => {
      setRoster(data);
      const positions = getAvailablePositions(data);
      if (positions.length > 0) setSelectedPosition(positions[0]);
    });
  };

  const handleSelectPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setPlayerStats(null);
    setCareerStats([]);
    setStatsView('season');
    window.api.getPlayerStats(player.id).then((stats: PlayerStats) => setPlayerStats(stats));
    window.api.getPlayerCareerStats(player.id).then((stats: CareerSeasonStats[]) => setCareerStats(stats));
  };

  const availablePositions = getAvailablePositions(roster);
  const filteredPlayers = roster
    .filter(p => (p.position_label || p.position) === selectedPosition)
    .sort((a, b) => b.overall_rating - a.overall_rating);
  const ratingCols = getRatingCols(selectedPosition);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <TeamSidebar teams={teams} selectedTeam={selectedTeam} onSelectTeam={handleSelectTeam} />

      {!selectedTeam ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim }}>
          Select a team to view their roster
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.borderFaint}` }}>
            <h2 style={{ color: T.textPrimary, fontSize: 18, fontWeight: 700, margin: '0 0 2px' }}>
              {selectedTeam.city} {selectedTeam.name}
            </h2>
            <div style={{ color: T.textDim, fontSize: 12 }}>
              {selectedTeam.conference} — {selectedTeam.division}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <PlayerList
              availablePositions={availablePositions}
              selectedPosition={selectedPosition}
              setSelectedPosition={(pos) => { setSelectedPosition(pos); setSelectedPlayer(null); }}
              filteredPlayers={filteredPlayers}
              ratingCols={ratingCols}
              selectedPlayer={selectedPlayer}
              onSelectPlayer={handleSelectPlayer}
            />
            {selectedPlayer && (
              <PlayerProfile
                player={selectedPlayer}
                playerStats={playerStats}
                careerStats={careerStats}
                statsView={statsView}
                setStatsView={setStatsView}
                onClose={() => setSelectedPlayer(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
