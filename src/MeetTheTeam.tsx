import React, { useEffect, useState } from 'react';

declare const window: any;

interface Props {
  team: { id: number; city: string; name: string; abbreviation: string; conference: string; division: string };
  season: number;
  onStart: () => void;
}

function ratingColor(ovr: number): string {
  if (ovr >= 90) return '#4caf50';
  if (ovr >= 80) return '#8bc34a';
  if (ovr >= 70) return '#ffeb3b';
  return '#e57373';
}

function gradeFromOvr(ovr: number): { letter: string; color: string } {
  if (ovr >= 90) return { letter: 'A+', color: '#4caf50' };
  if (ovr >= 85) return { letter: 'A',  color: '#66bb6a' };
  if (ovr >= 80) return { letter: 'B+', color: '#8bc34a' };
  if (ovr >= 75) return { letter: 'B',  color: '#cddc39' };
  if (ovr >= 70) return { letter: 'C+', color: '#ffeb3b' };
  if (ovr >= 65) return { letter: 'C',  color: '#ffc107' };
  return              { letter: 'D',  color: '#ff5722' };
}

const OFFENSE_POS = new Set(['QB','WR','RB','TE','OL','C','G','OT','T','LT','RT','LG','RG']);
const TRAIT_META: Record<string, { short: string; color: string }> = {
  'X-Factor': { short: 'XF', color: '#ff9100' },
  'Superstar': { short: 'SS', color: '#e040fb' },
  'Star':      { short: '★',  color: '#4fc3f7' },
  'Normal':    { short: '',   color: '#555'    },
};

export default function MeetTheTeam({ team, season, onStart }: Props) {
  const [contracts, setContracts] = useState<any[]>([]);
  const [cap, setCap]             = useState<any>(null);
  const [needs, setNeeds]         = useState<string[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    (async () => {
      const [c, s, n] = await Promise.all([
        window.api.getTeamContracts(team.id),
        window.api.getCapSummary(team.id),
        window.api.getTeamNeeds(team.id),
      ]);
      setContracts(c);
      setCap(s);
      setNeeds(Array.isArray(n) ? n : []);
      setLoading(false);
    })();
  }, [team.id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#080808', color: '#444', fontFamily: 'monospace', letterSpacing: 2 }}>
        LOADING ROSTER...
      </div>
    );
  }

  const sorted      = [...contracts].sort((a, b) => b.overall_rating - a.overall_rating);
  const starPlayers = sorted.slice(0, 10);
  const offense     = contracts.filter(p => OFFENSE_POS.has(p.position));
  const defense     = contracts.filter(p => !OFFENSE_POS.has(p.position));
  const avgOvr      = contracts.length ? Math.round(contracts.reduce((s, p) => s + p.overall_rating, 0) / contracts.length) : 0;
  const avgOff      = offense.length   ? Math.round(offense.reduce((s, p) => s + p.overall_rating, 0) / offense.length) : 0;
  const avgDef      = defense.length   ? Math.round(defense.reduce((s, p) => s + p.overall_rating, 0) / defense.length) : 0;
  const expiring    = contracts.filter(c => c.years_remaining === 1).length;
  const { letter: grade, color: gradeColor } = gradeFromOvr(avgOvr);

  const statCard = (label: string, value: React.ReactNode, sub: string) => (
    <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 8, padding: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 'bold', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#555', marginTop: 5 }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#ccc',
      fontFamily: 'monospace', display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '48px 24px 40px' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ fontSize: 10, color: '#333', letterSpacing: 4, marginBottom: 8 }}>MEET YOUR TEAM · {season}</div>
        <div style={{ fontSize: 34, fontWeight: 'bold', color: '#fff', letterSpacing: 2 }}>
          {team.city} {team.name}
        </div>
        <div style={{ fontSize: 11, color: '#444', marginTop: 5, letterSpacing: 1 }}>
          {team.conference} · {team.division}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Stat Cards ─────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {statCard('TEAM GRADE',
            <span style={{ fontSize: 40, color: gradeColor }}>{grade}</span>,
            `${avgOvr} avg OVR · ${contracts.length} players`)}
          {statCard('OFFENSE',
            <span style={{ color: ratingColor(avgOff) }}>{avgOff}</span>,
            `${offense.length} players`)}
          {statCard('DEFENSE',
            <span style={{ color: ratingColor(avgDef) }}>{avgDef}</span>,
            `${defense.length} players`)}
          {cap && statCard('CAP SPACE',
            <span style={{ fontSize: 26, color: cap.available_cap < 5 ? '#e57373' : '#4caf50' }}>
              ${cap.available_cap.toFixed(0)}M
            </span>,
            `$${cap.used_cap.toFixed(0)}M used of $${cap.total_cap}M`)}
        </div>

        {/* ── Main Body ──────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>

          {/* Best Players */}
          <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, marginBottom: 14 }}>TOP PLAYERS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {starPlayers.map((p, i) => {
                const tm = TRAIT_META[p.dev_trait] ?? TRAIT_META['Normal'];
                const isElite = p.dev_trait === 'X-Factor' || p.dev_trait === 'Superstar';
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 4,
                    background: i === 0 ? '#111' : 'transparent',
                    border: i === 0 ? '1px solid #1e1e1e' : '1px solid transparent',
                  }}>
                    <span style={{ fontSize: 10, color: '#2a2a2a', width: 14, textAlign: 'right' }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, color: isElite ? '#fff' : '#bbb', fontWeight: isElite ? 'bold' : 'normal' }}>
                        {p.first_name} {p.last_name}
                      </span>
                      {tm.short && (
                        <span style={{ marginLeft: 6, fontSize: 9, color: tm.color, fontWeight: 'bold' }}>
                          {tm.short}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: '#444', minWidth: 28 }}>
                      {p.position_label || p.position}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 'bold', color: ratingColor(p.overall_rating), width: 28, textAlign: 'right' }}>
                      {p.overall_rating}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Team Needs */}
            <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, marginBottom: 10 }}>TEAM NEEDS</div>
              {needs.length === 0 ? (
                <div style={{ fontSize: 11, color: '#333' }}>Roster looks balanced.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {needs.map(pos => (
                    <span key={pos} style={{
                      padding: '4px 9px', borderRadius: 3, fontSize: 10, fontWeight: 'bold',
                      background: '#1a0a00', border: '1px solid #FF874044', color: '#FF8740',
                    }}>{pos}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Roster snapshot */}
            <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, marginBottom: 10 }}>ROSTER SNAPSHOT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: 'Active roster', value: `${contracts.length} / 53`, color: contracts.length < 45 ? '#e57373' : '#aaa' },
                  { label: 'Expiring contracts', value: String(expiring), color: expiring > 5 ? '#e57373' : expiring > 0 ? '#FF8740' : '#4caf50' },
                  { label: 'Cap available', value: cap ? `$${cap.available_cap.toFixed(1)}M` : '—', color: cap && cap.available_cap < 5 ? '#e57373' : '#4caf50' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#555' }}>{row.label}</span>
                    <span style={{ color: row.color, fontWeight: 'bold' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div style={{ background: '#0a0a10', border: '1px solid #14141e', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 9, color: '#2a2a44', letterSpacing: 1, marginBottom: 8 }}>GETTING STARTED</div>
              {[
                'Generate your schedule from the Home tab',
                'Review your Depth Chart before simming',
                'Check Free Agents to fill team needs',
                'Sign backups to your Practice Squad',
              ].map(tip => (
                <div key={tip} style={{ fontSize: 10, color: '#333', marginBottom: 5 }}>→ {tip}</div>
              ))}
            </div>

          </div>
        </div>

        {/* ── CTA ────────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={onStart} style={{
            padding: '14px 52px', fontSize: 14, fontWeight: 'bold', letterSpacing: 3,
            background: '#4FC3F7', color: '#000', border: 'none', borderRadius: 4,
            cursor: 'pointer', fontFamily: 'monospace',
          }}>
            BEGIN DYNASTY →
          </button>
          <div style={{ fontSize: 10, color: '#2a2a2a', marginTop: 10 }}>
            Head to the Home tab and generate your schedule to kick off the {season} season
          </div>
        </div>

      </div>
    </div>
  );
}
