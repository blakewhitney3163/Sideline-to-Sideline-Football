import React from 'react';
import { T } from '../theme';
import { Team } from './types';

interface Props {
  seeds: Team[];
  conf: string;
}

export default function PlayoffSeedPanel({ seeds, conf }: Props) {
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 6, padding: '10px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: T.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
          {conf} PLAYOFF PICTURE
        </span>
        <span style={{ color: T.textDim, fontSize: 9 }}>TOP 7</span>
      </div>

      {seeds.length === 0 && (
        <div style={{ color: T.textDim, fontSize: 12 }}>Simulate games to see seedings</div>
      )}

      {seeds.map((team, i) => {
        const isDivWinner = i < 4;
        const hasBye = i === 0;
        return (
          <div key={team.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 0', borderBottom: `1px solid ${T.borderFaint}`,
          }}>
            <span style={{
              color: isDivWinner ? '#FF8740' : '#4FC3F7',
              fontWeight: 700, fontSize: 13, width: 18, textAlign: 'center',
            }}>
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: T.textPrimary, fontSize: 12 }}>{team.city} {team.name}</span>
            </div>
            <span style={{ color: T.textMuted, fontSize: 11 }}>{team.wins}-{team.losses}</span>
            {hasBye && (
              <span style={{ color: '#4caf50', fontSize: 9, fontWeight: 700, background: T.bgGreen, padding: '1px 5px', borderRadius: 3 }}>
                BYE
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
