import React, { useEffect, useState } from 'react';
import { T } from '../theme';

declare const window: any;

interface SchemeOption {
  id: string;
  name: string;
  tagline: string;
  keyPositions: string;
  description: string;
  fit: number;
  current: boolean;
}

interface Props {
  teamId: number;
  teamName: string;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

function fitColor(fit: number): string {
  if (fit >= 1.5) return '#4caf50';
  if (fit >= 0) return '#FF8740';
  return '#e57373';
}

function fitLabel(fit: number): string {
  if (fit >= 1.5) return 'Great Fit';
  if (fit >= 0) return 'Decent Fit';
  return 'Poor Fit';
}

function fitSign(fit: number): string {
  return fit > 0 ? `+${fit.toFixed(1)}` : fit.toFixed(1);
}

export default function SchemesTab({ teamId, teamName, onToast }: Props) {
  const [offenseOptions, setOffenseOptions] = useState<SchemeOption[]>([]);
  const [defenseOptions, setDefenseOptions] = useState<SchemeOption[]>([]);
  const [currentOff, setCurrentOff] = useState('');
  const [currentDef, setCurrentDef] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadSchemes(); }, [teamId]);

  const loadSchemes = async () => {
    const data = await window.api.getSchemeOptions(teamId);
    setOffenseOptions(data.offenseOptions);
    setDefenseOptions(data.defenseOptions);
    setCurrentOff(data.currentOff);
    setCurrentDef(data.currentDef);
  };

  const handleSelectOff = async (schemeId: string) => {
    if (saving || schemeId === currentOff) return;
    setSaving(true);
    await window.api.setTeamScheme({ teamId, offenseScheme: schemeId });
    setCurrentOff(schemeId);
    setOffenseOptions(prev => prev.map(s => ({ ...s, current: s.id === schemeId })));
    onToast(`Offensive scheme set to ${schemeId}`, 'success');
    setSaving(false);
  };

  const handleSelectDef = async (schemeId: string) => {
    if (saving || schemeId === currentDef) return;
    setSaving(true);
    await window.api.setTeamScheme({ teamId, defenseScheme: schemeId });
    setCurrentDef(schemeId);
    setDefenseOptions(prev => prev.map(s => ({ ...s, current: s.id === schemeId })));
    onToast(`Defensive scheme set to ${schemeId}`, 'success');
    setSaving(false);
  };

  const renderCard = (s: SchemeOption, type: 'offense' | 'defense') => {
    const isSelected = type === 'offense' ? s.id === currentOff : s.id === currentDef;
    const onClick = type === 'offense' ? () => handleSelectOff(s.id) : () => handleSelectDef(s.id);
    return (
      <div
        key={s.id}
        onClick={onClick}
        style={{
          background: isSelected ? '#1a0e00' : T.bgCard,
          border: `1px solid ${isSelected ? '#FF8740' : T.borderFaint}`,
          borderRadius: 6,
          padding: '12px 14px',
          cursor: saving ? 'default' : 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
          marginBottom: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 'bold', color: isSelected ? '#FF8740' : '#fff' }}>
                {s.name}
              </span>
              {isSelected && (
                <span style={{
                  fontSize: 8, background: '#FF8740', color: '#000',
                  padding: '1px 5px', borderRadius: 2, fontWeight: 'bold', letterSpacing: 1,
                }}>ACTIVE</span>
              )}
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>{s.tagline}</div>
            <div style={{ fontSize: 9, color: '#4FC3F7', letterSpacing: 0.5, marginBottom: 6 }}>
              KEY: {s.keyPositions}
            </div>
            <div style={{ fontSize: 10, color: T.textDim, lineHeight: 1.5 }}>{s.description}</div>
          </div>

          <div style={{ textAlign: 'center', minWidth: 64, paddingLeft: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: fitColor(s.fit) }}>
              {fitSign(s.fit)}
            </div>
            <div style={{ fontSize: 8, letterSpacing: 0.8, color: fitColor(s.fit) }}>
              {fitLabel(s.fit)}
            </div>
            <div style={{ fontSize: 8, color: T.textDim, marginTop: 2 }}>rating adj</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: 1.5, marginBottom: 4 }}>
          SCHEME SELECTION
        </div>
        <div style={{ fontSize: 12, color: T.textDim }}>
          Choose the offensive and defensive identity for{' '}
          <span style={{ color: '#fff' }}>{teamName}</span>.
          Schemes that fit your roster add a rating bonus in every simulated game.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div style={{
            fontSize: 9, letterSpacing: 2, color: '#FF8740',
            marginBottom: 10, paddingBottom: 6,
            borderBottom: `1px solid ${T.borderFaint}`,
          }}>OFFENSIVE SCHEME</div>
          {offenseOptions.map(s => renderCard(s, 'offense'))}
        </div>

        <div>
          <div style={{
            fontSize: 9, letterSpacing: 2, color: '#4FC3F7',
            marginBottom: 10, paddingBottom: 6,
            borderBottom: `1px solid ${T.borderFaint}`,
          }}>DEFENSIVE SCHEME</div>
          {defenseOptions.map(s => renderCard(s, 'defense'))}
        </div>
      </div>

      <div style={{
        marginTop: 20, padding: '10px 14px',
        background: '#0e0e12', border: `1px solid ${T.borderFaint}`,
        borderRadius: 6, fontSize: 10, color: T.textDim, lineHeight: 1.6,
      }}>
        <span style={{ color: T.textMuted, fontWeight: 'bold' }}>How schemes work: </span>
        The fit rating shows how much your roster boosts (or drags) your team rating under each scheme.
        A +2.5 fit means your team plays at a +2.5 OVR advantage in that scheme compared to a neutral roster.
        CPU teams have their own schemes — winning the scheme matchup is a real strategic edge.
      </div>
    </div>
  );
}
