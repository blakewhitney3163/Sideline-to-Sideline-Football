import React from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { FreeAgent, CapSummary, RosterSpots } from './types';
import { POSITIONS, TRAIT_META, ratingColor, trajectory, fmtSalary, fairMarketValue } from './utils';

interface Props {
  freeAgents: FreeAgent[];
  cap: CapSummary | null;
  rosterSpots: RosterSpots | null;
  teamNeeds: string[];
  faPos: string;
  setFaPos: (p: string) => void;
  faSortBy: 'ovr' | 'age' | 'value';
  setFaSortBy: (s: 'ovr' | 'age' | 'value') => void;
  faSearch: string;
  setFaSearch: (v: string) => void;
  signingId: number | null;
  setSigningId: (id: number | null) => void;
  signYears: number;
  setSignYears: (y: number) => void;
  signSalary: string;
  setSignSalary: (s: string) => void;
  psSigningId: number | null;
  handleSign: () => void;
  handleSignToPs: (fa: FreeAgent) => void;
  working: boolean;
}

// ─── Virtualized Row ──────────────────────────────────────────────────────────

const ITEM_HEIGHT = 54;

interface FaRowData {
  items: FreeAgent[];
  signingId: number | null;
  psSigningId: number | null;
  rosterSpots: RosterSpots | null;
  openSign: (fa: FreeAgent) => void;
  handleSignToPs: (fa: FreeAgent) => void;
  setSigningId: (id: number | null) => void;
}

const FaRow = React.memo(({ index, style, data }: ListChildComponentProps<FaRowData>) => {
  const { items, signingId, psSigningId, rosterSpots, openSign, handleSignToPs, setSigningId } = data;
  const fa = items[index];
  if (!fa) return null;

  const trait = TRAIT_META[fa.dev_trait] ?? TRAIT_META['Normal'];
  const traj = trajectory(fa.age);
  const mv = fairMarketValue(fa.position, fa.overall_rating, fa.dev_trait);
  const isSigning = signingId === fa.id;

  return (
    <div style={style}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 60px 90px 90px 80px',
        gap: 6, alignItems: 'center', padding: '8px 10px',
        background: isSigning ? '#0a1020' : T_bgCard,
        borderRadius: 4, height: ITEM_HEIGHT - 4, boxSizing: 'border-box',
        border: `1px solid ${isSigning ? '#4FC3F7' : T_borderFaint}`,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: '#e0e0e0' }}>
              {fa.first_name} {fa.last_name}
            </span>
            {trait.short && (
              <span style={{ fontSize: 8, fontWeight: 700, color: trait.color, background: trait.bg, borderRadius: 2, padding: '1px 3px' }}>
                {trait.short}
              </span>
            )}
          </div>
          <span style={{ fontSize: 10, color: '#555' }}>{fa.position_label || fa.position}</span>
        </div>
        <div>
          <span style={{ fontSize: 11, color: '#888' }}>{fa.age} </span>
          <span style={{ fontSize: 10, color: traj.color }}>{traj.label}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: ratingColor(fa.overall_rating) }}>
          {fa.overall_rating}
        </span>
        <span style={{ fontSize: 11, color: '#555' }}>
          {fa.dev_trait === 'Normal' ? '—' : fa.dev_trait}
        </span>
        <span style={{ fontSize: 11, color: '#888' }}>{fmtSalary(mv)}/yr</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => isSigning ? setSigningId(null) : openSign(fa)}
            disabled={!!(rosterSpots && rosterSpots.activeFree <= 0)}
            style={{
              padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
              background: isSigning ? '#0a1a3a' : '#141414',
              border: `1px solid ${isSigning ? '#4FC3F7' : rosterSpots && rosterSpots.activeFree <= 0 ? '#1a1a1a' : '#2a2a2a'}`,
              color: isSigning ? '#4FC3F7' : rosterSpots && rosterSpots.activeFree <= 0 ? '#2a2a2a' : '#555',
            }}
          >
            {isSigning ? 'Cancel' : 'Sign'}
          </button>
          <button
            onClick={() => handleSignToPs(fa)}
            disabled={!!(psSigningId === fa.id || (rosterSpots && rosterSpots.psFree <= 0))}
            style={{
              padding: '4px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 4,
              background: '#141414',
              border: `1px solid ${rosterSpots && rosterSpots.psFree <= 0 ? '#1a1a1a' : '#1a2a3a'}`,
              color: psSigningId === fa.id ? '#888' : rosterSpots && rosterSpots.psFree <= 0 ? '#2a2a2a' : '#4FC3F7',
              fontWeight: 700,
            }}
          >
            {psSigningId === fa.id ? '...' : 'PS'}
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── Theme shims (mirrors T object values used here) ─────────────────────────
const T_bgCard = '#161616';
const T_borderFaint = '#222';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FreeAgentsTab({
  freeAgents, cap, rosterSpots, teamNeeds,
  faPos, setFaPos, faSortBy, setFaSortBy, faSearch, setFaSearch,
  signingId, setSigningId, signYears, setSignYears, signSalary, setSignSalary,
  psSigningId, handleSign, handleSignToPs, working,
}: Props) {
  const filteredFa = freeAgents
    .filter(f => faPos === 'ALL' ? true : faPos === 'NEEDS' ? teamNeeds.includes(f.position) : f.position === faPos)
    .filter(f => {
      if (!faSearch.trim()) return true;
      const q = faSearch.toLowerCase();
      return `${f.first_name} ${f.last_name}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (faSortBy === 'age') return a.age - b.age;
      if (faSortBy === 'value') return fairMarketValue(b.position, b.overall_rating, b.dev_trait) - fairMarketValue(a.position, a.overall_rating, a.dev_trait);
      return b.overall_rating - a.overall_rating;
    });

  const signingPlayer = signingId ? freeAgents.find(f => f.id === signingId) : null;
  const signSalaryNum = parseFloat(signSalary) || 0;
  const signCapLeft = cap ? cap.available_cap - signSalaryNum : 0;
  const mv = signingPlayer ? fairMarketValue(signingPlayer.position, signingPlayer.overall_rating, signingPlayer.dev_trait) : 0;

  const openSign = (fa: FreeAgent) => {
    setSigningId(fa.id);
    const market = fairMarketValue(fa.position, fa.overall_rating, fa.dev_trait);
    setSignYears(fa.age <= 26 ? 3 : fa.age <= 30 ? 2 : 1);
    setSignSalary(market.toFixed(1));
  };

  const rowData: FaRowData = { items: filteredFa, signingId, psSigningId, rosterSpots, openSign, handleSignToPs, setSigningId };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
        {['NEEDS', ...POSITIONS].map(pos => {
          const isNeeds = pos === 'NEEDS';
          const isActive = faPos === pos;
          return (
            <button key={pos} onClick={() => { setFaPos(pos); setSigningId(null); }} style={{
              padding: '3px 9px',
              background: isActive ? (isNeeds ? '#4a3020' : '#4FC3F7') : isNeeds ? '#1a0e00' : '#141414',
              border: `1px solid ${isActive ? (isNeeds ? '#FF8740' : '#4FC3F7') : isNeeds ? '#FF8740' : '#222'}`,
              borderRadius: 3,
              color: isActive ? (isNeeds ? '#FF8740' : '#000') : isNeeds ? '#FF8740' : '#555',
              fontSize: 11, cursor: 'pointer',
              fontWeight: isActive || isNeeds ? 'bold' : 'normal',
            }}>
              {isNeeds ? `NEEDS${teamNeeds.length > 0 ? ` (${teamNeeds.length})` : ''}` : pos}
            </button>
          );
        })}
        <select onChange={e => setFaSortBy(e.target.value as any)} value={faSortBy} style={{
          marginLeft: 'auto', background: '#161616', border: '1px solid #2a2a2a',
          borderRadius: 5, color: '#ccc', padding: '4px 10px', fontSize: 12,
        }}>
          <option value="ovr">Sort: OVR</option>
          <option value="value">Sort: Market Value</option>
          <option value="age">Sort: Age</option>
        </select>
        <input
          placeholder="Search player..."
          value={faSearch}
          onChange={e => setFaSearch(e.target.value)}
          style={{
            background: '#161616', border: '1px solid #2a2a2a', borderRadius: 5,
            color: '#ccc', padding: '4px 10px', fontSize: 12, width: 160,
          }}
        />
      </div>

      {/* Cap / roster status bar */}
      {rosterSpots && cap && (
        <div style={{ display: 'flex', gap: 12, fontSize: 11, marginBottom: 8 }}>
          <span style={{ color: rosterSpots.activeFree > 0 ? '#4caf50' : '#e57373' }}>
            Active: {rosterSpots.active}/53 · {rosterSpots.activeFree > 0 ? `${rosterSpots.activeFree} open` : 'FULL'}
          </span>
          <span style={{ color: rosterSpots.psFree > 0 ? '#4FC3F7' : '#555' }}>
            PS: {rosterSpots.ps}/16 · {rosterSpots.psFree > 0 ? `${rosterSpots.psFree} open` : 'FULL'}
          </span>
          <span style={{ color: cap.available_cap > 0 ? '#4caf50' : '#e57373' }}>
            Cap: {fmtSalary(cap.available_cap)} {cap.available_cap < 0 ? '(OVER)' : 'available'}
          </span>
        </div>
      )}

      {/* Signing panel — rendered once, outside the list */}
      {signingPlayer && (
        <div style={{
          background: '#0a1020', border: '1px solid #4FC3F7', borderRadius: 6,
          padding: '12px 14px', marginBottom: 8,
        }}>
          <div style={{ color: '#4FC3F7', fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
            OFFER CONTRACT — {signingPlayer.first_name} {signingPlayer.last_name}
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#888', fontSize: 10, marginBottom: 4 }}>YEARS</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(y => (
                  <button key={y} onClick={() => setSignYears(y)} style={{
                    width: 32, height: 32,
                    background: signYears === y ? '#4FC3F7' : '#141414',
                    border: `1px solid ${signYears === y ? '#4FC3F7' : '#2a2a2a'}`,
                    borderRadius: 4, color: signYears === y ? '#000' : '#555',
                    fontWeight: 'bold', fontSize: 12, cursor: 'pointer',
                  }}>{y}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: 10, marginBottom: 4 }}>ANNUAL SALARY (M)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#888', fontSize: 12 }}>$</span>
                <input
                  type="number"
                  value={signSalary}
                  onChange={e => setSignSalary(e.target.value)}
                  min="0.9" step="0.5"
                  style={{
                    background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4,
                    color: '#ccc', padding: '6px 10px', fontSize: 13, width: 80,
                  }}
                />
                <span style={{ color: '#888', fontSize: 12 }}>M</span>
              </div>
              <div style={{ color: '#555', fontSize: 10, marginTop: 4 }}>
                Market: {fmtSalary(mv)}/yr
              </div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: 10, marginBottom: 4 }}>CAP AFTER SIGNING</div>
              <div style={{ color: signCapLeft < 0 ? '#e57373' : '#4caf50', fontWeight: 700, fontSize: 13 }}>
                {fmtSalary(signCapLeft)} remaining
              </div>
              {rosterSpots && (
                <div style={{ color: '#555', fontSize: 10, marginTop: 2 }}>
                  {rosterSpots.activeFree - 1} roster spot{rosterSpots.activeFree - 1 !== 1 ? 's' : ''} left after
                </div>
              )}
            </div>
            <button
              onClick={handleSign}
              disabled={working || signCapLeft < 0}
              style={{
                alignSelf: 'flex-end', padding: '8px 20px', fontSize: 12, fontWeight: 700,
                background: working || signCapLeft < 0 ? '#141414' : '#4FC3F7',
                color: working || signCapLeft < 0 ? '#555' : '#000',
                border: 'none', borderRadius: 4, cursor: working || signCapLeft < 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {working ? '...' : signCapLeft < 0 ? 'OVER CAP' : 'Confirm Signing'}
            </button>
          </div>
        </div>
      )}

      {/* Column header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 80px 60px 90px 90px 80px',
        gap: 6, padding: '4px 10px', marginBottom: 2,
      }}>
        {['PLAYER', 'AGE / OVR', 'OVR', 'DEV', 'MARKET VALUE', ''].map((h, i) => (
          <span key={i} style={{ fontSize: 9, color: '#444', fontWeight: 700, letterSpacing: 0.5 }}>{h}</span>
        ))}
      </div>

      {/* Virtualized free agent list */}
      {filteredFa.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#555', padding: 20, fontSize: 12 }}>
          No free agents found
        </div>
      ) : (
        <FixedSizeList
          height={480}
          itemCount={filteredFa.length}
          itemSize={ITEM_HEIGHT}
          width="100%"
          itemData={rowData}
        >
          {FaRow}
        </FixedSizeList>
      )}

      <div style={{ color: '#333', fontSize: 10, textAlign: 'right', marginTop: 4 }}>
        {filteredFa.length} free agent{filteredFa.length !== 1 ? 's' : ''} shown (top 200 by OVR)
      </div>
    </div>
  );
}
