import React from 'react';

interface Props {
  archetype: string;
  size?: 'sm' | 'md';
}

const ARCHETYPES: Record<string, { label: string; color: string; icon: string; effect: string }> = {
  team_leader:  { label: 'Team Leader',  color: '#FFD700', icon: '👑', effect: 'Boosts team chemistry' },
  vocal_leader: { label: 'Vocal Leader', color: '#64B5F6', icon: '📣', effect: 'Lifts team chemistry' },
  hard_worker:  { label: 'Hard Worker',  color: '#66BB6A', icon: '💪', effect: 'Develops faster' },
  coachable:    { label: 'Coachable',    color: '#4DB6AC', icon: '📋', effect: 'Faster progression' },
  selfish:      { label: 'Selfish',      color: '#FFA726', icon: '⚡', effect: 'Drags chemistry' },
  troublemaker: { label: 'Troublemaker', color: '#EF5350', icon: '🔥', effect: 'Hurts team chemistry' },
};

export default function ArchetypeBadge({ archetype, size = 'sm' }: Props) {
  if (!archetype || archetype === 'normal') return null;

  const meta = ARCHETYPES[archetype];
  if (!meta) return null;

  const isMd = size === 'md';

  return (
    <span
      title={meta.effect}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isMd ? 5 : 3,
        padding: isMd ? '3px 8px' : '1px 5px',
        borderRadius: 3,
        border: `1px solid ${meta.color}55`,
        background: `${meta.color}18`,
        fontFamily: 'monospace',
        fontSize: isMd ? 10 : 9,
        color: meta.color,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        cursor: 'default',
      }}
    >
      <span>{meta.icon}</span>
      <span>{meta.label.toUpperCase()}</span>
    </span>
  );
}

export { ARCHETYPES };
export type { Props as ArchetypeBadgeProps };
