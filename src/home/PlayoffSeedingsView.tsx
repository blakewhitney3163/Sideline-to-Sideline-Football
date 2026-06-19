import React from 'react';
import { T } from '../theme';
import { SeedEntry } from './types';

function SeedingList({ title, seeds }: { title: string; seeds: SeedEntry[] }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ color: T.textMuted, fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      {seeds.map((team, i) => (
        <div key={team.team_name} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 8px', marginBottom: 3,
          background: i === 0 ? '#0a1a0a' : T.bgPanel,
          border: `1px solid ${i === 0 ? '#2a4a2a' : T.borderFaint}`,
          borderRadius: 4,
        }}>
          <span style={{ color: T.textDim, fontSize: 10, width: 14, textAlign: 'right' }}>{i + 1}</span>
          <span style={{ color: '#ccc', fontSize: 12, flex: 1 }}>{team.team_name}</span>
          <span style={{ color: T.textMuted, fontSize: 11 }}>{team.wins}-{team.losses}</span>
          {i === 0 && <span style={{ fontSize: 9, color: '#4caf50', border: '1px solid #2a4a2a', borderRadius: 3, padding: '1px 4px' }}>BYE</span>}
        </div>
      ))}
    </div>
  );
}

interface Props {
  seeds: { afc: SeedEntry[]; nfc: SeedEntry[] } | null;
  onSimulate?: () => void;
  simulating?: boolean;
}

export default function PlayoffSeedingsView({ seeds, onSimulate, simulating }: Props) {
  if (!seeds) return <div style={{ color: T.textMuted, padding: 16 }}>Loading seeds...</div>;
  return (
    <div>
      <div style={{ color: T.textMuted, fontSize: 11, letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>
        PLAYOFF SEEDINGS — TOP 7 PER CONFERENCE
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <SeedingList title="AFC" seeds={seeds.afc} />
        <SeedingList title="NFC" seeds={seeds.nfc} />
      </div>
      {onSimulate && (
        <button
          onClick={onSimulate}
          disabled={!!simulating}
          style={{
            padding: '10px 24px', background: simulating ? T.borderMid : T.bgGreen,
            border: 'none', borderRadius: 5, color: simulating ? T.textMuted : '#4caf50',
            fontWeight: 'bold', cursor: simulating ? 'not-allowed' : 'pointer', fontSize: 13,
          }}
        >
          {simulating ? 'Simulating Playoffs...' : '▶ Simulate Playoffs'}
        </button>
      )}
    </div>
  );
}
