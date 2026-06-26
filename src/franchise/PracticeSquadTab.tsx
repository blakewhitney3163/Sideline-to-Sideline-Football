import React, { useState } from 'react';
import { PracticePlayer, RosterSpots } from './types';
import { ratingColor, trajectory, fmtSalary } from './utils';

declare const window: any;

const PS_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

interface Props {
  practiceSquad: PracticePlayer[];
  rosterSpots: RosterSpots | null;
  showToast: (message: string, type: 'success' | 'error') => void;
  loadData: () => Promise<void>;
  onDemoteConfirm?: (playerId: number) => void;
}

export default function PracticeSquadTab({ practiceSquad, rosterSpots, showToast, loadData }: Props) {
  const [posFilter, setPosFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [cuttingId, setCuttingId] = useState<number | null>(null);
  const [working, setWorking] = useState(false);

  const filtered = practiceSquad
    .filter(p => posFilter === 'ALL' || p.position === posFilter || p.position_label === posFilter)
    .filter(p => {
      if (!search.trim()) return true;
      return `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase());
    });

  const psUsed = rosterSpots?.ps ?? practiceSquad.length;
  const psMax = 16;
  const psFree = rosterSpots?.psFree ?? (psMax - psUsed);
  const activeMax = 53;
  const activeFree = rosterSpots?.activeFree ?? 0;
  const psPct = (psUsed / psMax) * 100;

  const handlePromote = async (p: PracticePlayer) => {
    if (working) return;
    setWorking(true);
    const result = await window.api.promoteFromPs(p.id);
    if (result.success) {
      showToast(`${p.first_name} ${p.last_name} promoted to active roster.`, 'success');
      await loadData();
    } else {
      showToast(result.reason ?? 'Could not promote.', 'error');
    }
    setWorking(false);
  };

  const handleCutFromPS = async (p: PracticePlayer) => {
    if (working) return;
    setWorking(true);
    const result = await window.api.cutFromPs(p.id);
    if (result.success) {
      showToast(`${p.first_name} ${p.last_name} released from practice squad.`, 'error');
      setCuttingId(null);
      await loadData();
    } else {
      showToast(result.reason ?? 'Could not release.', 'error');
    }
    setWorking(false);
  };

  return (
    <div>
      {/* Capacity bars */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 6, padding: '10px 16px', minWidth: 180 }}>
          <div style={{ fontSize: 10, color: '#333', letterSpacing: 1, marginBottom: 4 }}>PRACTICE SQUAD</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: psUsed >= psMax ? '#e57373' : '#ccc' }}>{psUsed}</span>
            <span style={{ color: '#333', fontSize: 11 }}>/ {psMax}</span>
            <span style={{ color: psFree > 0 ? '#4caf50' : '#555', fontSize: 11, marginLeft: 2 }}>{psFree} open</span>
          </div>
          <div style={{ marginTop: 6, height: 3, background: '#1a1a1a', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${Math.min(psPct, 100)}%`, background: psPct >= 100 ? '#e57373' : '#4caf50', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 6, padding: '10px 16px', minWidth: 160 }}>
          <div style={{ fontSize: 10, color: '#333', letterSpacing: 1, marginBottom: 4 }}>ACTIVE ROSTER</div>
          <div style={{ fontSize: 11, color: activeFree > 0 ? '#4caf50' : '#555' }}>
            {rosterSpots ? `${rosterSpots.active}/${activeMax}` : '—'}
            {activeFree > 0 && <span style={{ marginLeft: 6 }}>{activeFree} spot{activeFree !== 1 ? 's' : ''} open</span>}
          </div>
          {activeFree <= 0 && <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>Full — cut to promote</div>}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {PS_POSITIONS.map(pos => (
          <button key={pos} onClick={() => setPosFilter(pos)} style={{
            padding: '3px 9px', background: posFilter === pos ? '#FF8740' : '#141414',
            border: `1px solid ${posFilter === pos ? '#FF8740' : '#222'}`, borderRadius: 3,
            color: posFilter === pos ? '#000' : '#555', fontSize: 11, cursor: 'pointer',
            fontWeight: posFilter === pos ? 'bold' : 'normal',
          }}>{pos}</button>
        ))}
        <input
          placeholder="Search player…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto', background: '#161616', border: '1px solid #2a2a2a',
            borderRadius: 5, color: '#ccc', padding: '4px 10px', fontSize: 12, width: 160,
          }}
        />
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 90px 80px 90px', gap: '0 8px', padding: '4px 8px', marginBottom: 4 }}>
        <span style={{ color: '#333', fontSize: 10, letterSpacing: 1 }}>PLAYER</span>
        <span style={{ color: '#333', fontSize: 10, letterSpacing: 1 }}>AGE / OVR</span>
        <span style={{ color: '#333', fontSize: 10, letterSpacing: 1 }}>SALARY</span>
        <span />
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: '#333', fontSize: 13, padding: '20px 8px' }}>
          {practiceSquad.length === 0 ? 'No practice squad players' : 'No players match filter'}
        </div>
      ) : filtered.map(p => {
        const traj = trajectory(p.age);
        const isCutting = cuttingId === p.id;

        return (
          <div key={p.id} style={{
            background: '#111', border: '1px solid #1a1a1a',
            borderRadius: 6, padding: '10px 12px', marginBottom: 6,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 90px 80px 90px', gap: '0 8px', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#ddd', fontWeight: 600, fontSize: 13 }}>{p.first_name} {p.last_name}</div>
                <div style={{ color: '#444', fontSize: 11, marginTop: 1 }}>{p.position_label || p.position}</div>
              </div>

              <div>
                <div style={{ color: '#aaa', fontSize: 12 }}>{p.age} <span style={{ color: traj.color, fontSize: 10 }}>{traj.label}</span></div>
                <div style={{ color: ratingColor(p.overall_rating), fontSize: 15, fontWeight: 700 }}>{p.overall_rating}</div>
              </div>

              <div style={{ color: '#888', fontSize: 12 }}>{fmtSalary(p.annual_salary ?? 1.165)}</div>

              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => handlePromote(p)}
                  disabled={working || activeFree <= 0}
                  title={activeFree <= 0 ? 'Active roster full' : 'Promote to active roster'}
                  style={{
                    padding: '4px 8px', fontSize: 11, cursor: activeFree <= 0 ? 'not-allowed' : 'pointer',
                    borderRadius: 4, background: '#0a1a0a', border: '1px solid #1a4a1a',
                    color: '#4caf50', opacity: activeFree <= 0 ? 0.3 : 1, whiteSpace: 'nowrap',
                  }}>
                  ↑ Active
                </button>
                <button
                  onClick={() => setCuttingId(isCutting ? null : p.id)}
                  disabled={working}
                  style={{
                    padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                    borderRadius: 4, background: isCutting ? '#3a0a0a' : '#141414',
                    border: `1px solid ${isCutting ? '#e57373' : '#2a2a2a'}`,
                    color: isCutting ? '#e57373' : '#555',
                  }}>
                  {isCutting ? 'Cancel' : 'Cut'}
                </button>
              </div>
            </div>

            {isCutting && (
              <div style={{ marginTop: 10, padding: '10px 14px', background: '#1a0a0a', border: '1px solid #3a1a1a', borderRadius: 6 }}>
                <div style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>
                  Release {p.first_name} {p.last_name} from the practice squad?
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleCutFromPS(p)}
                    disabled={working}
                    style={{ padding: '6px 16px', background: '#e57373', border: 'none', borderRadius: 4, color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    {working ? '...' : 'Confirm Release'}
                  </button>
                  <button
                    onClick={() => setCuttingId(null)}
                    style={{ padding: '6px 16px', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 4, color: '#555', fontSize: 12, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ color: '#333', fontSize: 11, marginTop: 8, textAlign: 'right' }}>
        {filtered.length} player{filtered.length !== 1 ? 's' : ''} shown · {psUsed}/{psMax} PS slots used
      </div>
    </div>
  );
}
