import React, { useEffect, useState } from 'react';

declare const window: any;

const MARKET_COLOR: Record<string, string> = {
  large:  '#FFD700',
  medium: '#FF8740',
  small:  '#4FC3F7',
};

const MARKET_LABEL: Record<string, string> = {
  large:  'Large Market',
  medium: 'Mid Market',
  small:  'Small Market',
};

interface Finances {
  market_size: string;
  stadium_capacity: number;
  season_revenue: number;
  owner_budget: number;
}

interface Props {
  teamId: number;
  currentSeason: number;
}

export default function FinancesTab({ teamId, currentSeason }: Props) {
  const [finances, setFinances] = useState<Finances | null>(null);
  const [allTeams, setAllTeams] = useState<{ id: number; city: string; name: string; market_size: string; season_revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      window.api.getTeamFinances?.(teamId),
      window.api.getAllTeamFinances?.(),
    ]).then(([f, all]) => {
      setFinances(f ?? null);
      setAllTeams(all ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div style={{ color: '#555', padding: 24 }}>Loading finances...</div>;
  if (!finances) return (
    <div style={{ color: '#555', padding: 24 }}>
      Financial data not available. Make sure database migration v17 has run.
    </div>
  );

  const mc = MARKET_COLOR[finances.market_size] ?? '#888';

  return (
    <div style={{ padding: '0 0 32px' }}>
      <div style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 10, letterSpacing: 2, color: '#555' }}>TEAM FINANCES — {currentSeason} SEASON</span>
      </div>

      {/* Market Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'MARKET SIZE',       value: MARKET_LABEL[finances.market_size] ?? finances.market_size, color: mc },
          { label: 'STADIUM CAPACITY',  value: finances.stadium_capacity.toLocaleString(),                  color: '#aaa' },
          { label: 'SEASON REVENUE',    value: `$${finances.season_revenue.toFixed(0)}M`,                   color: '#4caf50' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 6, padding: '14px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: '#444', letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Owner Budget */}
      <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 6, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ fontSize: 9, letterSpacing: 2, color: '#555', marginBottom: 12 }}>OWNER BUDGET</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1, background: '#0a0a0a', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, (finances.season_revenue / finances.owner_budget) * 100)}%`, height: '100%', background: '#4caf50', borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 13, color: '#4caf50', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            ${finances.season_revenue.toFixed(0)}M / ${finances.owner_budget.toFixed(0)}M
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#444', marginTop: 8 }}>
          {finances.market_size === 'large'
            ? 'Large market — strong FA appeal, premium revenue floor.'
            : finances.market_size === 'small'
            ? 'Small market — tight budget, rely on the draft and development.'
            : 'Mid market — solid foundation, balanced approach.'}
        </div>
      </div>

      {/* League Market Size Breakdown */}
      <div>
        <div style={{ fontSize: 9, letterSpacing: 2, color: '#444', marginBottom: 12 }}>LEAGUE MARKET BREAKDOWN</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {allTeams.slice(0, 16).map(t => {
            const tc = MARKET_COLOR[t.market_size] ?? '#888';
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px',
                background: t.id === teamId ? '#1a1a0a' : '#0d0d0d',
                border: `1px solid ${t.id === teamId ? '#FF874044' : '#1a1a1a'}`,
                borderRadius: 4,
              }}>
                <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 2, background: `${tc}22`, color: tc }}>{t.market_size.toUpperCase()[0]}</span>
                <span style={{ fontSize: 11, color: t.id === teamId ? '#fff' : '#888', flex: 1 }}>{t.city} {t.name}</span>
                <span style={{ fontSize: 10, color: '#4caf50', fontFamily: 'monospace' }}>${t.season_revenue?.toFixed(0)}M</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
