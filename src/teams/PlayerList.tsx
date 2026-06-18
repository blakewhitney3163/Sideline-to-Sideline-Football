import React from 'react';
import { T } from '../theme';
import { Player, RatingCol } from './types';
import { getOvrColor, attrColor } from './teamsUtils';

interface Props {
  availablePositions: string[];
  selectedPosition: string;
  setSelectedPosition: (pos: string) => void;
  filteredPlayers: Player[];
  ratingCols: RatingCol[];
  selectedPlayer: Player | null;
  onSelectPlayer: (player: Player) => void;
}

export default function PlayerList({
  availablePositions, selectedPosition, setSelectedPosition,
  filteredPlayers, ratingCols, selectedPlayer, onSelectPlayer,
}: Props) {
  const gridCols = `20px 1fr 28px 38px ${ratingCols.map(() => '38px').join(' ')}`;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Position tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '10px 16px', borderBottom: `1px solid ${T.borderFaint}` }}>
        {availablePositions.map(pos => (
          <button key={pos} onClick={() => { setSelectedPosition(pos); }} style={{
            padding: '4px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer',
            background: selectedPosition === pos ? '#4FC3F7' : T.bgCard,
            color: selectedPosition === pos ? '#000' : T.textSecondary,
            fontWeight: selectedPosition === pos ? 'bold' : 'normal',
            fontSize: '12px',
          }}>
            {pos}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: gridCols, gap: 6,
        padding: '6px 12px', fontSize: 9, color: T.textDim, letterSpacing: 1,
        borderBottom: `1px solid ${T.borderFaint}`,
      }}>
        <span>#</span>
        <span>NAME</span>
        <span>AGE</span>
        <span>OVR</span>
        {ratingCols.map(c => <span key={c.label}>{c.label}</span>)}
      </div>

      {/* Player rows */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filteredPlayers.map((player, i) => (
          <div
            key={player.id}
            onClick={() => onSelectPlayer(player)}
            style={{
              display: 'grid', gridTemplateColumns: gridCols,
              gap: 6, alignItems: 'center', padding: '8px 12px',
              borderBottom: `1px solid ${T.borderFaint}`, cursor: 'pointer',
              background: selectedPlayer?.id === player.id ? T.bgBlue : 'transparent',
            }}
          >
            <span style={{ color: T.textDim, fontSize: 11 }}>{i + 1}</span>
            <div>
              <span style={{ color: T.textPrimary, fontSize: 13 }}>
                {player.first_name} {player.last_name}
              </span>
            </div>
            <span style={{ color: T.textDim, fontSize: 11 }}>{player.age}</span>
            <span style={{ color: getOvrColor(player.overall_rating), fontWeight: 700, fontSize: 13 }}>
              {player.overall_rating}
            </span>
            {ratingCols.map(c => (
              <span key={c.label} style={{ color: attrColor((player[c.key] as number) ?? 0), fontSize: 11 }}>
                {(player[c.key] as number) ?? '—'}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
