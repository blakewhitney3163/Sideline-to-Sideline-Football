import React from 'react';
import { T } from '../theme';
import { StandingEntry, Champion, InjuredPlayer } from './types';

function injuryBadge(status: string): { label: string; color: string; bg: string } {
  if (status === 'ir')           return { label: 'IR',  color: '#e57373', bg: T.bgRed };
  if (status === 'out')          return { label: 'OUT', color: '#FF8740', bg: T.bgOrange };
  if (status === 'questionable') return { label: 'Q',   color: '#FFD700', bg: T.bgGold };
  return { label: '', color: T.textMuted, bg: 'transparent' };
}

function SidebarBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, background: T.bgCard, borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function SidebarRow({ left, right, dimLeft }: { left: string; right: string; dimLeft?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
      <span style={{ color: dimLeft ? T.textDim : T.textMuted }}>{left}</span>
      <span style={{ color: T.textPrimary, fontWeight: 600 }}>{right}</span>
    </div>
  );
}

interface Props {
  injuryReport: InjuredPlayer[];
  topAFC: StandingEntry[];
  topNFC: StandingEntry[];
  champions: Champion[];
  statLeaders: any;
}

export default function Sidebar({ injuryReport, topAFC, topNFC, champions, statLeaders }: Props) {
  return (
    <div>
      {injuryReport.length > 0 && (
        <SidebarBlock title="INJURY REPORT">
          {injuryReport.map(p => {
            const badge = injuryBadge(p.injury_status);
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                <span style={{ color: badge.color, background: badge.bg, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, minWidth: 24, textAlign: 'center' }}>
                  {badge.label}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.textPrimary, fontSize: 12, fontWeight: 600 }}>
                    {p.first_name[0]}. {p.last_name}
                  </div>
                  <div style={{ color: T.textDim, fontSize: 10 }}>{p.position_label || p.position}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: T.textMuted, fontSize: 10 }}>
                    {p.injury_type}{p.weeks_out > 0 ? ` · ${p.weeks_out}wk` : ''}
                  </div>
                  <div style={{ color: T.textDim, fontSize: 10 }}>{p.overall_rating}</div>
                </div>
              </div>
            );
          })}
        </SidebarBlock>
      )}

      {topAFC.length > 0 && (
        <SidebarBlock title="AFC STANDINGS">
          {topAFC.map((t, i) => (
            <SidebarRow key={i} left={t.team_name} right={`${t.wins}-${t.losses}`} />
          ))}
        </SidebarBlock>
      )}

      {topNFC.length > 0 && (
        <SidebarBlock title="NFC STANDINGS">
          {topNFC.map((t, i) => (
            <SidebarRow key={i} left={t.team_name} right={`${t.wins}-${t.losses}`} />
          ))}
        </SidebarBlock>
      )}

      {champions.length > 0 && (
        <SidebarBlock title="SUPER BOWL CHAMPIONS">
          {champions.slice(0, 6).map((c, i) => (
            <SidebarRow key={i} left={`${c.season}`} right={c.team_name} dimLeft />
          ))}
        </SidebarBlock>
      )}

      {statLeaders && (statLeaders.passing?.length > 0 || statLeaders.rushing?.length > 0) && (
        <SidebarBlock title="SEASON LEADERS">
          {[
            { label: 'PASS YDS', p: statLeaders.passing?.[0],   val: (p: any) => p.pass_yards?.toLocaleString() },
            { label: 'RUSH YDS', p: statLeaders.rushing?.[0],   val: (p: any) => p.rush_yards?.toLocaleString() },
            { label: 'REC YDS',  p: statLeaders.receiving?.[0], val: (p: any) => p.rec_yards?.toLocaleString() },
            { label: 'SACKS',    p: statLeaders.sacks?.[0],     val: (p: any) => Number(p.sacks ?? 0).toFixed(1) },
            { label: 'TACKLES',  p: statLeaders.tackles?.[0],   val: (p: any) => ((p.tackles ?? 0) + (p.assisted_tackles ?? 0)).toString() },
          ].filter(r => r.p).map(({ label, p, val }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 11, borderBottom: `1px solid ${T.borderFaint}` }}>
              <span style={{ color: T.textDim, fontSize: 9, letterSpacing: 0.5 }}>{label}</span>
              <span style={{ color: T.textMuted, flex: 1, marginLeft: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player_name}</span>
              <span style={{ color: T.textPrimary, fontWeight: 700, fontFamily: 'monospace' }}>{val(p)}</span>
            </div>
          ))}
        </SidebarBlock>
      )}

      {topAFC.length === 0 && topNFC.length === 0 && (
        <div style={{ color: T.textDim, fontSize: 12 }}>Simulate games to see standings</div>
      )}
    </div>
  );
}
