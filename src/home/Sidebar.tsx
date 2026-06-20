import React from 'react';
import { T } from '../theme';
import { StandingEntry, Champion, InjuredPlayer, Matchup, UserTeam, FranchiseHealth } from './types';
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
      <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function SidebarRow({ left, right, dimLeft }: { left: string; right: string; dimLeft?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
      <span style={{ color: dimLeft ? T.textDim : T.textMuted, fontSize: 11 }}>{left}</span>
      <span style={{ color: '#ccc', fontSize: 11, fontFamily: 'monospace' }}>{right}</span>
    </div>
  );
}

const actionBtn = (bg: string, fg: string, disabled: boolean): React.CSSProperties => ({
  padding: '7px 14px', background: disabled ? T.borderMid : bg, border: 'none',
  borderRadius: 4, color: disabled ? T.textMuted : fg, fontWeight: 'bold',
  cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12, flex: 1,
});
const ovrColor = (ovr: number): string =>
  ovr >= 80 ? '#4caf50' : ovr >= 70 ? '#FF8740' : '#e57373';

const ovrGrade = (ovr: number): string =>
  ovr >= 90 ? 'A+' : ovr >= 85 ? 'A' : ovr >= 80 ? 'B+' : ovr >= 75 ? 'B' : ovr >= 70 ? 'C+' : ovr >= 65 ? 'C' : 'D';

interface Props {
  // Season controls
  userTeam: UserTeam;
  currentSeason: number;
  userRecord: { wins: number; losses: number } | null;
  hasSchedule: boolean;
  allWeeksDone: boolean;
  isPlayoffsComplete: boolean;
  currentWeek?: number | null;
  matchups?: Matchup[];
  simulating?: boolean;
  simulatingPlayoffs?: boolean;
  generatingSchedule?: boolean;
  advancing?: boolean;
  confirming?: boolean;
  pendingResigns?: number;
  retiredPlayers?: { name: string; position: string; age: number; ovr: number }[];
  setRetiredPlayers?: (v: { name: string; position: string; age: number; ovr: number }[]) => void;
  onGenerateSchedule?: () => void;
  onSimulateWeek?: () => void;
  onSimulatePlayoffs?: () => void;
  onConfirm?: () => void;
  onCancelConfirm?: () => void;
  onAdvance?: () => void;
  // Sidebar content
  injuryReport: InjuredPlayer[];
  topAFC: StandingEntry[];
  topNFC: StandingEntry[];
  champions: Champion[];
  statLeaders: any;
  userTradeStatus?: any;
  onSetTradeStatus?: (status: string) => void;
  settingStatus?: boolean;
  franchiseHealth?: FranchiseHealth | null;
}

export default function Sidebar({
  userTeam, currentSeason, userRecord,
  hasSchedule, allWeeksDone, isPlayoffsComplete,
  currentWeek, matchups = [], simulating, simulatingPlayoffs,
  generatingSchedule, advancing, confirming, pendingResigns = 0,
  retiredPlayers = [], setRetiredPlayers,
  onGenerateSchedule, onSimulateWeek, onSimulatePlayoffs,
  onConfirm, onCancelConfirm, onAdvance,
  injuryReport, topAFC, topNFC, champions, statLeaders,
  userTradeStatus, onSetTradeStatus, settingStatus, franchiseHealth,
}: Props) {

  const subtitle = !hasSchedule
    ? 'No schedule yet'
    : allWeeksDone && isPlayoffsComplete
    ? `${currentSeason} season complete`
    : allWeeksDone
    ? 'Playoffs ready'
    : currentWeek != null ? `Week ${currentWeek} of 18` : 'Season ready';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 220 }}>

      {/* Team + Season Status */}
      <SidebarBlock title="YOUR SEASON">
        <div style={{ color: '#ddd', fontWeight: 700, fontSize: 13 }}>{userTeam.city} {userTeam.name}</div>
        <div style={{ color: T.textDim, fontSize: 11, marginBottom: 6 }}>{currentSeason} · {subtitle}</div>
        {userRecord && (
          <div style={{ fontFamily: 'monospace', fontSize: 18, color: '#fff', fontWeight: 700, marginBottom: 8 }}>
            {userRecord.wins}–{userRecord.losses}
          </div>
        )}

        {/* Action buttons */}
        {!hasSchedule && onGenerateSchedule && (
          <button onClick={onGenerateSchedule} disabled={!!generatingSchedule} style={actionBtn(T.bgGreen, '#4caf50', !!generatingSchedule)}>
            {generatingSchedule ? 'Generating...' : `▶ Start ${currentSeason} Season`}
          </button>
        )}

        {hasSchedule && !allWeeksDone && currentWeek != null && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onSimulateWeek}
              disabled={!!simulating}
              style={actionBtn(T.bgGreen, '#4caf50', !!simulating)}
            >
              {simulating ? `Simulating...` : `▶ Sim Week ${currentWeek}`}
            </button>
          </div>
        )}

        {allWeeksDone && !isPlayoffsComplete && onSimulatePlayoffs && (
          <button onClick={onSimulatePlayoffs} disabled={!!simulatingPlayoffs} style={actionBtn(T.bgGreen, '#4caf50', !!simulatingPlayoffs)}>
            {simulatingPlayoffs ? 'Simulating...' : '▶ Simulate Playoffs'}
          </button>
        )}

        {allWeeksDone && isPlayoffsComplete && !confirming && onConfirm && (
          <button onClick={onConfirm} style={actionBtn(T.bgCard, pendingResigns > 0 ? '#FF8740' : T.textPrimary, false)}>
            {pendingResigns > 0 ? `⚠ ${pendingResigns} pending` : `Advance to ${currentSeason + 1} →`}
          </button>
        )}

        {confirming && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ color: T.textMuted, fontSize: 11 }}>Ages players + retires veterans. Confirm?</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onAdvance} disabled={!!advancing} style={actionBtn('#1a3a1a', '#4caf50', !!advancing)}>
                {advancing ? 'Advancing...' : 'Confirm'}
              </button>
              <button onClick={onCancelConfirm} style={actionBtn(T.bgCard, T.textMuted, false)}>Cancel</button>
            </div>
          </div>
        )}
      </SidebarBlock>

      {/* Franchise Health */}
{franchiseHealth && franchiseHealth.overall_ovr > 0 && (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#444', marginBottom: 6, textTransform: 'uppercase' }}>
      YOUR ROSTER
    </div>
    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
      {[
        { label: 'OFF', value: franchiseHealth.offense_ovr },
        { label: 'DEF', value: franchiseHealth.defense_ovr },
        { label: 'OVR', value: franchiseHealth.overall_ovr },
      ].map(({ label, value }) => (
        <div key={label} style={{ flex: 1, textAlign: 'center', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 4, padding: '4px 0' }}>
          <div style={{ fontSize: 8, color: '#444', letterSpacing: 1 }}>{label}</div>
          <div style={{ fontSize: 15, fontWeight: 'bold', color: ovrColor(value) }}>{value}</div>
          <div style={{ fontSize: 8, color: ovrColor(value), opacity: 0.7 }}>{ovrGrade(value)}</div>
        </div>
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
      {franchiseHealth.groups.map(g => (
        <div key={g.group} style={{ textAlign: 'center', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 3, padding: '3px 0' }}>
          <div style={{ fontSize: 7, color: '#444', letterSpacing: 0.5 }}>{g.group}</div>
          <div style={{ fontSize: 12, fontWeight: 'bold', color: ovrColor(g.avg_ovr) }}>{g.avg_ovr}</div>
        </div>
      ))}
    </div>
  </div>
)}

      {/* Retirements banner */}
      {retiredPlayers.length > 0 && (
        <SidebarBlock title={`RETIREMENTS — ${currentSeason - 1} OFFSEASON`}>
          <button onClick={() => setRetiredPlayers && setRetiredPlayers([])}
            style={{ fontSize: 9, background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', marginBottom: 4 }}>
            dismiss
          </button>
          {retiredPlayers.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, padding: '3px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
              <span style={{ color: T.textDim, fontSize: 10, width: 28 }}>{p.position}</span>
              <span style={{ color: '#ccc', fontSize: 11, flex: 1 }}>{p.name}</span>
              <span style={{ color: T.textDim, fontSize: 10 }}>Age {p.age} · {p.ovr} OVR</span>
            </div>
          ))}
        </SidebarBlock>
      )}

      {/* Injury Report */}
      {injuryReport.length > 0 && (
        <SidebarBlock title="INJURY REPORT">
          {injuryReport.map(p => {
            const badge = injuryBadge(p.injury_status);
            return (
              <div key={p.id ?? `${p.first_name}${p.last_name}`} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 0', borderBottom: `1px solid ${T.borderFaint}`,
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                  background: badge.bg, color: badge.color, minWidth: 24, textAlign: 'center',
                }}>{badge.label}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#ccc', fontSize: 11 }}>{p.first_name[0]}. {p.last_name}</div>
                  <div style={{ color: T.textDim, fontSize: 10 }}>{(p as any).position_label || p.position}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: T.textMuted, fontSize: 10 }}>{p.injury_type}{p.weeks_out > 0 ? ` · ${p.weeks_out}wk` : ''}</div>
                  <div style={{ color: T.textDim, fontSize: 10 }}>{p.overall_rating}</div>
                </div>
              </div>
            );
          })}
        </SidebarBlock>
      )}

      {/* AFC Standings */}
      {topAFC.length > 0 && (
        <SidebarBlock title="AFC TOP 5">
          {topAFC.map((t, i) => (
            <SidebarRow key={t.team_name} left={`${i + 1}. ${t.team_name}`} right={`${t.wins}-${t.losses}`} />
          ))}
        </SidebarBlock>
      )}

      {/* NFC Standings */}
      {topNFC.length > 0 && (
        <SidebarBlock title="NFC TOP 5">
          {topNFC.map((t, i) => (
            <SidebarRow key={t.team_name} left={`${i + 1}. ${t.team_name}`} right={`${t.wins}-${t.losses}`} />
          ))}
        </SidebarBlock>
      )}

      {/* Champions */}
      {champions.length > 0 && (
        <SidebarBlock title="GRIDIRON CUP CHAMPIONS">
          {champions.slice(0, 5).map((c, i) => (
            <SidebarRow key={i} left={String(c.season)} right={c.team_name} dimLeft />
          ))}
        </SidebarBlock>
      )}

      {/* Stat Leaders */}
      {statLeaders && (statLeaders.passing?.length > 0 || statLeaders.rushing?.length > 0) && (
        <SidebarBlock title="STAT LEADERS">
          {[
            { label: 'PASS YDS', p: statLeaders.passing?.[0], val: (p: any) => p.pass_yards?.toLocaleString() },
            { label: 'RUSH YDS', p: statLeaders.rushing?.[0], val: (p: any) => p.rush_yards?.toLocaleString() },
            { label: 'REC YDS', p: statLeaders.receiving?.[0], val: (p: any) => p.rec_yards?.toLocaleString() },
            { label: 'SACKS', p: statLeaders.sacks?.[0], val: (p: any) => Number(p.sacks ?? 0).toFixed(1) },
            { label: 'TACKLES', p: statLeaders.tackles?.[0], val: (p: any) => ((p.tackles ?? 0) + (p.assisted_tackles ?? 0)).toString() },
          ].filter(r => r.p).map(({ label, p, val }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
              <span style={{ color: T.textDim, fontSize: 10 }}>{label}</span>
              <span style={{ color: '#bbb', fontSize: 11, flex: 1, textAlign: 'center' }}>{p.player_name}</span>
              <span style={{ color: '#4FC3F7', fontSize: 11, fontFamily: 'monospace' }}>{val(p)}</span>
            </div>
          ))}
        </SidebarBlock>
      )}

      {/* Trade Status */}
      {userTradeStatus && onSetTradeStatus && (
        <SidebarBlock title="YOUR TRADE STATUS">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ color: STATUS_META[userTradeStatus.status]?.color ?? '#aaa', fontWeight: 700, fontSize: 12 }}>
              {userTradeStatus.status}
            </span>
            {userTradeStatus.isOverridden && (
              <span style={{ fontSize: 9, color: T.textDim, border: `1px solid ${T.borderFaint}`, borderRadius: 3, padding: '1px 4px' }}>manual</span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {['auto', 'Buyer', 'Seller', 'Rebuilding', 'Neutral'].map(opt => {
              const isCurrent = opt === 'auto'
                ? !userTradeStatus.isOverridden
                : userTradeStatus.isOverridden && userTradeStatus.status === opt;
              return (
                <button key={opt} onClick={() => onSetTradeStatus(opt)}
                  disabled={settingStatus || isCurrent}
                  style={{
                    padding: '3px 8px', fontSize: 9, borderRadius: 3,
                    cursor: isCurrent ? 'default' : 'pointer',
                    fontFamily: 'monospace', letterSpacing: 0.5,
                    background: isCurrent ? (STATUS_META[opt]?.bg ?? '#1a1a1a') : '#0f0f0f',
                    border: `1px solid ${isCurrent ? (STATUS_META[opt]?.color ?? '#555') : '#1e1e1e'}`,
                    color: isCurrent ? (STATUS_META[opt]?.color ?? '#aaa') : '#444',
                    fontWeight: isCurrent ? 'bold' : 'normal',
                  }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </SidebarBlock>
      )}

      {topAFC.length === 0 && topNFC.length === 0 && (
        <div style={{ color: T.textDim, fontSize: 11 }}>Simulate games to see standings</div>
      )}
    </div>
  );
}
