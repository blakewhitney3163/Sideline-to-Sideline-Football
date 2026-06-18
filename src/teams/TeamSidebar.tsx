import React from 'react';
import { T } from '../theme';
import { Team } from './types';

interface Props {
  teams: Team[];
  selectedTeam: Team | null;
  onSelectTeam: (team: Team) => void;
}

export default function TeamSidebar({ teams, selectedTeam, onSelectTeam }: Props) {
  return (
    <div style={{
      width: 220, flexShrink: 0, overflowY: 'auto',
      borderRight: `1px solid ${T.borderFaint}`,
    }}>
      {['AFC', 'NFC'].map(conf => (
        <div key={conf}>
          <div style={{
            padding: '8px 14px', fontSize: 10, fontWeight: 700,
            letterSpacing: 1, color: T.textDim,
            background: T.bgPanel, borderBottom: `1px solid ${T.borderFaint}`,
          }}>
            {conf}
          </div>
          {teams.filter(t => t.conference === conf).map(team => (
            <div
              key={team.id}
              onClick={() => onSelectTeam(team)}
              style={{
                padding: '10px 14px', cursor: 'pointer',
                color: selectedTeam?.id === team.id ? '#4FC3F7' : T.textPrimary,
                background: selectedTeam?.id === team.id ? T.bgBlue : 'transparent',
                borderBottom: `1px solid ${T.borderFaint}`, fontSize: '13px',
              }}
            >
              {team.city} {team.name}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
