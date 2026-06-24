import React, { useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';

declare const window: any;

interface Team {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
}

const CONFERENCES = ['AFC', 'NFC'];
const DIVISIONS = ['North', 'South', 'East', 'West'];

const inputStyle: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #2a2a2a',
  color: '#ccc',
  padding: '7px 10px',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'monospace',
  width: '100%',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  background: '#141414',
  border: '1px solid #2a2a2a',
  color: '#ccc',
  padding: '7px 10px',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'monospace',
  width: '100%',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, color: '#444', letterSpacing: 2, marginBottom: 5, fontFamily: 'monospace' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export default function TeamEditor() {
  const { userTeam, setUserTeam } = useGameStore();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Omit<Team, 'id'> | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    window.api.getTeams().then((ts: Team[]) => {
      const sorted = [...ts].sort((a, b) =>
        `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`)
      );
      setTeams(sorted);
      const defaultId = userTeam?.id ?? sorted[0]?.id ?? null;
      setSelectedId(defaultId);
    });
  }, []);

  useEffect(() => {
    if (selectedId !== null) {
      const t = teams.find(t => t.id === selectedId);
      if (t) setEdit({ city: t.city, name: t.name, abbreviation: t.abbreviation, conference: t.conference, division: t.division });
    }
  }, [selectedId, teams]);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }

  async function handleSave() {
    if (!selectedId || !edit || saving) return;
    setSaving(true);
    const result = await window.api.editTeam({ teamId: selectedId, ...edit });
    if (result?.success) {
      setTeams(prev => prev.map(t => t.id === selectedId ? { ...t, ...edit } : t));
      if (userTeam?.id === selectedId) {
        setUserTeam({ ...userTeam, city: edit.city, name: edit.name, abbreviation: edit.abbreviation });
      }
      showToast(`${edit.city} ${edit.name} saved.`, 'success');
    } else {
      showToast(result?.reason ?? 'Save failed.', 'error');
    }
    setSaving(false);
  }

  function update(key: keyof Omit<Team, 'id'>, val: string) {
    setEdit(prev => prev ? { ...prev, [key]: val } : prev);
  }

  return (
    <div style={{ padding: '24px', maxWidth: 680, margin: '0 auto' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 24, zIndex: 999,
          padding: '10px 18px', borderRadius: 6,
          background: toast.type === 'error' ? '#1a0000' : '#0a1a0a',
          border: `1px solid ${toast.type === 'error' ? '#5a0000' : '#2a5a2a'}`,
          color: toast.type === 'error' ? '#e57373' : '#4caf50',
          fontSize: 13, fontFamily: 'monospace',
        }}>
          {toast.type === 'error' ? '✗' : '✓'} {toast.msg}
        </div>
      )}

      <div style={{ fontSize: 11, color: '#555', letterSpacing: 2, marginBottom: 20, fontFamily: 'monospace' }}>
        TEAM EDITOR — COMMISSIONER MODE
      </div>

      <Field label="SELECT TEAM">
        <select
          value={selectedId ?? ''}
          onChange={e => setSelectedId(Number(e.target.value))}
          style={selectStyle}
        >
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.city} {t.name}</option>
          ))}
        </select>
      </Field>

      {edit && (
        <div style={{ background: '#0e0e0e', border: '1px solid #1a1a1a', borderRadius: 6, padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <Field label="CITY">
              <input value={edit.city} onChange={e => update('city', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="TEAM NAME">
              <input value={edit.name} onChange={e => update('name', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="ABBREVIATION">
              <input
                value={edit.abbreviation}
                onChange={e => update('abbreviation', e.target.value.toUpperCase().slice(0, 4))}
                maxLength={4}
                style={inputStyle}
              />
            </Field>
            <Field label="CONFERENCE">
              <select value={edit.conference} onChange={e => update('conference', e.target.value)} style={selectStyle}>
                {CONFERENCES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="DIVISION">
              <select value={edit.division} onChange={e => update('division', e.target.value)} style={selectStyle}>
                {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ marginTop: 4, padding: '8px 12px', borderRadius: 4, background: '#141414', border: '1px solid #1e1e1e' }}>
            <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace' }}>Preview: </span>
            <span style={{ fontSize: 13, color: '#ccc', fontFamily: 'monospace', fontWeight: 700 }}>
              {edit.city} {edit.name} ({edit.abbreviation}) · {edit.conference} {edit.division}
            </span>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              marginTop: 18, width: '100%', padding: '11px',
              background: saving ? '#141414' : '#FF8740',
              color: saving ? '#555' : '#000',
              border: 'none', borderRadius: 4,
              fontWeight: 700, fontSize: 12, letterSpacing: 2,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {saving ? 'SAVING...' : '✓ SAVE TEAM'}
          </button>
        </div>
      )}
    </div>
  );
}
