import React, { useState, useEffect, useCallback } from 'react';
import { T } from './theme';

declare const window: any;

interface OfficeData {
  salaryCap: number;
  capHistory: { season: number; cap: number }[];
  pendingVote: boolean;
  userVote: 'for' | 'against' | null;
  recentExpansions: any[];
  recentRelocations: any[];
}

interface RelocationCity {
  city: string; name: string; abbreviation: string; marketSize: string;
}

interface LeagueEvent {
  season: number;
  headline: string;
  detail: string;
}

export default function LeagueOffice() {
  const [data, setData] = useState<OfficeData | null>(null);
  const [leagueEvents, setLeagueEvents] = useState<LeagueEvent[]>([]);
  const [relocationCities, setRelocationCities] = useState<RelocationCity[]>([]);
  const [showRelocationModal, setShowRelocationModal] = useState(false);
  const [selectedCity, setSelectedCity] = useState<RelocationCity | null>(null);
  const [relocationMsg, setRelocationMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, events] = await Promise.all([
      window.api.getLeagueOfficeData(),
      window.api.getRecentLeagueEvents?.() ?? Promise.resolve([]),
    ]);
    setData(d);
    setLeagueEvents(events ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleVote = async (vote: 'for' | 'against') => {
    await window.api.castExpansionVote(vote);
    load();
  };

  const openRelocationModal = async () => {
    const cities = await window.api.getRelocationCities();
    setRelocationCities(cities);
    setSelectedCity(cities[0] ?? null);
    setShowRelocationModal(true);
    setRelocationMsg('');
  };

  const confirmRelocation = async () => {
    if (!selectedCity) return;
    const result = await window.api.requestUserRelocation(selectedCity);
    if (result.success) {
      setRelocationMsg('');
      setShowRelocationModal(false);
      load();
    } else {
      setRelocationMsg(result.reason ?? 'Relocation failed.');
    }
  };

  if (loading || !data) {
    return <div style={{ padding: 32, color: T.textMuted, fontFamily: 'monospace', fontSize: 12 }}>Loading league office…</div>;
  }

  return (
    <div style={{ padding: '20px 24px', fontFamily: 'monospace', color: T.text, overflowY: 'auto', maxHeight: '100%' }}>

      {/* ── League Events ─────────────────────────────────────────────────── */}
      {leagueEvents.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.textMuted, marginBottom: 10 }}>LEAGUE EVENTS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leagueEvents.map((ev, i) => (
              <div key={i} style={{
                padding: '10px 14px', background: T.bgCard,
                border: '1px solid #1a2a1a', borderRadius: 6,
              }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: '#4FC3F7', minWidth: 42 }}>{ev.season}</span>
                  <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{ev.headline}</span>
                </div>
                <div style={{ fontSize: 11, color: T.textDim, paddingLeft: 54 }}>{ev.detail}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Salary Cap Panel ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: T.textMuted, marginBottom: 10 }}>SALARY CAP</div>
        <div style={{ fontSize: 36, fontWeight: 'bold', color: '#4FC3F7', marginBottom: 8 }}>
          ${data.salaryCap.toFixed(1)}M
        </div>
        {data.capHistory.length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            {data.capHistory.map((h, i) => (
              <div key={h.season} style={{
                padding: '6px 12px', background: T.bgCard,
                border: `1px solid ${T.borderFaint}`, borderRadius: 4, fontSize: 11,
              }}>
                <span style={{ color: T.textMuted }}>{h.season}</span>
                <span style={{ color: '#4FC3F7', marginLeft: 8 }}>${h.cap.toFixed(1)}M</span>
                {i > 0 && (
                  <span style={{ color: '#66BB6A', marginLeft: 6, fontSize: 10 }}>
                    +{(h.cap - data.capHistory[i - 1].cap).toFixed(1)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {data.capHistory.length === 0 && (
          <div style={{ fontSize: 12, color: T.textDim }}>Cap history will appear after your first season advance.</div>
        )}
      </section>

      {/* ── Expansion Panel ──────────────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: T.textMuted, marginBottom: 10 }}>LEAGUE EXPANSION</div>
        <div style={{
          padding: 16, background: T.bgCard,
          border: `1px solid ${T.borderFaint}`, borderRadius: 6, marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, color: T.textDim, marginBottom: 12 }}>
            Expansion votes are rare and depend on league conditions. Set your position below — if a vote occurs this offseason your stance will be counted.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: T.textMuted, marginRight: 4 }}>Your stance:</span>
            {(['for', 'against'] as const).map(v => (
              <button key={v} onClick={() => handleVote(v)} style={{
                padding: '7px 18px', fontSize: 11, fontFamily: 'monospace', letterSpacing: 1,
                fontWeight: data.userVote === v ? 700 : 400,
                background: data.userVote === v
                  ? (v === 'for' ? 'rgba(102,187,106,0.15)' : 'rgba(229,115,115,0.15)')
                  : 'transparent',
                border: `1px solid ${data.userVote === v
                  ? (v === 'for' ? '#66BB6A' : '#e57373')
                  : T.borderFaint}`,
                color: data.userVote === v ? (v === 'for' ? '#66BB6A' : '#e57373') : T.textDim,
                borderRadius: 4, cursor: 'pointer',
              }}>
                {v === 'for' ? '✓ SUPPORT' : '✗ OPPOSE'}
              </button>
            ))}
            {data.userVote && (
              <span style={{ fontSize: 11, color: T.textDim, marginLeft: 4 }}>Stance recorded for this offseason</span>
            )}
          </div>
        </div>
        {data.recentExpansions.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>EXPANSION HISTORY</div>
            {data.recentExpansions.map((e: any, i: number) => (
              <div key={i} style={{
                padding: '8px 12px', marginBottom: 6,
                background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 4, fontSize: 12,
              }}>
                <span style={{ color: '#4FC3F7' }}>{e.season}</span>
                <span style={{ color: T.text, marginLeft: 10 }}>{e.city} {e.name}</span>
                <span style={{ color: T.textDim, marginLeft: 10 }}>{e.conference} {e.division}</span>
                <span style={{ color: '#66BB6A', marginLeft: 10, fontSize: 11 }}>{e.votes_for}–{e.votes_against}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Relocation Panel ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: T.textMuted, marginBottom: 10 }}>RELOCATION</div>
        {data.recentRelocations.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>RECENT RELOCATIONS</div>
            {data.recentRelocations.map((r: any, i: number) => (
              <div key={i} style={{
                padding: '8px 12px', marginBottom: 6,
                background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 4, fontSize: 12,
              }}>
                <span style={{ color: '#4FC3F7' }}>{r.season}</span>
                <span style={{ color: T.textDim, marginLeft: 10 }}>{r.headline}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={openRelocationModal} style={{
          padding: '10px 20px', fontSize: 12, fontFamily: 'monospace', letterSpacing: 1,
          background: 'rgba(255,135,64,0.1)', border: '1px solid #FF8740',
          color: '#FF8740', borderRadius: 4, cursor: 'pointer',
        }}>
          RELOCATE YOUR FRANCHISE
        </button>
        <div style={{ fontSize: 11, color: T.textDim, marginTop: 6 }}>
          Once per 10 seasons · Costs 10 owner patience
        </div>
      </section>

      {/* ── Relocation Modal ─────────────────────────────────────────────── */}
      {showRelocationModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: T.bgCard, border: `1px solid ${T.borderStrong}`,
            borderRadius: 8, padding: 28, minWidth: 400, maxWidth: 500, fontFamily: 'monospace',
          }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 16 }}>RELOCATE FRANCHISE</div>
            {relocationCities.length === 0 ? (
              <div style={{ color: T.textDim, fontSize: 12 }}>No relocation cities available.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: T.textDim, marginBottom: 12 }}>
                  Select your new home city. This will cost 10 owner patience and cannot be undone for 10 seasons.
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 16 }}>
                  {relocationCities.map(city => (
                    <div key={city.city} onClick={() => setSelectedCity(city)} style={{
                      padding: '8px 12px', marginBottom: 4, borderRadius: 4, cursor: 'pointer', fontSize: 12,
                      background: selectedCity?.city === city.city ? 'rgba(255,135,64,0.15)' : 'transparent',
                      border: `1px solid ${selectedCity?.city === city.city ? '#FF8740' : T.borderFaint}`,
                      color: selectedCity?.city === city.city ? '#FF8740' : T.text,
                    }}>
                      <span style={{ fontWeight: 600 }}>{city.city}</span>
                      <span style={{ color: T.textDim, marginLeft: 8 }}>{city.name}</span>
                      <span style={{
                        float: 'right', fontSize: 10,
                        color: city.marketSize === 'large' ? '#66BB6A' : city.marketSize === 'medium' ? '#4FC3F7' : T.textDim,
                      }}>
                        {city.marketSize.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
                {relocationMsg && <div style={{ color: '#e57373', fontSize: 12, marginBottom: 10 }}>{relocationMsg}</div>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowRelocationModal(false)} style={{
                    padding: '8px 16px', fontSize: 11, fontFamily: 'monospace',
                    background: 'transparent', border: `1px solid ${T.borderFaint}`,
                    color: T.textMuted, borderRadius: 4, cursor: 'pointer',
                  }}>CANCEL</button>
                  <button onClick={confirmRelocation} disabled={!selectedCity} style={{
                    padding: '8px 20px', fontSize: 11, fontFamily: 'monospace', letterSpacing: 1,
                    background: '#FF8740', border: 'none', color: '#000',
                    borderRadius: 4, cursor: selectedCity ? 'pointer' : 'default', opacity: selectedCity ? 1 : 0.5,
                  }}>CONFIRM MOVE</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
