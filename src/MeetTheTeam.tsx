import React, { useEffect, useState } from 'react';

declare const window: any;

interface Props {
  team: { id: number; city: string; name: string; abbreviation: string; conference: string; division: string };
  season: number;
  onStart: () => void;
}

function gradeFromOvr(ovr: number): { letter: string; color: string } {
  if (ovr >= 90) return { letter: 'A+', color: '#22c55e' };
  if (ovr >= 85) return { letter: 'A',  color: '#4ade80' };
  if (ovr >= 80) return { letter: 'B+', color: '#86efac' };
  if (ovr >= 75) return { letter: 'B',  color: '#fbbf24' };
  if (ovr >= 70) return { letter: 'C+', color: '#f59e0b' };
  if (ovr >= 65) return { letter: 'C',  color: '#fb923c' };
  return { letter: 'D', color: '#f87171' };
}

function ovrColor(ovr: number): string {
  if (ovr >= 90) return '#22c55e';
  if (ovr >= 80) return '#86efac';
  if (ovr >= 70) return '#fbbf24';
  return '#f87171';
}

const OFFENSE_POS = new Set(['QB','WR','RB','TE','OL','C','G','OT','T','LT','RT','LG','RG']);

const TRAIT_META: Record<string, { short: string; color: string; bg: string }> = {
  'X-Factor': { short: 'XF',  color: '#fff',    bg: '#f97316' },
  'Superstar': { short: 'SS', color: '#fff',    bg: '#a855f7' },
  'Star':      { short: '★',  color: '#1e293b', bg: '#38bdf8' },
  'Normal':    { short: '',   color: '#94a3b8', bg: 'transparent' },
};

export default function MeetTheTeam({ team, season, onStart }: Props) {
  const [contracts, setContracts] = useState<any[]>([]);
  const [cap, setCap] = useState<any>(null);
  const [needs, setNeeds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, s, n] = await Promise.all([
        window.api.getTeamContracts(team.id),
        window.api.getCapSummary(team.id),
        window.api.getTeamNeeds(team.id),
      ]);
      setContracts(c);
      setCap(s);
      setNeeds(Array.isArray(n) ? n.map((item: any) => item.position ?? item) : []);
      setLoading(false);
    })();
  }, [team.id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', color: '#e2e8f0', fontSize: 18, letterSpacing: 2 }}>
        LOADING ROSTER...
      </div>
    );
  }

  const sorted = [...contracts].sort((a, b) => b.overall_rating - a.overall_rating);
  const starPlayers = sorted.slice(0, 10);
  const offense = contracts.filter(p => OFFENSE_POS.has(p.position));
  const defense = contracts.filter(p => !OFFENSE_POS.has(p.position));
  const avgOvr = contracts.length ? Math.round(contracts.reduce((s, p) => s + p.overall_rating, 0) / contracts.length) : 0;
  const avgOff = offense.length ? Math.round(offense.reduce((s, p) => s + p.overall_rating, 0) / offense.length) : 0;
  const avgDef = defense.length ? Math.round(defense.reduce((s, p) => s + p.overall_rating, 0) / defense.length) : 0;
  const expiring = contracts.filter(c => c.years_remaining === 1).length;
  const { letter: grade, color: gradeColor } = gradeFromOvr(avgOvr);

  const S = {
    page: {
      height: '100vh',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      overflowY: 'auto' as const,
    },
    header: {
      background: 'linear-gradient(135deg, #1e3a5f 0%, #1e293b 100%)',
      borderBottom: '2px solid #334155',
      padding: '28px 40px 24px',
    },
    eyebrow: {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 4,
      color: '#60a5fa',
      textTransform: 'uppercase' as const,
      marginBottom: 8,
    },
    teamName: {
      fontSize: 36,
      fontWeight: 800,
      color: '#f1f5f9',
      margin: 0,
      lineHeight: 1.1,
    },
    subHead: {
      fontSize: 14,
      color: '#94a3b8',
      marginTop: 6,
    },
    cardRow: {
      display: 'flex',
      gap: 16,
      padding: '24px 40px',
      flexWrap: 'wrap' as const,
    },
    statCard: {
      flex: 1,
      minWidth: 160,
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 12,
      padding: '20px 24px',
    },
    cardLabel: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 3,
      color: '#64748b',
      textTransform: 'uppercase' as const,
      marginBottom: 10,
    },
    cardValue: {
      fontSize: 32,
      fontWeight: 800,
      lineHeight: 1,
      marginBottom: 6,
    },
    cardSub: {
      fontSize: 12,
      color: '#94a3b8',
    },
    body: {
      display: 'flex',
      gap: 20,
      padding: '0 40px 40px',
      alignItems: 'flex-start',
    },
    leftCol: {
      flex: 2,
      minWidth: 0,
    },
    rightCol: {
      flex: 1,
      minWidth: 260,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 16,
    },
    panel: {
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 12,
      overflow: 'hidden',
    },
    panelHead: {
      background: '#263548',
      padding: '12px 20px',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 3,
      color: '#94a3b8',
      textTransform: 'uppercase' as const,
      borderBottom: '1px solid #334155',
    },
    playerRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 20px',
      borderBottom: '1px solid #1e2d3d',
      transition: 'background 0.15s',
    },
    rankBadge: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: '#334155',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 700,
      color: '#94a3b8',
      flexShrink: 0,
    },
    playerName: {
      flex: 1,
      fontSize: 14,
      fontWeight: 600,
      color: '#f1f5f9',
    },
    posBadge: {
      fontSize: 11,
      fontWeight: 700,
      color: '#94a3b8',
      background: '#334155',
      padding: '2px 8px',
      borderRadius: 4,
    },
    ovrBadge: {
      fontSize: 15,
      fontWeight: 800,
      minWidth: 36,
      textAlign: 'right' as const,
    },
    needsWrap: {
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: 8,
      padding: 16,
    },
    needChip: {
      background: '#172554',
      border: '1px solid #1d4ed8',
      color: '#93c5fd',
      padding: '5px 14px',
      borderRadius: 20,
      fontSize: 13,
      fontWeight: 700,
    },
    snapshotRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '13px 20px',
      borderBottom: '1px solid #1e2d3d',
    },
    snapshotLabel: {
      fontSize: 13,
      color: '#cbd5e1',
    },
    tipRow: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 20px',
      borderBottom: '1px solid #1e2d3d',
      fontSize: 13,
      color: '#cbd5e1',
      lineHeight: 1.4,
    },
    tipArrow: {
      color: '#3b82f6',
      fontWeight: 700,
      flexShrink: 0,
      marginTop: 1,
    },
    cta: {
      padding: '28px 40px',
      background: '#0f172a',
      borderTop: '1px solid #1e293b',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap' as const,
      gap: 16,
    },
    ctaBtn: {
      background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
      color: '#fff',
      border: 'none',
      borderRadius: 10,
      padding: '16px 40px',
      fontSize: 16,
      fontWeight: 800,
      letterSpacing: 2,
      textTransform: 'uppercase' as const,
      cursor: 'pointer',
      boxShadow: '0 4px 24px rgba(37,99,235,0.4)',
      transition: 'transform 0.1s, box-shadow 0.1s',
    },
    ctaSub: {
      fontSize: 13,
      color: '#64748b',
      maxWidth: 400,
    },
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.eyebrow}>MEET YOUR TEAM · {season}</div>
        <h1 style={S.teamName}>{team.city} {team.name}</h1>
        <div style={S.subHead}>{team.conference} · {team.division}</div>
      </div>

      {/* Stat Cards */}
      <div style={S.cardRow}>
        <div style={S.statCard}>
          <div style={S.cardLabel}>Team Grade</div>
          <div style={{ ...S.cardValue, color: gradeColor }}>{grade}</div>
          <div style={S.cardSub}>{avgOvr} avg OVR · {contracts.length} players</div>
        </div>
        <div style={S.statCard}>
          <div style={S.cardLabel}>Offense</div>
          <div style={{ ...S.cardValue, color: ovrColor(avgOff) }}>{avgOff}</div>
          <div style={S.cardSub}>{offense.length} players</div>
        </div>
        <div style={S.statCard}>
          <div style={S.cardLabel}>Defense</div>
          <div style={{ ...S.cardValue, color: ovrColor(avgDef) }}>{avgDef}</div>
          <div style={S.cardSub}>{defense.length} players</div>
        </div>
        {cap && (
          <div style={S.statCard}>
            <div style={S.cardLabel}>Cap Space</div>
            <div style={{ ...S.cardValue, color: cap.available_cap < 5 ? '#f87171' : '#4ade80' }}>
              ${cap.available_cap.toFixed(0)}M
            </div>
            <div style={S.cardSub}>${cap.used_cap.toFixed(0)}M used of ${cap.total_cap}M</div>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={S.body}>
        {/* Top Players */}
        <div style={S.leftCol}>
          <div style={S.panel}>
            <div style={S.panelHead}>Top Players</div>
            {starPlayers.map((p, i) => {
              const tm = TRAIT_META[p.dev_trait] ?? TRAIT_META['Normal'];
              return (
                <div key={p.id} style={S.playerRow}>
                  <div style={{
                    ...S.rankBadge,
                    background: i === 0 ? '#854d0e' : i === 1 ? '#475569' : i === 2 ? '#78350f' : '#1e293b',
                    color: i < 3 ? '#fbbf24' : '#94a3b8',
                  }}>
                    {i + 1}
                  </div>
                  <div style={S.playerName}>
                    {p.first_name} {p.last_name}
                    {tm.short && (
                      <span style={{
                        marginLeft: 8,
                        fontSize: 10,
                        fontWeight: 700,
                        background: tm.bg,
                        color: tm.color,
                        padding: '2px 6px',
                        borderRadius: 4,
                        verticalAlign: 'middle',
                      }}>
                        {tm.short}
                      </span>
                    )}
                  </div>
                  <div style={S.posBadge}>{p.position_label || p.position}</div>
                  <div style={{ ...S.ovrBadge, color: ovrColor(p.overall_rating) }}>
                    {p.overall_rating}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column */}
        <div style={S.rightCol}>
          {/* Team Needs */}
          <div style={S.panel}>
            <div style={S.panelHead}>Team Needs</div>
            {needs.length === 0 ? (
              <div style={{ padding: '16px 20px', fontSize: 13, color: '#4ade80' }}>
                Roster looks balanced.
              </div>
            ) : (
              <div style={S.needsWrap}>
                {needs.map(pos => (
                  <div key={pos} style={S.needChip}>{pos}</div>
                ))}
              </div>
            )}
          </div>

          {/* Roster Snapshot */}
          <div style={S.panel}>
            <div style={S.panelHead}>Roster Snapshot</div>
            {[
              {
                label: 'Active roster',
                value: `${contracts.length} / 53`,
                color: contracts.length < 45 ? '#f87171' : '#e2e8f0',
              },
              {
                label: 'Expiring contracts',
                value: String(expiring),
                color: expiring > 5 ? '#f87171' : expiring > 0 ? '#fb923c' : '#4ade80',
              },
              {
                label: 'Cap available',
                value: cap ? `$${cap.available_cap.toFixed(1)}M` : '—',
                color: cap && cap.available_cap < 5 ? '#f87171' : '#4ade80',
              },
            ].map(row => (
              <div key={row.label} style={S.snapshotRow}>
                <span style={S.snapshotLabel}>{row.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.color }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Getting Started */}
          <div style={S.panel}>
            <div style={S.panelHead}>Getting Started</div>
            {[
              'Generate your schedule from the Home tab',
              'Review your Depth Chart before simming',
              'Check Free Agents to fill team needs',
              'Sign backups to your Practice Squad',
            ].map(tip => (
              <div key={tip} style={S.tipRow}>
                <span style={S.tipArrow}>→</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={S.cta}>
        <div style={S.ctaSub}>
          Head to the Home tab and generate your schedule to kick off the {season} season.
        </div>
        <button
          style={S.ctaBtn}
          onClick={onStart}
          onMouseOver={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 32px rgba(37,99,235,0.5)';
          }}
          onMouseOut={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 24px rgba(37,99,235,0.4)';
          }}
        >
          BEGIN DYNASTY →
        </button>
      </div>
    </div>
  );
}
