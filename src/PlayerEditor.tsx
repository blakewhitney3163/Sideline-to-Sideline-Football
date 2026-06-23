import React, { useEffect, useState } from 'react';

declare const window: any;

// ─── Constants ────────────────────────────────────────────────────────────────

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

const POSITION_LABELS: Record<string, string[]> = {
  QB: ['QB'],
  RB: ['HB', 'FB'],
  WR: ['WR'],
  TE: ['TE'],
  OL: ['LT', 'LG', 'C', 'RG', 'RT'],
  DL: ['DE', 'DT'],
  LB: ['MLB', 'OLB'],
  CB: ['CB'],
  S: ['FS', 'SS'],
  K: ['K'],
};

const DEV_TRAITS = ['Normal', 'Star', 'Superstar', 'X-Factor'];

const TRAIT_COLORS: Record<string, string> = {
  Normal: '#555',
  Star: '#4FC3F7',
  Superstar: '#FF8740',
  'X-Factor': '#FFD700',
};

const ATTRIBUTES: { label: string; key: string }[] = [
  { label: 'Speed',         key: 'speed' },
  { label: 'Strength',      key: 'strength' },
  { label: 'Awareness',     key: 'awareness' },
  { label: 'Throw Accuracy',key: 'throw_accuracy' },
  { label: 'Throw Power',   key: 'throw_power' },
  { label: 'Catching',      key: 'catching' },
  { label: 'Route Running', key: 'route_running' },
  { label: 'Tackle Rating', key: 'tackle_rating' },
  { label: 'Coverage',      key: 'coverage' },
  { label: 'Pass Rush',     key: 'pass_rush' },
  { label: 'Run Blocking',  key: 'runblocking' },
  { label: 'Pass Blocking', key: 'passblocking' },
  { label: 'Kick Power',    key: 'kickpower' },
  { label: 'Kick Accuracy', key: 'kickaccuracy' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Team {
  id: number;
  city: string;
  name: string;
}

interface ContractPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  age: number;
  dev_trait: string;
  speed: number;
  strength: number;
  awareness: number;
  throw_accuracy: number;
  throw_power: number;
  catching: number;
  route_running: number;
  tackle_rating: number;
  coverage: number;
  pass_rush: number;
  kickpower: number;
  kickaccuracy: number;
  runblocking: number;
  passblocking: number;
  annual_salary: number | null;
  years_remaining: number | null;
  roster_status: string;
}

interface EditState {
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  age: number;
  overall_rating: number;
  dev_trait: string;
  speed: number;
  strength: number;
  awareness: number;
  throw_accuracy: number;
  throw_power: number;
  catching: number;
  route_running: number;
  tackle_rating: number;
  coverage: number;
  pass_rush: number;
  kickpower: number;
  kickaccuracy: number;
  runblocking: number;
  passblocking: number;
  annual_salary: number;
  years_remaining: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ratingColor(n: number): string {
  if (n >= 90) return '#FFD700';
  if (n >= 80) return '#4FC3F7';
  if (n >= 70) return '#81C784';
  return '#888';
}

function playerToEdit(p: ContractPlayer): EditState {
  return {
    first_name:    p.first_name,
    last_name:     p.last_name,
    position:      p.position,
    position_label:p.position_label || p.position,
    age:           p.age,
    overall_rating:p.overall_rating,
    dev_trait:     p.dev_trait || 'Normal',
    speed:         p.speed         || 70,
    strength:      p.strength      || 70,
    awareness:     p.awareness     || 70,
    throw_accuracy:p.throw_accuracy|| 70,
    throw_power:   p.throw_power   || 70,
    catching:      p.catching      || 70,
    route_running: p.route_running || 70,
    tackle_rating: p.tackle_rating || 70,
    coverage:      p.coverage      || 70,
    pass_rush:     p.pass_rush     || 70,
    kickpower:     p.kickpower     || 70,
    kickaccuracy:  p.kickaccuracy  || 70,
    runblocking:   p.runblocking   || 70,
    passblocking:  p.passblocking  || 70,
    annual_salary:   p.annual_salary   ?? 1.0,
    years_remaining: p.years_remaining ?? 1,
  };
}

// ─── Shared styles ────────────────────────────────────────────────────────────

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

// ─── AttrRow ─────────────────────────────────────────────────────────────────

function AttrRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(40, Math.min(99, v));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <div style={{ fontSize: 10, color: '#505050', width: 114, flexShrink: 0, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </div>
      <input
        type="range" min={40} max={99} value={value}
        onChange={e => onChange(clamp(parseInt(e.target.value)))}
        style={{ flex: 1, accentColor: ratingColor(value), cursor: 'pointer' }}
      />
      <input
        type="number" min={40} max={99} value={value}
        onChange={e => onChange(clamp(parseInt(e.target.value) || 40))}
        style={{
          width: 44,
          background: '#141414',
          border: '1px solid #222',
          color: ratingColor(value),
          padding: '3px 5px',
          borderRadius: 3,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'monospace',
          textAlign: 'center',
        }}
      />
    </div>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, color: '#3a3a3a', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: '#505050', letterSpacing: 1 }}>{label.toUpperCase()}</span>
      {children}
    </label>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PlayerEditor() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [roster, setRoster] = useState<ContractPlayer[]>([]);
  const [posFilter, setPosFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<ContractPlayer | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    window.api.getTeams().then((t: Team[]) => {
      const sorted = [...t].sort((a, b) =>
        `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`)
      );
      setTeams(sorted);
      if (sorted.length > 0) setSelectedTeamId(sorted[0].id);
    });
  }, []);

  useEffect(() => {
    if (selectedTeamId !== null) loadRoster(selectedTeamId);
  }, [selectedTeamId]);

  async function loadRoster(teamId: number) {
    const players: ContractPlayer[] = await window.api.getTeamContracts(teamId);
    setRoster(players);
    setSelectedPlayer(null);
    setEdit(null);
    setPosFilter('ALL');
    setSearch('');
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }

  function handleSelectPlayer(p: ContractPlayer) {
    setSelectedPlayer(p);
    setEdit(playerToEdit(p));
  }

  function updateEdit<K extends keyof EditState>(key: K, val: EditState[K]) {
    setEdit(prev => (prev ? { ...prev, [key]: val } : prev));
  }

  async function handleSave() {
    if (!selectedPlayer || !edit || saving) return;
    setSaving(true);
    try {
      const result = await window.api.editPlayer({
        playerId:       selectedPlayer.id,
        first_name:     edit.first_name,
        last_name:      edit.last_name,
        position:       edit.position,
        position_label: edit.position_label,
        age:            edit.age,
        overall_rating: edit.overall_rating,
        dev_trait:      edit.dev_trait,
        speed:          edit.speed,
        strength:       edit.strength,
        awareness:      edit.awareness,
        throw_accuracy: edit.throw_accuracy,
        throw_power:    edit.throw_power,
        catching:       edit.catching,
        route_running:  edit.route_running,
        tackle_rating:  edit.tackle_rating,
        coverage:       edit.coverage,
        pass_rush:      edit.pass_rush,
        kickpower:      edit.kickpower,
        kickaccuracy:   edit.kickaccuracy,
        runblocking:    edit.runblocking,
        passblocking:   edit.passblocking,
      });

      if (selectedPlayer.annual_salary !== null) {
        await window.api.editPlayerContract({
          playerId:        selectedPlayer.id,
          annual_salary:   edit.annual_salary,
          years_remaining: edit.years_remaining,
        });
      }

      if (result?.success !== false) {
        showToast(`${edit.first_name} ${edit.last_name} saved.`, 'success');
        if (selectedTeamId !== null) {
          const refreshed: ContractPlayer[] = await window.api.getTeamContracts(selectedTeamId);
          setRoster(refreshed);
          const updated = refreshed.find(p => p.id === selectedPlayer.id);
          if (updated) { setSelectedPlayer(updated); setEdit(playerToEdit(updated)); }
        }
      } else {
        showToast(result?.reason ?? 'Save failed.', 'error');
      }
    } catch (e: any) {
      showToast(e.message ?? 'Save failed.', 'error');
    }
    setSaving(false);
  }

  const activePositions = ['ALL', ...POSITIONS.filter(pos => roster.some(p => p.position === pos))];

  const filteredRoster = roster
    .filter(p => posFilter === 'ALL' || p.position === posFilter)
    .filter(p =>
      !search.trim() ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b.overall_rating - a.overall_rating);

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 108px)',
      fontFamily: 'monospace',
      color: '#ccc',
      position: 'relative',
      background: '#0d0d0d',
    }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: toast.type === 'error' ? '#1a0000' : '#001a00',
          border: `1px solid ${toast.type === 'error' ? '#e57373' : '#4caf50'}`,
          color: toast.type === 'error' ? '#e57373' : '#4caf50',
          padding: '10px 16px', borderRadius: 6, fontSize: 13,
          fontFamily: 'monospace', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {toast.type === 'error' ? '✗' : '✓'} {toast.msg}
        </div>
      )}

      {/* ── Left Panel ── */}
      <div style={{
        width: 272, borderRight: '1px solid #1a1a1a',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>

        {/* Header */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #1a1a1a' }}>
          <div style={{ fontSize: 10, color: '#FF8740', letterSpacing: 2, marginBottom: 10, fontWeight: 700 }}>
            PLAYER EDITOR
          </div>
          <select
            value={selectedTeamId ?? ''}
            onChange={e => setSelectedTeamId(Number(e.target.value))}
            style={{
              width: '100%', background: '#141414', border: '1px solid #2a2a2a',
              color: '#ccc', padding: '7px 10px', borderRadius: 4,
              fontSize: 12, fontFamily: 'monospace', marginBottom: 8,
            }}
          >
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.city} {t.name}</option>
            ))}
          </select>
          <input
            placeholder="Search player..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', background: '#141414', border: '1px solid #222',
              color: '#ccc', padding: '6px 10px', borderRadius: 4,
              fontSize: 11, fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>

        {/* Position filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 10px', borderBottom: '1px solid #1a1a1a' }}>
          {activePositions.map(pos => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              style={{
                padding: '2px 7px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                background: posFilter === pos ? '#FF8740' : '#141414',
                border: `1px solid ${posFilter === pos ? '#FF8740' : '#1e1e1e'}`,
                color: posFilter === pos ? '#000' : '#555',
                fontFamily: 'monospace',
                fontWeight: posFilter === pos ? 700 : 400,
              }}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Player list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredRoster.length === 0 ? (
            <div style={{ padding: 20, color: '#2a2a2a', fontSize: 12, textAlign: 'center' }}>
              No players
            </div>
          ) : filteredRoster.map(p => {
            const isSelected = selectedPlayer?.id === p.id;
            return (
              <div
                key={p.id}
                onClick={() => handleSelectPlayer(p)}
                style={{
                  padding: '7px 12px', cursor: 'pointer',
                  background: isSelected ? '#0a150a' : 'transparent',
                  borderLeft: `3px solid ${isSelected ? '#4caf50' : 'transparent'}`,
                  borderBottom: '1px solid #111',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <div style={{ color: ratingColor(p.overall_rating), fontWeight: 700, fontSize: 14, width: 26, flexShrink: 0 }}>
                  {p.overall_rating}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    color: isSelected ? '#e0e0e0' : '#999',
                    fontWeight: isSelected ? 600 : 400,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {p.first_name} {p.last_name}
                  </div>
                  <div style={{ fontSize: 10, color: '#3a3a3a' }}>
                    {p.position_label || p.position} · Age {p.age}
                  </div>
                </div>
                {p.dev_trait && p.dev_trait !== 'Normal' && (
                  <div style={{ fontSize: 9, color: TRAIT_COLORS[p.dev_trait] ?? '#888', fontWeight: 700 }}>
                    {p.dev_trait === 'X-Factor' ? 'XF' : p.dev_trait === 'Superstar' ? 'SS' : 'S'}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '6px 12px', borderTop: '1px solid #111', fontSize: 10, color: '#2a2a2a' }}>
          {filteredRoster.length} of {roster.length} players
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {!selectedPlayer || !edit ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#252525', fontSize: 13,
          }}>
            ← Select a player to edit
          </div>
        ) : (
          <div style={{ maxWidth: 620 }}>

            {/* IDENTITY */}
            <Section title="Identity">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <Field label="First Name">
                  <input
                    value={edit.first_name}
                    onChange={e => updateEdit('first_name', e.target.value)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Last Name">
                  <input
                    value={edit.last_name}
                    onChange={e => updateEdit('last_name', e.target.value)}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
                <Field label="Position">
                  <select
                    value={edit.position}
                    onChange={e => {
                      const pos = e.target.value;
                      updateEdit('position', pos);
                      updateEdit('position_label', (POSITION_LABELS[pos] ?? [pos])[0]);
                    }}
                    style={selectStyle}
                  >
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Label">
                  <select
                    value={edit.position_label}
                    onChange={e => updateEdit('position_label', e.target.value)}
                    style={selectStyle}
                  >
                    {(POSITION_LABELS[edit.position] ?? [edit.position]).map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Age">
                  <input
                    type="number" min={18} max={50}
                    value={edit.age}
                    onChange={e => updateEdit('age', parseInt(e.target.value) || 18)}
                    style={inputStyle}
                  />
                </Field>
              </div>
            </Section>

            {/* RATING & DEV TRAIT */}
            <Section title="Rating & Dev Trait">
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12, alignItems: 'start' }}>
                <Field label="Overall">
                  <input
                    type="number" min={40} max={99}
                    value={edit.overall_rating}
                    onChange={e => updateEdit('overall_rating', Math.max(40, Math.min(99, parseInt(e.target.value) || 40)))}
                    style={{
                      ...inputStyle, fontSize: 26, fontWeight: 700,
                      color: ratingColor(edit.overall_rating), textAlign: 'center', padding: '8px',
                    }}
                  />
                </Field>
                <Field label="Dev Trait">
                  <div style={{ display: 'flex', gap: 6 }}>
                    {DEV_TRAITS.map(trait => (
                      <button
                        key={trait}
                        onClick={() => updateEdit('dev_trait', trait)}
                        style={{
                          flex: 1, padding: '8px 4px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
                          background: edit.dev_trait === trait ? '#141414' : 'transparent',
                          border: `1px solid ${edit.dev_trait === trait ? TRAIT_COLORS[trait] : '#1e1e1e'}`,
                          color: edit.dev_trait === trait ? TRAIT_COLORS[trait] : '#3a3a3a',
                          fontFamily: 'monospace',
                          fontWeight: edit.dev_trait === trait ? 700 : 400,
                        }}
                      >
                        {trait}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            </Section>

            {/* CONTRACT */}
            {selectedPlayer.annual_salary !== null && (
              <Section title="Contract">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Annual Salary ($M)">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#555', fontSize: 14 }}>$</span>
                      <input
                        type="number" min={0.5} max={99} step={0.1}
                        value={edit.annual_salary}
                        onChange={e => updateEdit('annual_salary', parseFloat(e.target.value) || 0.5)}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <span style={{ color: '#555', fontSize: 13 }}>M</span>
                    </div>
                  </Field>
                  <Field label="Years Remaining">
                    <input
                      type="number" min={1} max={15}
                      value={edit.years_remaining}
                      onChange={e => updateEdit('years_remaining', Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
                      style={inputStyle}
                    />
                  </Field>
                </div>
              </Section>
            )}

            {/* ATTRIBUTES */}
            <Section title="Attributes">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
                {ATTRIBUTES.map(({ label, key }) => (
                  <AttrRow
                    key={key}
                    label={label}
                    value={(edit as any)[key] as number}
                    onChange={v => updateEdit(key as keyof EditState, v as any)}
                  />
                ))}
              </div>
            </Section>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', padding: '13px', fontSize: 13, fontWeight: 700,
                letterSpacing: 1, cursor: saving ? 'not-allowed' : 'pointer',
                background: saving ? '#1a1a1a' : '#FF8740',
                border: `1px solid ${saving ? '#2a2a2a' : '#FF8740'}`,
                color: saving ? '#555' : '#000',
                borderRadius: 6, fontFamily: 'monospace', marginTop: 4,
              }}
            >
              {saving ? 'SAVING...' : '✓  SAVE CHANGES'}
            </button>

          </div>
        )}
      </div>
    </div>
  );
}
