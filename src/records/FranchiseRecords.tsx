import React, { useEffect, useState } from 'react';
import { T } from '../theme';
import { StatCategory, RecordsData } from './types';
import { CATEGORIES, columns } from './recordsUtils';
import LeaderboardTable from './LeaderboardTable';

declare const window: any;

interface Team { id: number; city: string; name: string; }

interface Props { defaultTeamId?: number; }

export default function FranchiseRecords({ defaultTeamId }: Props) {
  const [teams, setTeams]       = useState<Team[]>([]);
  const [teamId, setTeamId]     = useState<number | null>(defaultTeamId ?? null);
  const [data, setData]         = useState<RecordsData | null>(null);
  const [category, setCategory] = useState<StatCategory>('passing');
  const [loading, setLoading]   = useState(false);
  const [sortKey, setSortKey]   = useState<string | null>(null);
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    window.api.getTeams().then((ts: Team[]) => {
      const sorted = [...ts].sort((a, b) =>
        `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`)
      );
      setTeams(sorted);
      if (!teamId && sorted.length > 0) setTeamId(defaultTeamId ?? sorted[0].id);
    });
  }, []);

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    window.api.getFranchiseRecords(teamId).then((d: RecordsData) => {
      setData(d);
      setLoading(false);
    });
  }, [teamId]);

  const rows = data ? (data[category] ?? []) : [];
  const cols = columns(category);
  const selectedTeam = teams.find(t => t.id === teamId);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <select
          value={teamId ?? ''}
          onChange={e => { setTeamId(Number(e.target.value)); setSortKey(null); setCategory('passing'); }}
          style={{
            background: '#111', border: '1px solid #333', color: T.text,
            padding: '6px 12px', fontSize: 13, borderRadius: 4, cursor: 'pointer',
          }}
        >
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.city} {t.name}</option>
          ))}
        </select>
        {selectedTeam && (
          <span style={{ color: '#555', fontSize: 11, letterSpacing: 0.5 }}>
            single-season franchise bests
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => { setCategory(c.id as StatCategory); setSortKey(null); }}
            style={{
              padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
              background: category === c.id ? '#FF8740' : '#111',
              border: `1px solid ${category === c.id ? '#FF8740' : '#222'}`,
              color: category === c.id ? '#000' : '#666',
            }}
          >
            {c.label.toUpperCase()}
          </button>
        ))}
      </div>

      <LeaderboardTable
        rows={rows}
        cols={cols}
        mode="season"
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        loading={loading}
      />
    </div>
  );
}
