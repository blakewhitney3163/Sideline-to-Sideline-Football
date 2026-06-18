import React, { useState } from 'react';
import { T } from '../theme';
import { Player, DraftPick, TeamNeed } from './types';
import { POSITIONS, TRAIT_META, trajectory, calcTradeValue, calcPickValue, pickLabel } from './tradeUtils';

export interface RosterPanelProps {
  title: string;
  subtitle: string;
  players: Player[];
  picks: DraftPick[];
  selectedPlayers: number[];
  selectedPicks: number[];
  posFilter: string;
  onPosFilter: (p: string) => void;
  onTogglePlayer: (id: number) => void;
  onTogglePick: (id: number) => void;
  accent: string;
  needs?: TeamNeed[];
  currentSeason: number;
}

export default function RosterPanel({
  title, subtitle, players, picks, selectedPlayers, selectedPicks,
  posFilter, onPosFilter, onTogglePlayer, onTogglePick,
  accent, needs, currentSeason,
}: RosterPanelProps) {
  const [showPicks, setShowPicks] = useState(false);

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 8, padding: 12, minHeight: 300 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: T.textPrimary, fontWeight: 700, fontSize: 13 }}>{title}</div>
        {subtitle && <div style={{ color: T.textDim, fontSize: 10, marginTop: 2 }}>{subtitle}</div>}
      </div>

      {/* Position filter */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
        {POSITIONS.map(pos => (
          <button key={pos} onClick={() => onPosFilter(pos)} style={{
            padding: '2px 6px',
            background: posFilter === pos ? accent : T.bgCard,
            border: `1px solid ${posFilter === pos ? accent : T.borderFaint}`,
            borderRadius: 3, color: posFilter === pos ? '#000' : T.textMuted,
            fontSize: 10, cursor: 'pointer', fontWeight: posFilter === pos ? 'bold' : 'normal',
          }}>{pos}</button>
        ))}
      </div>

      {/* Player list */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {players.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: 12, padding: 8 }}>No players</div>
        ) : players.map(player => {
          const isSelected = selectedPlayers.includes(player.id);
          const traj = trajectory(player.age);
          const val = calcTradeValue(player.overall_rating, player.age, player.position, player.dev_trait);
          const traitColor = TRAIT_META[player.dev_trait]?.color ?? T.textDim;
          const showTrait = player.dev_trait && player.dev_trait !== 'Normal';
          const need = needs?.find(n => n.position === player.position);
          return (
            <div
              key={player.id}
              onClick={() => onTogglePlayer(player.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 8px', marginBottom: 3,
                background: isSelected ? T.bgSelected : T.bgCard,
                border: `1px solid ${isSelected ? accent : 'transparent'}`,
                borderRadius: 4, cursor: 'pointer',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: T.textPrimary, fontWeight: 600, fontSize: 12 }}>
                    {player.first_name} {player.last_name}
                  </span>
                  {showTrait && (
                    <span style={{ color: traitColor, fontSize: 9, fontWeight: 700 }}>
                      {player.dev_trait === 'X-Factor' ? 'XF' : player.dev_trait === 'Superstar' ? 'SS' : 'S'}
                    </span>
                  )}
                  {need && <span style={{ color: '#FF8740', fontSize: 8, fontWeight: 700, background: T.bgOrange, padding: '1px 4px', borderRadius: 2 }}>NEED</span>}
                </div>
                <div style={{ color: T.textDim, fontSize: 10 }}>
                  {player.position_label || player.position} · {player.age} · <span style={{ color: traj.color }}>{traj.label}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                <div style={{ color: player.overall_rating >= 90 ? '#FFD700' : player.overall_rating >= 80 ? '#4caf50' : player.overall_rating >= 70 ? '#FF8740' : T.textMuted, fontWeight: 700, fontSize: 14 }}>{player.overall_rating}</div>
                <div style={{ color: T.textDim, fontSize: 10 }}>{val} val</div>
              </div>
            </div>
          );
        })}

        {/* Draft Picks */}
        {picks.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowPicks(!showPicks)}
              style={{
                width: '100%', padding: '5px 8px', background: T.bgCard,
                border: `1px solid ${T.borderFaint}`, borderRadius: 4, color: T.textMuted,
                fontSize: 10, cursor: 'pointer', textAlign: 'left', letterSpacing: 1,
              }}
            >
              {showPicks ? '▾' : '▸'} DRAFT PICKS ({picks.length})
            </button>
            {showPicks && picks.map(pk => {
              const isSelected = selectedPicks.includes(pk.id);
              const val = calcPickValue(pk.round, pk.season, currentSeason);
              return (
                <div
                  key={pk.id}
                  onClick={() => onTogglePick(pk.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 8px', marginTop: 3,
                    background: isSelected ? T.bgSelected : T.bgCard,
                    border: `1px solid ${isSelected ? accent : 'transparent'}`,
                    borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ color: T.textPrimary, fontSize: 12 }}>📋 {pickLabel(pk, currentSeason)}</div>
                    <div style={{ color: T.textDim, fontSize: 10 }}>{pk.season <= currentSeason ? 'Current year' : 'Next year'}</div>
                  </div>
                  <div style={{ color: T.textDim, fontSize: 11 }}>{val} val</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(selectedPlayers.length > 0 || selectedPicks.length > 0) && (
        <div style={{ marginTop: 8, color: accent, fontSize: 11, fontWeight: 600 }}>
          {selectedPlayers.length} player{selectedPlayers.length !== 1 ? 's' : ''}
          {selectedPicks.length > 0 ? ` + ${selectedPicks.length} pick${selectedPicks.length !== 1 ? 's' : ''}` : ''} selected
        </div>
      )}
    </div>
  );
}
