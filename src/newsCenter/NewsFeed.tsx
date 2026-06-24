import React, { useEffect, useState } from 'react';
import { T } from '../theme';
import { NewsEvent, NewsCategory } from './types';

declare const window: any;

const CATEGORIES: { id: NewsCategory; label: string }[] = [
  { id: 'all',          label: 'All' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'season',       label: 'Season' },
  { id: 'draft',        label: 'Draft' },
  { id: 'injuries',     label: 'Injuries' },
  { id: 'milestones',   label: 'Milestones' },
];

const EVENT_META: Record<string, { icon: string; color: string }> = {
  retirement:  { icon: '🏁', color: '#888' },
  hof:         { icon: '🏛', color: '#FFD700' },
  signing:     { icon: '✍️',  color: '#4caf50' },
  resign:      { icon: '🔄', color: '#4FC3F7' },
  release:     { icon: '✂️',  color: '#e57373' },
  trade:       { icon: '🤝', color: '#FF8740' },
  injury:      { icon: '🩹', color: '#FF8740' },
  draft_pick:  { icon: '📋', color: '#4FC3F7' },
  cpu_signing: { icon: '✍️',  color: '#81C784' },
  champion:    { icon: '🏆', color: '#FFD700' },
  milestone:   { icon: '⭐', color: '#FFD700' },
};

function getMeta(eventType: string) {
  return EVENT_META[eventType] ?? { icon: '📰', color: T.textMuted };
}

function weekLabel(week: number): string {
  if (week === 0) return 'Offseason';
  if (week >= 19) return 'Playoffs';
  return `Week ${week}`;
}

export default function NewsFeed() {
  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [category, setCategory] = useState<NewsCategory>('all');
  const [seasons, setSeasons] = useState<number[]>([]);
  const [viewSeason, setViewSeason] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    window.api.getNewsSeasons().then((s: number[]) => {
      setSeasons(s);
      if (s.length > 0) setViewSeason(s[0]);
    });
  }, []);

  useEffect(() => {
    if (viewSeason === null) return;
    setLoading(true);
    window.api.getNewsFeed({ season: viewSeason, category: category === 'all' ? undefined : category })
      .then((data: NewsEvent[]) => { setEvents(data); setLoading(false); });
  }, [viewSeason, category]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.borderFaint}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ color: T.textPrimary, fontSize: 18, fontWeight: 700, margin: '0 0 2px' }}>
              📰 News Center
            </h2>
            <div style={{ color: T.textDim, fontSize: 11 }}>League-wide transactions, events & milestones</div>
          </div>
          {seasons.length > 1 && (
            <select
              value={viewSeason ?? ''}
              onChange={e => setViewSeason(Number(e.target.value))}
              style={{
                background: T.bgPage, color: T.textPrimary, border: `1px solid ${T.borderFaint}`,
                borderRadius: 4, padding: '5px 12px', fontSize: 11, cursor: 'pointer',
              }}
            >
              {seasons.map(s => <option key={s} value={s}>{s} Season</option>)}
            </select>
          )}
        </div>

        {/* Category filter */}
        <div style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)} style={{
              padding: '4px 12px', fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
              background: category === c.id ? '#FF8740' : T.bgCard,
              border: `1px solid ${category === c.id ? '#FF8740' : T.borderFaint}`,
              color: category === c.id ? '#000' : T.textMuted,
            }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {loading ? (
          <div style={{ color: T.textDim, fontSize: 13, padding: '24px 0' }}>Loading news...</div>
        ) : events.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: 13, padding: '24px 0' }}>
            No news yet — simulate some games to generate events.
          </div>
        ) : (
          events.map(event => {
            const meta = getMeta(event.event_type);
            const isExpanded = expandedId === event.id;
            const hasDetail = !!event.detail;
            return (
              <div
                key={event.id}
                onClick={() => hasDetail && setExpandedId(isExpanded ? null : event.id)}
                style={{
                  display: 'flex', gap: 12, padding: '10px 0',
                  borderBottom: `1px solid ${T.borderFaint}`,
                  cursor: hasDetail ? 'pointer' : 'default',
                  background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                  borderRadius: isExpanded ? 4 : 0,
                  transition: 'background 0.15s',
                }}
              >
                {/* Icon */}
                <div style={{ fontSize: 18, flexShrink: 0, width: 28, textAlign: 'center', paddingTop: 2 }}>
                  {meta.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ color: meta.color, fontWeight: 700, fontSize: 13, lineHeight: 1.3, flex: 1 }}>
                      {event.headline}
                    </div>
                    {hasDetail && (
                      <span style={{ fontSize: 10, color: T.textDim, flexShrink: 0 }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                  {isExpanded && hasDetail && (
                    <div style={{
                      color: T.textMuted, fontSize: 12, marginTop: 6, lineHeight: 1.5,
                      padding: '8px 10px', background: 'rgba(255,255,255,0.04)',
                      borderRadius: 4, borderLeft: `2px solid ${meta.color}`,
                    }}>
                      {event.detail}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 10, color: T.textDim }}>
                    <span>{weekLabel(event.week)}</span>
                    {event.team_name && <span>· {event.team_name}</span>}
                    {hasDetail && !isExpanded && (
                      <span style={{ color: T.borderStrong }}>· tap for details</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
