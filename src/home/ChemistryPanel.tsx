import React from 'react';
import { T } from '../theme';

interface ChemistryEvent {
  id: number;
  week: number;
  delta: number;
  reason: string;
}

interface Props {
  chemistry: number;
  events: ChemistryEvent[];
}

function chemColor(c: number): string {
  if (c >= 75) return '#4caf50';
  if (c >= 60) return '#8bc34a';
  if (c >= 40) return '#FF8740';
  if (c >= 25) return '#ef9a9a';
  return '#e57373';
}

function chemLabel(c: number): string {
  if (c >= 90) return 'Electric';
  if (c >= 75) return 'Strong';
  if (c >= 60) return 'Good';
  if (c >= 40) return 'Neutral';
  if (c >= 25) return 'Shaky';
  return 'Toxic';
}

function chemModLabel(c: number): string {
  if (c >= 90) return '+3 sim boost';
  if (c >= 75) return '+2 sim boost';
  if (c >= 60) return '+1 sim boost';
  if (c >= 40) return 'no effect';
  if (c >= 30) return '−2 sim penalty';
  return '−4 sim penalty';
}

export default function ChemistryPanel({ chemistry, events }: Props) {
  const color = chemColor(chemistry);

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 6, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ color: T.textMuted, fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 }}>
          🧪 LOCKER ROOM CHEMISTRY
        </div>
        <div style={{ color: T.textDim, fontFamily: 'monospace', fontSize: 9 }}>
          {chemModLabel(chemistry)}
        </div>
      </div>

      {/* Meter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 8, background: '#0f172a', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${chemistry}%`,
            background: color,
            borderRadius: 4,
            transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', color, minWidth: 36, textAlign: 'right' }}>
          {chemistry}
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 10, color, minWidth: 48 }}>
          {chemLabel(chemistry)}
        </div>
      </div>

      {/* Recent events */}
      {events.length > 0 && (
        <div style={{ marginTop: 8, borderTop: `1px solid ${T.borderFaint}`, paddingTop: 8 }}>
          {events.map(ev => (
            <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: T.textDim, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.week > 0 ? `Wk ${ev.week} · ` : 'Offseason · '}{ev.reason.replace(/[()]/g, '')}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold', color: ev.delta > 0 ? '#4caf50' : '#e57373', marginLeft: 8, flexShrink: 0 }}>
                {ev.delta > 0 ? `+${ev.delta}` : ev.delta}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
