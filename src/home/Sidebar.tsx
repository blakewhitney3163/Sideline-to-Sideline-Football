import React from 'react';
import { T } from '../theme';
import { StandingEntry, Champion, InjuredPlayer } from './types';
import { STATUS_META } from '../trades/tradeUtils';

function injuryBadge(status: string): { label: string; color: string; bg: string } {
  if (status === 'ir') return { label: 'IR', color: '#e57373', bg: T.bgRed };
  if (status === 'out') return { label: 'OUT', color: '#FF8740', bg: T.bgOrange };
  if (status === 'questionable') return { label: 'Q', color: '#FFD700', bg: T.bgGold };
  return { label: '', color: T.textMuted, bg: 'transparent' };
}

function SidebarBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 1, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function SidebarRow({ left, right, dimLeft }: { left: string; right: string; dimLeft?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
      <span style={{ color: dimLeft ? T.textDim : T.textMuted }}>{left}</span>
      <span style={{ color: T.textPrimary }}>{right}</span>
    </div>
  );
}

interface Props {
  injuryReport: InjuredPlayer[];
  topAFC: StandingEntry[];
  topNFC: StandingEntry[];
  champions: Champion[];
  statLeaders: any;
  userTradeStatus?: any;
  onSetTradeStatus?: (status: string) => void;
  settingStatus?: boolean;
}

export default function Sidebar({
  injuryReport, topAFC, topNFC, champions, statLeaders,
  userTradeStatus, onSetTradeStatus, settingStatus,
}: Props) {
  return (
    <div>

      {/* Injury Report */}
      {injuryReport.length > 0 && (
        <SidebarBlock title="INJURY REPORT">
          {injuryReport.map(p => {
            const badge = injuryBadge(p.injury_status);
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{
                  fontSize: 9, fontWeight: 'bold', padding: '1px 5px', borderRadius: 2,
                  background: badge.bg, color: badge.color, minWidth: 22, textAlign: 'center',
                }}>{badge.label}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.textPrimary }}>
                    {p.first_name[0]}. {p.last_name}
                  </div>
                  <div style={{ fontSize: 9, color: T.textDim }}>
                    {p.position_label || p.position}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: badge.color }}>
                    {p.injury_type}{p.weeks_out > 0 ? ` · ${p.weeks_out}wk` : ''}
                  </div>
                  <div style={{ fontSize: 9, color: T.textDim }}>{p.overall_rating}</div>
                </div>
              </div>
            );
          })}
        </SidebarBlock>
      )}

      {/* AFC Standings */}
      {topAFC.length > 0 && (
        <SidebarBlock title="TOP AFC">
          {topAFC.map((t, i) => (
            <SidebarRow key={t.id} left={`${i + 1}. ${t.city} ${t.name}`} right={`${t.wins}-${t.losses}`} />
          ))}
        </SidebarBlock>
      )}

      {/* NFC Standings */}
      {topNFC.length > 0 && (
        <SidebarBlock title="TOP NFC">
          {topNFC.map((t, i) => (
            <SidebarRow key={t.id} left={`${i + 1}. ${t.city} ${t.name}`} right={`${t.wins}-${t.losses}`} />
          ))}
        </SidebarBlock>
      )}

      {/* Champions */}
      {champions.length > 0 && (
        <SidebarBlock title="GRIDIRON CUP">
          {champions.slice(0, 6).map((c, i) => (
            <SidebarRow key={i} left={`${c.season}`} right={`${c.city} ${c.name}`} dimLeft />
          ))}
        </SidebarBlock>
      )}

      {/* Stat Leaders */}
      {statLeaders && (statLeaders.passing?.length > 0 || statLeaders.rushing?.length > 0) && (
        <SidebarBlock title="STAT LEADERS">
          {[
            { label: 'PASS YDS', p: statLeaders.passing?.[0],   val: (p: any) => p.pass_yards?.toLocaleString() },
            { label: 'RUSH YDS', p: statLeaders.rushing?.[0],   val: (p: any) => p.rush_yards?.toLocaleString() },
            { label: 'REC YDS',  p: statLeaders.receiving?.[0], val: (p: any) => p.rec_yards?.toLocaleString() },
            { label: 'SACKS',    p: statLeaders.sacks?.[0],     val: (p: any) => Number(p.sacks ?? 0).toFixed(1) },
            { label: 'TACKLES',  p: statLeaders.tackles?.[0],   val: (p: any) => ((p.tackles ?? 0) + (p.assisted_tackles ?? 0)).toString() },
          ].filter(r => r.p).map(({ label, p, val }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
              <span style={{ color: T.textDim, minWidth: 60 }}>{label}</span>
              <span style={{ color: T.textMuted, flex: 1, textAlign: 'center' }}>{p.player_name}</span>
              <span style={{ color: T.textPrimary }}>{val(p)}</span>
            </div>
          ))}
        </SidebarBlock>
      )}

      {/* Trade Status */}
      {userTradeStatus && onSetTradeStatus && (
        <SidebarBlock title="TRADE STATUS">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 'bold', padding: '2px 8px', borderRadius: 3,
              color: STATUS_META[userTradeStatus.status]?.color ?? '#aaa',
              background: `${STATUS_META[userTradeStatus.status]?.color ?? '#aaa'}18`,
              border: `1px solid ${STATUS_META[userTradeStatus.status]?.color ?? '#aaa'}44`,
            }}>
              {userTradeStatus.status}
            </span>
            {userTradeStatus.isOverridden && (
              <span style={{ fontSize: 9, color: '#444' }}>manual</span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {['auto', 'Buyer', 'Seller', 'Rebuilding', 'Neutral'].map(opt => {
              const isCurrent = opt === 'auto'
                ? !userTradeStatus.isOverridden
                : userTradeStatus.isOverridden && userTradeStatus.status === opt;
              return (
                <button
                  key={opt}
                  onClick={() => onSetTradeStatus(opt)}
                  disabled={settingStatus || isCurrent}
                  style={{
                    padding: '3px 8px', fontSize: 9, borderRadius: 3,
                    cursor: isCurrent ? 'default' : 'pointer',
                    fontFamily: 'monospace', letterSpacing: 0.5,
                    background: isCurrent ? (STATUS_META[opt]?.bg ?? '#1a1a1a') : '#0f0f0f',
                    border: `1px solid ${isCurrent ? (STATUS_META[opt]?.color ?? '#555') : '#1e1e1e'}`,
                    color: isCurrent ? (STATUS_META[opt]?.color ?? '#aaa') : '#444',
                    fontWeight: isCurrent ? 'bold' : 'normal',
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </SidebarBlock>
      )}

      {/* Empty state */}
      {topAFC.length === 0 && topNFC.length === 0 && (
        <div style={{ fontSize: 11, color: T.textDim }}>Simulate games to see standings</div>
      )}

    </div>
  );
}
