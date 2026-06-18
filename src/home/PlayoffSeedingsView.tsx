import React from 'react';
import { T } from '../theme';
import { SeedEntry } from './types';

function SeedingList({ title, seeds }: { title: string; seeds: SeedEntry[] }) {
  return (
    <div>
      <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      {seeds.map((team, i) => (
        <div key={team.id} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 0', borderBottom: `1px solid ${T.borderFaint}`, fontSize: 12,
        }}>
          <span style={{ color: T.textDim, width: 16, textAlign: 'center' }}>{i + 1}</span>
          <span style={{ flex: 1, color: T.textPrimary }}>{team.team_name}</span>
          <span style={{ color: T.textMuted }}>{team.wins}-{team.losses}</span>
          {i === 0 && <span style={{ color: '#4FC3F7', fontSize: 9, fontWeight: 700 }}>BYE</span>}
        </div>
      ))}
    </div>
  );
}

export default function PlayoffSeedingsView({ seeds }: { seeds: { afc: SeedEntry[]; nfc: SeedEntry[] } | null }) {
  if (!seeds) return <div style={{ color: T.textMuted, fontSize: 13 }}>Loading seeds...</div>;
  return (
    <div>
      <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 16 }}>
        PLAYOFF SEEDINGS — TOP 7 PER CONFERENCE
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <SeedingList title="AFC" seeds={seeds.afc} />
        <SeedingList title="NFC" seeds={seeds.nfc} />
      </div>
    </div>
  );
}
