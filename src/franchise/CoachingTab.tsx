import React, { useState, useEffect } from 'react';
import { ratingColor } from './utils';

interface Scout {
  id: number;
  team_id: number | null;
  first_name: string;
  last_name: string;
  overall_rating: number;
  specialty: string;
  salary: number;
  years_on_staff: number;
}

const SPECIALTY_COLOR: Record<string, string> = {
  Offense: '#FF8740', Defense: '#4FC3F7', College: '#4caf50',
  National: '#FFD700', Regional: '#AB47BC',
};

declare const window: any;

export interface Coach {
  id: number;
  team_id: number | null;
  role: 'HC' | 'OC' | 'DC' | 'ST';
  first_name: string;
  last_name: string;
  overall_rating: number;
  offense_rating: number;
  defense_rating: number;
  development_rating: number;
  experience: number;
  salary: number;
  years_remaining: number;
  coaching_xp?: number;
  coaching_level?: number;
}

const ROLE_META: Record<string, {
  label: string; color: string; primaryLabel: string; primaryKey: keyof Coach;
}> = {
  HC: { label: 'Head Coach',           color: '#FFD700', primaryLabel: 'Leadership', primaryKey: 'overall_rating'    },
  OC: { label: 'Off. Coordinator',     color: '#4FC3F7', primaryLabel: 'Offense',    primaryKey: 'offense_rating'    },
  DC: { label: 'Def. Coordinator',     color: '#ef5350', primaryLabel: 'Defense',    primaryKey: 'defense_rating'    },
  ST: { label: 'Special Teams Coord',  color: '#AB47BC', primaryLabel: 'ST Rating',  primaryKey: 'overall_rating'    },
};

const ROLES: Array<'HC' | 'OC' | 'DC' | 'ST'> = ['HC', 'OC', 'DC', 'ST'];

const XP_THRESHOLDS = [0, 0, 150, 400, 800, 1400, 2250, 3400, 4900, 6850, 9350];
const MAX_COACH_LEVEL = 10;

function getCoachTierLabel(level: number): string {
  if (level >= 9) return 'Legendary';
  if (level >= 7) return 'Elite';
  if (level >= 5) return 'Experienced';
  if (level >= 3) return 'Competent';
  return 'Developing';
}

function getTierColor(level: number): string {
  if (level >= 9) return '#FFD700';
  if (level >= 7) return '#FF8740';
  if (level >= 5) return '#4caf50';
  if (level >= 3) return '#4FC3F7';
  return '#888';
}

function xpProgress(totalXp: number, level: number): { pct: number; into: number; needed: number } {
  if (level >= MAX_COACH_LEVEL) return { pct: 100, into: 0, needed: 0 };
  const floorXp = XP_THRESHOLDS[level];
  const nextXp  = XP_THRESHOLDS[level + 1];
  const into    = totalXp - floorXp;
  const needed  = nextXp - floorXp;
  return { pct: Math.min(100, Math.round((into / needed) * 100)), into, needed };
}



interface Props {
  teamId: number;
  staff: Coach[];
  onRefresh: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

function StatBox({ label, value, text }: { label: string; value?: number; text?: string }) {
  return (
    <div style={{ background: '#0a0a0a', borderRadius: 4, padding: '5px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#444', letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 'bold', color: value !== undefined ? ratingColor(value) : '#888' }}>
        {text ?? value}
      </div>
    </div>
  );
}


function CoachXPBar({ coach }: { coach: Coach }) {
  const level = coach.coaching_level ?? 1;
  const xp    = coach.coaching_xp   ?? 0;
  const tier  = getCoachTierLabel(level);
  const color = getTierColor(level);
  const { pct, into, needed } = xpProgress(xp, level);
  const atMax = level >= MAX_COACH_LEVEL;

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1a1a1a' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
            background: `${color}22`, border: `1px solid ${color}55`, color,
          }}>LVL {level}</span>
          <span style={{ fontSize: 9, color: color }}>{tier}</span>
        </div>
        <span style={{ fontSize: 9, color: '#444' }}>
          {atMax ? 'MAX LEVEL' : `${into} / ${needed} XP`}
        </span>
      </div>
      <div style={{ background: '#111', borderRadius: 3, height: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

export default function CoachingTab({ teamId, staff, onRefresh, showToast }: Props) {
  const [availableCoaches, setAvailableCoaches] = useState<Coach[]>([]);
  const [showHirePanel, setShowHirePanel] = useState(false);
  const [hireRoleFilter, setHireRoleFilter] = useState<'ALL' | 'HC' | 'OC' | 'DC' | 'ST'>('ALL');
  const [working, setWorking] = useState(false);
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [availableScouts, setAvailableScouts] = useState<Scout[]>([]);
  const [showScoutHire, setShowScoutHire] = useState(false);
  const [weeklyPts, setWeeklyPts] = useState(0);

  const staffByRole: Partial<Record<string, Coach>> = {};
  for (const coach of staff) staffByRole[coach.role] = coach;

  useEffect(() => {
    window.api.getScouts(teamId).then(setScouts);
    window.api.getWeeklyScoutPts(teamId).then(setWeeklyPts);
  }, [teamId]);

  const loadAvailableScouts = async () => {
    const s = await window.api.getAvailableScouts();
    setAvailableScouts(s);
    setShowScoutHire(true);
  };

  const handleFireScout = async (scout: Scout) => {
    if (working) return;
    setWorking(true);
    const result = await window.api.fireScout(scout.id);
    if (!result.success) { showToast(result.reason ?? 'Could not release scout.', 'error'); }
    else {
      showToast(`${scout.first_name} ${scout.last_name} released.`, 'success');
      const updated = await window.api.getScouts(teamId);
      setScouts(updated);
      const pts = await window.api.getWeeklyScoutPts(teamId);
      setWeeklyPts(pts);
    }
    setWorking(false);
  };

  const handleHireScout = async (scout: Scout) => {
    if (working) return;
    setWorking(true);
    const result = await window.api.hireScout({ teamId, scoutId: scout.id });
    if (!result.success) { showToast(result.reason ?? 'Could not hire scout.', 'error'); }
    else {
      showToast(`${scout.first_name} ${scout.last_name} hired!`, 'success');
      const [updated, pts] = await Promise.all([
        window.api.getScouts(teamId),
        window.api.getWeeklyScoutPts(teamId),
      ]);
      setScouts(updated);
      setWeeklyPts(pts);
      const avail = await window.api.getAvailableScouts();
      setAvailableScouts(avail);
    }
    setWorking(false);
  };

  const loadAvailable = async () => {
    const coaches = await window.api.getAvailableCoaches();
    setAvailableCoaches(coaches);
    setShowHirePanel(true);
  };

  const handleFire = async (coach: Coach) => {
    if (working) return;
    setWorking(true);
    const result = await window.api.fireCoach(coach.id);
    if (!result.success) {
      showToast(result.reason ?? 'Could not release coach.', 'error');
    } else {
      showToast(`${coach.first_name} ${coach.last_name} released.`, 'success');
      onRefresh();
      if (showHirePanel) loadAvailable();
    }
    setWorking(false);
  };

  const handleHire = async (coach: Coach) => {
    if (working) return;
    setWorking(true);
    const result = await window.api.hireCoach({ teamId, coachId: coach.id });
    if (!result.success) {
      showToast(result.reason ?? 'Could not hire coach.', 'error');
    } else {
      showToast(`${coach.first_name} ${coach.last_name} hired as ${ROLE_META[coach.role].label}!`, 'success');
      onRefresh();
      loadAvailable();
    }
    setWorking(false);
  };

  const filteredAvailable = hireRoleFilter === 'ALL'
    ? availableCoaches
    : availableCoaches.filter(c => c.role === hireRoleFilter);

  return (
    <div style={{ padding: '0 0 32px' }}>

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, letterSpacing: 2, color: '#555' }}>COACHING STAFF</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 28 }}>
        {ROLES.map(role => {
          const coach = staffByRole[role];
          const meta = ROLE_META[role];

          if (!coach) {
            return (
              <div key={role} style={{ background: '#0d0d0d', border: '1px dashed #2a2a2a', borderRadius: 6, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <RoleBadge role={role} color={meta.color} />
                  <span style={{ fontSize: 11, color: '#444' }}>{meta.label}</span>
                </div>
                <div style={{ fontSize: 11, color: '#333', marginBottom: 12 }}>— No coach hired</div>
                <button onClick={() => { setHireRoleFilter(role); loadAvailable(); }} style={{
                  padding: '4px 12px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                  background: '#141414', border: `1px solid ${meta.color}44`, color: meta.color,
                }}>Hire {role}</button>
              </div>
            );
          }

          const primaryRating = coach[meta.primaryKey] as number;
          return (
            <div key={role} style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 6, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RoleBadge role={role} color={meta.color} />
                  <span style={{ fontSize: 13, color: '#ddd', fontWeight: 500 }}>{coach.first_name} {coach.last_name}</span>
                </div>
                <span style={{ fontSize: 24, fontWeight: 'bold', color: ratingColor(primaryRating) }}>{primaryRating}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
                <StatBox label={meta.primaryLabel} value={primaryRating} />
                <StatBox label="Dev" value={coach.development_rating} />
                <StatBox label="Exp" text={`${coach.experience}yr`} />
              </div>
              <CoachXPBar coach={coach} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <div style={{ fontSize: 10, color: '#444' }}>${coach.salary.toFixed(1)}M · {coach.years_remaining}yr left</div>
                <button onClick={() => handleFire(coach)} disabled={working} style={{
                  padding: '3px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                  background: '#1a0000', border: '1px solid #2a0000', color: '#e57373',
                }}>Fire</button>
              </div>
            </div>
          );
        })}
      </div>

      {!showHirePanel && (
        <button onClick={loadAvailable} style={{
          padding: '6px 18px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
          background: '#141414', border: '1px solid #2a2a2a', color: '#555', letterSpacing: 1,
        }}>VIEW AVAILABLE COACHES</button>
      )}

      {showHirePanel && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 10, letterSpacing: 2, color: '#555' }}>AVAILABLE COACHES</span>
            <button onClick={() => setShowHirePanel(false)} style={{
              padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
              background: 'transparent', border: '1px solid #222', color: '#444',
            }}>Close</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {(['ALL', 'HC', 'OC', 'DC', 'ST'] as const).map(r => {
              const active = hireRoleFilter === r;
              const color = r === 'ALL' ? '#FF8740' : ROLE_META[r]?.color ?? '#FF8740';
              return (
                <button key={r} onClick={() => setHireRoleFilter(r)} style={{
                  padding: '3px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                  background: active ? color : '#141414',
                  border: `1px solid ${active ? color : '#2a2a2a'}`,
                  color: active ? '#000' : '#555', fontWeight: active ? 'bold' : 'normal',
                }}>{r}</button>
              );
            })}
          </div>
          {filteredAvailable.length === 0 ? (
            <div style={{ fontSize: 11, color: '#333', padding: '16px 0' }}>No coaches available in this role.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredAvailable.map(coach => {
                const meta = ROLE_META[coach.role];
                const primaryRating = coach[meta.primaryKey] as number;
                return (
                  <div key={coach.id} style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 5, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <RoleBadge role={coach.role} color={meta.color} />
                      <div>
                        <div style={{ fontSize: 12, color: '#ccc' }}>{coach.first_name} {coach.last_name}</div>
                        <div style={{ fontSize: 10, color: '#444' }}>{meta.label}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, color: '#444', letterSpacing: 1 }}>{meta.primaryLabel}</div>
                        <div style={{ fontSize: 18, fontWeight: 'bold', color: ratingColor(primaryRating) }}>{primaryRating}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, color: '#444', letterSpacing: 1 }}>EXP</div>
                        <div style={{ fontSize: 13, color: '#777' }}>{coach.experience}yr</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, color: '#444', letterSpacing: 1 }}>ASK</div>
                        <div style={{ fontSize: 13, color: '#888' }}>${coach.salary.toFixed(1)}M</div>
                      </div>
                      <button onClick={() => handleHire(coach)} disabled={working} style={{
                        padding: '5px 14px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
                        borderRadius: 4, background: working ? '#141414' : '#1a3a1a',
                        border: '1px solid #4caf5055', color: working ? '#444' : '#4caf50',
                      }}>Hire</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Scouting Department */}
      <div style={{ marginTop: 32, borderTop: '1px solid #1a1a1a', paddingTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <span style={{ fontSize: 10, letterSpacing: 2, color: '#4caf50' }}>SCOUTING DEPARTMENT</span>
            <span style={{ fontSize: 10, color: weeklyPts >= 7 ? '#FFD700' : '#4caf50', marginLeft: 12, background: '#0a1a0a', padding: '2px 8px', borderRadius: 3 }}>
              +{weeklyPts} pts/week
            </span>
          </div>
          <button
            onClick={showScoutHire ? () => setShowScoutHire(false) : loadAvailableScouts}
            style={{
              padding: '4px 12px', fontSize: 10, fontWeight: 'bold', cursor: 'pointer',
              background: showScoutHire ? '#141414' : '#0a1a0a',
              border: `1px solid ${showScoutHire ? '#333' : '#4caf5055'}`,
              borderRadius: 4, color: showScoutHire ? '#555' : '#4caf50',
            }}
          >
            {showScoutHire ? 'Cancel' : '+ Hire Scout'}
          </button>
        </div>

        {scouts.length === 0 ? (
          <div style={{ fontSize: 11, color: '#333', padding: '8px 0' }}>
            No scouts on staff — hire one to earn scouting points each week.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {scouts.map(scout => {
              const specColor = SPECIALTY_COLOR[scout.specialty] ?? '#888';
              return (
                <div key={scout.id} style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 5, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: `${specColor}22`, border: `1px solid ${specColor}55`, color: specColor }}>{scout.specialty.toUpperCase()}</span>
                    <div>
                      <div style={{ fontSize: 12, color: '#ccc' }}>{scout.first_name} {scout.last_name}</div>
                      <div style={{ fontSize: 9, color: '#444' }}>{scout.years_on_staff} yr{scout.years_on_staff !== 1 ? 's' : ''} on staff</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: '#444', letterSpacing: 1 }}>QUALITY</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: ratingColor(scout.overall_rating) }}>{scout.overall_rating}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: '#444', letterSpacing: 1 }}>PTS/WK</div>
                      <div style={{ fontSize: 13, color: '#4caf50' }}>+{Math.ceil(scout.overall_rating / 15)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: '#444', letterSpacing: 1 }}>SALARY</div>
                      <div style={{ fontSize: 13, color: '#888' }}>${scout.salary.toFixed(1)}M</div>
                    </div>
                    <button onClick={() => handleFireScout(scout)} disabled={working} style={{
                      padding: '5px 12px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
                      borderRadius: 4, background: working ? '#141414' : '#1a0808',
                      border: '1px solid #e5737355', color: working ? '#444' : '#e57373',
                    }}>Release</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showScoutHire && (
          <div style={{ background: '#0a0a0a', borderRadius: 6, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: '#333', marginBottom: 10 }}>AVAILABLE SCOUTS</div>
            {availableScouts.length === 0 ? (
              <div style={{ fontSize: 11, color: '#333' }}>No scouts currently available.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {availableScouts.map(scout => {
                  const specColor = SPECIALTY_COLOR[scout.specialty] ?? '#888';
                  return (
                    <div key={scout.id} style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 5, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: `${specColor}22`, border: `1px solid ${specColor}55`, color: specColor }}>{scout.specialty.toUpperCase()}</span>
                        <div style={{ fontSize: 12, color: '#ccc' }}>{scout.first_name} {scout.last_name}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 9, color: '#444', letterSpacing: 1 }}>QUALITY</div>
                          <div style={{ fontSize: 18, fontWeight: 'bold', color: ratingColor(scout.overall_rating) }}>{scout.overall_rating}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 9, color: '#444', letterSpacing: 1 }}>PTS/WK</div>
                          <div style={{ fontSize: 13, color: '#4caf50' }}>+{Math.ceil(scout.overall_rating / 15)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 9, color: '#444', letterSpacing: 1 }}>ASK</div>
                          <div style={{ fontSize: 13, color: '#888' }}>${scout.salary.toFixed(1)}M</div>
                        </div>
                        <button onClick={() => handleHireScout(scout)} disabled={working} style={{
                          padding: '5px 14px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
                          borderRadius: 4, background: working ? '#141414' : '#0a1a0a',
                          border: '1px solid #4caf5055', color: working ? '#444' : '#4caf50',
                        }}>Hire</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

function RoleBadge({ role, color }: { role: string; color: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 'bold', letterSpacing: 1.5,
      padding: '2px 7px', borderRadius: 3,
      background: `${color}22`, border: `1px solid ${color}55`, color,
    }}>{role}</span>
  );
}
