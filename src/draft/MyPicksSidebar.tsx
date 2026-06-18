import React from 'react';
import { T } from '../theme';
import { MyPick, PickSlot, DraftTeam } from './types';
import { ROUND_LABELS, TRAIT_META } from './draftUtils';

interface Props {
  myPicks: MyPick[];
  currentRound: number;
  roundPickSlots: PickSlot[];
  draftOrder: DraftTeam[];
  userTeam: { id: number; city: string; name: string };
}

export default function MyPicksSidebar({ myPicks, currentRound, roundPickSlots, draftOrder, userTeam }: Props) {
  const sortedPicks = [...myPicks].sort((a, b) => a.round - b.round || a.slot - b.slot);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* My picks so far */}
      <div style={{ background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 8, padding: 12 }}>
        <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 10 }}>YOUR PICKS SO FAR</div>
        {sortedPicks.length === 0 && (
          <div style={{ color: T.textDim, fontSize: 12 }}>None yet.</div>
        )}
        {sortedPicks.map((pick, i) => {
          const trait = TRAIT_META[pick.player.dev_trait] ?? TRAIT_META['Normal'];
          return (
            <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${T.borderFaint}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: T.textDim, fontSize: 10 }}>Rd {pick.round} #{pick.slot}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: pick.player.overall_rating >= 78 ? '#4caf50' : T.textMuted, fontWeight: 700, fontSize: 13 }}>
                    {pick.player.overall_rating}
                  </span>
                  <span style={{ color: pick.gradeColor, fontWeight: 700, fontSize: 11 }}>{pick.grade}</span>
                </div>
              </div>
              <div style={{ color: T.textPrimary, fontWeight: 600, fontSize: 12 }}>
                {pick.player.first_name} {pick.player.last_name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ color: T.textMuted, fontSize: 10 }}>{pick.player.position}</span>
                <span style={{ color: T.textDim, fontSize: 10 }}>{pick.player.overall_rating} OVR</span>
                {trait.short && (
                  <span style={{ color: trait.color, fontSize: 9, fontWeight: 700 }}>{trait.short}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Round order */}
      <div style={{ background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 8, padding: 12 }}>
        <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>ROUND {currentRound} ORDER</div>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {roundPickSlots.slice(0, 32).map(s => {
            const isUser = s.ownerTeamId === userTeam.id;
            return (
              <div key={s.slot} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
                borderBottom: `1px solid ${T.borderFaint}`,
                background: isUser ? T.bgGreen : 'transparent',
              }}>
                <span style={{ color: T.textDim, fontSize: 10, width: 20, textAlign: 'right' }}>{s.slot}</span>
                <span style={{ flex: 1, color: isUser ? '#4caf50' : T.textMuted, fontSize: 11, fontWeight: isUser ? 700 : 400 }}>
                  {isUser ? `★ ${userTeam.city} ${userTeam.name}` : `${s.ownerCity} ${s.ownerName}`}
                </span>
                {s.isTraded && <span style={{ color: '#4FC3F7', fontSize: 8, fontWeight: 700 }}>TRD</span>}
                {s.isUsed  && <span style={{ color: '#4caf50', fontSize: 10 }}>✓</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
