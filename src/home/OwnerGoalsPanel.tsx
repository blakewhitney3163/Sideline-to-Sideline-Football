import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

declare const window: any;

interface OwnerGoal {
  id: number;
  season: number;
  goal_type: string;
  target_value: number;
  achieved: number;
}

const GOAL_LABELS: Record<string, (target: number) => string> = {
  wins:          (t) => `Win ${t}+ games`,
  playoffs:      () => 'Make the playoffs',
  championship:  () => 'Win the Gridiron Cup',
  development:   () => 'Develop a young star (age ≤25, 75+ OVR, 10+ games)',
  cap_compliance: () => 'Stay under the salary cap',
};

function patienceColor(p: number): string {
  if (p >= 60) return '#4caf50';
  if (p >= 35) return '#FF8740';
  return '#e57373';
}

function patienceLabel(p: number): string {
  if (p >= 75) return 'Confident';
  if (p >= 50) return 'Stable';
  if (p >= 35) return 'Concerned';
  if (p >= 20) return 'Frustrated';
  return 'Critical';
}

export default function OwnerGoalsPanel() {
  const { currentSeason } = useGameStore();
  const [goals, setGoals] = useState<OwnerGoal[]>([]);
  const [patience, setPatience] = useState(75);

  useEffect(() => {
    window.api.getOwnerGoals(currentSeason).then(setGoals);
    window.api.getOwnerPatience().then(setPatience);
  }, [currentSeason]);

  if (goals.length === 0) return null;

  const color = patienceColor(patience);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, color: '#444', letterSpacing: 2, marginBottom: 8, fontFamily: 'monospace' }}>
        OWNER EXPECTATIONS
      </div>

      {/* Patience meter */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>OWNER PATIENCE</span>
          <span style={{ fontSize: 10, color, fontWeight: 700, fontFamily: 'monospace' }}>
            {patienceLabel(patience)} ({patience}/100)
          </span>
        </div>
        <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${patience}%`,
            background: color,
            borderRadius: 2, transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Goals list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {goals.map(g => {
          const label = GOAL_LABELS[g.goal_type]?.(g.target_value) ?? g.goal_type;
          const isHit = g.achieved === 1;
          return (
            <div key={g.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 8px', borderRadius: 4,
              background: isHit ? '#0a1a0a' : '#111',
              border: `1px solid ${isHit ? '#2a4a2a' : '#1a1a1a'}`,
            }}>
              <span style={{ fontSize: 12, color: isHit ? '#4caf50' : '#333', flexShrink: 0 }}>
                {isHit ? '✓' : '○'}
              </span>
              <span style={{
                fontSize: 10, fontFamily: 'monospace',
                color: isHit ? '#4caf50' : '#555',
                textDecoration: isHit ? 'none' : 'none',
              }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {patience < 35 && (
        <div style={{
          marginTop: 8, padding: '6px 10px', borderRadius: 4,
          background: 'rgba(229,115,115,0.08)', border: '1px solid #3a1a1a',
          fontSize: 10, color: '#e57373', fontFamily: 'monospace',
        }}>
          ⚠ Ownership is watching closely. Results are expected this season.
        </div>
      )}
    </div>
  );
}
