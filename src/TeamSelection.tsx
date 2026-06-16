import React, { useState, useEffect } from 'react';
import { T } from './theme';

declare const window: any;

interface Team {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
}

interface Props {
  onSelect: (team: Team) => void;
}

const DIVISION_ORDER = ['North', 'South', 'East', 'West'];

export default function TeamSelection({ onSelect }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<Team | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.api.getTeams().then((data: Team[]) => setTeams(data));
  }, []);

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    await window.api.setUserTeam(selected.id);
    onSelect(selected);
  };

  const getTeamsFor = (conference: string, division: string) =>
    teams.filter(t => t.conference === conference && t.division === division);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#080808',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 32, color: '#fff', fontFamily: 'sans-serif',
      overflowY: 'auto',
    }}>
      {/* Title */}
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: T.textDim, letterSpacing: 3, marginBottom: 8 }}>
          NFL SIMULATOR
        </div>
        <div style={{ fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 6 }}>
          Choose Your Franchise
        </div>
        <div style={{ fontSize: 12, color: T.borderStrong }}>
          You'll manage this team throughout the dynasty
        </div>
      </div>

      {/* Team grid: AFC | NFC */}
      <div style={{ display: 'flex', gap: 32, marginBottom: 28 }}>
        {(['AFC', 'NFC'] as const).map(conf => (
          <div key={conf}>
            <div style={{
              fontSize: 11, fontWeight: 'bold', color: '#FF8740',
              letterSpacing: 2, marginBottom: 10, textAlign: 'center',
            }}>
              {conf}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {DIVISION_ORDER.map(div => (
                <div key={div}>
                  <div style={{
                    fontSize: 9, color: '#2e2e2e', letterSpacing: 1,
                    marginBottom: 6, textAlign: 'center',
                  }}>
                    {div.toUpperCase()}
                  </div>
                  {getTeamsFor(conf, div).map(team => {
                    const isSelected = selected?.id === team.id;
                    return (
                      <div
                        key={team.id}
                        onClick={() => setSelected(team)}
                        style={{
                          padding: '7px 10px', marginBottom: 4,
                          background: isSelected ? T.bgOrange : T.bgPage,
                          border: `1px solid ${isSelected ? '#FF8740' : T.bgCard}`,
                          borderRadius: 5, cursor: 'pointer',
                          transition: 'border-color 0.1s, background 0.1s',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = T.borderStrong;
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = T.bgCard;
                        }}
                      >
                        <div style={{ fontSize: 11, color: isSelected ? '#fff' : '#bbb', fontWeight: isSelected ? '700' : '400' }}>
                          {team.city}
                        </div>
                        <div style={{ fontSize: 10, color: isSelected ? '#FF8740' : T.textDim }}>
                          {team.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Confirm */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 44 }}>
        {selected ? (
          <>
            <span style={{ fontSize: 14, color: T.textMuted }}>
              {selected.city} {selected.name}
            </span>
            <button
              onClick={handleConfirm}
              disabled={saving}
              style={{
                padding: '11px 28px',
                background: saving ? T.borderMid : '#FF8740',
                border: 'none', borderRadius: 6,
                color: saving ? T.textMuted : '#000',
                fontWeight: 'bold', fontSize: 14,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Starting...' : 'Start Franchise →'}
            </button>
          </>
        ) : (
          <span style={{ fontSize: 13, color: T.borderMid }}>
            Select a team above to begin
          </span>
        )}
      </div>
    </div>
  );
}