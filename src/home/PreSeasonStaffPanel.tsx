import React, { useEffect, useState } from 'react';
import { T } from '../theme';

declare const window: any;

interface Coach {
  id: number;
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
  team_id: number | null;
}

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

type BudgetTier = 'bronze' | 'silver' | 'gold';

interface TierDef {
  label: string;
  color: string;
  bg: string;
  maxSalary: number;
  ovrRange: string;
}

const TIERS: Record<BudgetTier, TierDef> = {
  bronze: { label: 'Bronze', color: '#CD7F32', bg: '#1a0f00', maxSalary: 2_000_000, ovrRange: '60–74' },
  silver: { label: 'Silver', color: '#C0C0C0', bg: '#111111', maxSalary: 4_000_000, ovrRange: '70–82' },
  gold:   { label: 'Gold',   color: '#FFD700', bg: '#1a1200', maxSalary: 12_000_000, ovrRange: '78–99' },
};

const TEMPLATE_BUDGETS: Record<string, number> = {
  rebuild:   8_000_000,
  contender: 14_000_000,
  dynasty:   20_000_000,
};
const DEFAULT_BUDGET = 12_000_000;

const COACH_ROLES: Array<{ key: 'HC' | 'OC' | 'DC' | 'ST'; label: string; icon: string }> = [
  { key: 'HC', label: 'Head Coach',        icon: '🎯' },
  { key: 'OC', label: 'Off. Coordinator',  icon: '⚡' },
  { key: 'DC', label: 'Def. Coordinator',  icon: '🛡' },
  { key: 'ST', label: 'Special Teams',     icon: '🏈' },
];

const SPECIALTY_ICONS: Record<string, string> = {
  Offense: '⚡', Defense: '🛡', College: '🎓', National: '🌐', Regional: '📍',
};

const MAX_SCOUTS = 3;

const ovrColor = (v: number) =>
  v >= 82 ? '#FFD700' : v >= 74 ? '#4FC3F7' : v >= 66 ? '#FF8740' : '#e57373';

const scoutOvrColor = (v: number) =>
  v >= 70 ? '#4caf50' : v >= 50 ? '#FF8740' : '#e57373';

const fmtM = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;

const fmtScout = (n: number) => `$${n.toFixed(1)}M`;

interface Props {
  teamId: number;
  season: number;
  onConfirm: () => void;
  onGenerateSchedule: () => void;
  generatingSchedule?: boolean;
}

export default function PreSeasonStaffPanel({
  teamId, season, onConfirm, onGenerateSchedule, generatingSchedule,
}: Props) {
  const [staff, setStaff]                   = useState<Coach[]>([]);
  const [available, setAvailable]           = useState<Coach[]>([]);
  const [scouts, setScouts]                 = useState<Scout[]>([]);
  const [availableScouts, setAvailableScouts] = useState<Scout[]>([]);
  const [tier, setTier]                     = useState<BudgetTier>('silver');
  const [expandedRole, setExpandedRole]     = useState<'HC' | 'OC' | 'DC' | 'ST' | null>(null);
  const [scoutsExpanded, setScoutsExpanded] = useState(false);
  const [pendingDuration, setPendingDuration] = useState<Record<number, number>>({});
  const [working, setWorking]               = useState(false);
  const [confirmed, setConfirmed]           = useState(false);
  const [coachingBudget, setCoachingBudget] = useState(DEFAULT_BUDGET);
  const [budgetRequestUsed, setBudgetRequestUsed] = useState(false);
  const [budgetRequestMsg, setBudgetRequestMsg]   = useState<string | null>(null);

  const loadData = async () => {
    const [s, a, sc, asc, tmpl] = await Promise.all([
      window.api.getCoachingStaff(teamId),
      window.api.getAvailableCoaches(),
      window.api.getScouts(teamId),
      window.api.getAvailableScouts(),
      window.api.getSetting('dynasty_template'),
    ]);
    setStaff(s ?? []);
    setAvailable(a ?? []);
    setScouts(sc ?? []);
    setAvailableScouts((asc ?? []).slice(0, 12));
    setCoachingBudget(TEMPLATE_BUDGETS[tmpl as string] ?? DEFAULT_BUDGET);
  };

  useEffect(() => { loadData(); }, [teamId]);

  const totalCoachSalary  = staff.reduce((sum, c) => sum + (c.salary ?? 0), 0);
  const totalScoutSalary  = scouts.reduce((sum, s) => sum + (s.salary ?? 0), 0);
  const budgetRemaining   = coachingBudget - totalCoachSalary;
  const overBudget        = budgetRemaining < 0;

  const getCoach = (role: 'HC' | 'OC' | 'DC' | 'ST') => staff.find(c => c.role === role) ?? null;

  const marketForRole = (role: 'HC' | 'OC' | 'DC' | 'ST') =>
    available.filter(c => c.role === role && c.salary <= TIERS[tier].maxSalary).slice(0, 5);

  const getDuration = (coachId: number) => pendingDuration[coachId] ?? 2;

  const canAfford = (salary: number) => totalCoachSalary + salary <= coachingBudget;

  const handleRequestBudget = async () => {
    if (budgetRequestUsed) return;
    setBudgetRequestUsed(true);
    const patience = parseInt(await window.api.getSetting('owner_patience') ?? '75', 10);
    let grant = 0;
    let msg = '';
    if (patience > 70) {
      grant = (Math.floor(Math.random() * 3) + 4) * 1_000_000; // $4–6M
      msg = `✓ The owner is confident in the direction — granted ${fmtM(grant)} in additional coaching budget.`;
    } else if (patience >= 40) {
      grant = (Math.floor(Math.random() * 2) + 2) * 1_000_000; // $2–3M
      msg = `✓ The owner approved a modest increase — granted ${fmtM(grant)} in additional coaching budget.`;
    } else {
      msg = `✗ The owner isn't willing to invest further right now. Improve results to unlock more budget.`;
    }
    if (grant > 0) setCoachingBudget(prev => prev + grant);
    setBudgetRequestMsg(msg);
  };

  const handleHireCoach = async (coach: Coach) => {
    if (!canAfford(coach.salary)) return;
    setWorking(true);
    const yearsRemaining = getDuration(coach.id);
    await window.api.hireCoach({ teamId, coachId: coach.id, yearsRemaining });
    await loadData();
    setExpandedRole(null);
    setWorking(false);
  };

  const handleFireCoach = async (coachId: number) => {
    setWorking(true);
    await window.api.fireCoach(coachId);
    await loadData();
    setWorking(false);
  };

  const handleHireScout = async (scoutId: number) => {
    if (scouts.length >= MAX_SCOUTS) return;
    setWorking(true);
    await window.api.hireScout({ teamId, scoutId });
    await loadData();
    setWorking(false);
  };

  const handleFireScout = async (scoutId: number) => {
    setWorking(true);
    await window.api.fireScout(scoutId);
    await loadData();
    setWorking(false);
  };

  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm();
    onGenerateSchedule();
  };

  const vacantRoles = COACH_ROLES.filter(r => !getCoach(r.key));

  if (confirmed) {
    return (
      <div style={{
        background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8,
        padding: '16px 20px', color: T.textMuted, fontSize: 12, textAlign: 'center',
      }}>
        {generatingSchedule ? '⏳ Generating schedule...' : '✓ Staff locked in — season starting...'}
      </div>
    );
  }

  return (
    <div style={{ background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '20px 24px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: T.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>
            Pre-Season Setup · {season}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary }}>Staff Hiring</div>
          {vacantRoles.length > 0 && (
            <div style={{ fontSize: 10, color: '#e57373', marginTop: 4 }}>
              ⚠ {vacantRoles.length} vacant slot{vacantRoles.length > 1 ? 's' : ''} — {vacantRoles.map(r => r.key).join(', ')}
            </div>
          )}
        </div>

        {/* Coaching Budget */}
        <div style={{ textAlign: 'right' }}>
          <div style={{
            background: overBudget ? '#1a0000' : '#0a1a0a',
            border: `1px solid ${overBudget ? '#3a1a1a' : '#1a3a1a'}`,
            borderRadius: 6, padding: '8px 14px', marginBottom: 6,
          }}>
            <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
              Coaching Budget
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: overBudget ? '#e57373' : '#4caf50' }}>
              {fmtM(Math.max(0, budgetRemaining))}
            </div>
            <div style={{ fontSize: 8, color: T.textDim, marginTop: 1 }}>
              {fmtM(totalCoachSalary)} of {fmtM(coachingBudget)} used
            </div>
          </div>
          {!budgetRequestUsed ? (
            <button onClick={handleRequestBudget} style={{
              fontSize: 9, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
              background: 'none', border: '1px solid #2a1800',
              color: '#FF8740', letterSpacing: 0.5, width: '100%',
            }}>
              💼 Request More Budget
            </button>
          ) : (
            <div style={{
              fontSize: 9, color: budgetRequestMsg?.startsWith('✓') ? '#4caf50' : '#e57373',
              maxWidth: 180, lineHeight: 1.4, textAlign: 'right',
            }}>
              {budgetRequestMsg}
            </div>
          )}
        </div>
      </div>

      {/* ── Hire Market Tier Filter ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 9, letterSpacing: 1.5, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>
          Hire Market Filter
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(Object.entries(TIERS) as [BudgetTier, TierDef][]).map(([key, def]) => (
            <button key={key} onClick={() => setTier(key)} style={{
              flex: 1, padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${tier === key ? def.color : T.borderFaint}`,
              background: tier === key ? def.bg : T.bgCard,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: def.color, marginBottom: 2 }}>{def.label}</div>
              <div style={{ fontSize: 9, color: T.textMuted }}>OVR {def.ovrRange}</div>
              <div style={{ fontSize: 8, color: T.textDim, marginTop: 2 }}>
                {key === 'gold' ? 'Any salary' : `≤${fmtM(def.maxSalary)}/coach`}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Coaching Staff ── */}
      <div style={{ fontSize: 9, letterSpacing: 1.5, color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>
        Coaching Staff
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {COACH_ROLES.map(({ key, label, icon }) => {
          const coach = getCoach(key);
          const market = marketForRole(key);
          const isExpanded = expandedRole === key;
          const isExpired = coach && coach.years_remaining <= 0;

          return (
            <div key={key} style={{
              background: T.bgCard,
              border: `1px solid ${isExpired ? '#3a1a00' : isExpanded ? T.borderMid : T.borderFaint}`,
              borderRadius: 6, overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
                  {coach ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: T.textPrimary, fontWeight: 600 }}>
                        {coach.first_name} {coach.last_name}
                      </span>
                      <span style={{
                        fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                        background: isExpired ? '#2a0a00' : coach.years_remaining === 1 ? '#1a1000' : '#0a1a0a',
                        color: isExpired ? '#e57373' : coach.years_remaining === 1 ? '#FF8740' : '#4caf50',
                        border: `1px solid ${isExpired ? '#3a1a00' : coach.years_remaining === 1 ? '#2a1800' : '#1a3a1a'}`,
                      }}>
                        {isExpired ? 'EXPIRED' : `${coach.years_remaining}yr`}
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#e57373', fontStyle: 'italic' }}>Vacant — hire a coach</div>
                  )}
                </div>

                {coach && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {[
                      { label: 'OVR', val: coach.overall_rating, color: ovrColor(coach.overall_rating) },
                      { label: 'OFF', val: coach.offense_rating },
                      { label: 'DEF', val: coach.defense_rating },
                      { label: 'DEV', val: coach.development_rating },
                    ].map(({ label: lbl, val, color }) => (
                      <span key={lbl} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: T.textDim }}>{lbl}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: color ?? T.textSecondary }}>{val}</div>
                      </span>
                    ))}
                    <div style={{ fontSize: 10, color: T.textSecondary, fontFamily: 'monospace', marginLeft: 4 }}>
                      {fmtM(coach.salary)}/yr
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (coach) {
                      handleFireCoach(coach.id);
                    } else {
                      setExpandedRole(isExpanded ? null : key);
                    }
                  }}
                  disabled={working}
                  style={{
                    fontSize: 9, padding: '4px 10px', borderRadius: 4, cursor: working ? 'not-allowed' : 'pointer',
                    background: coach ? '#1a0a0a' : '#0a1a0a',
                    border: `1px solid ${coach ? '#3a1a1a' : '#1a3a1a'}`,
                    color: coach ? '#e57373' : '#4caf50',
                    flexShrink: 0,
                  }}
                >
                  {coach ? 'Release' : isExpanded ? '▲ Close' : '+ Hire'}
                </button>
              </div>

              {/* Hire market expansion */}
              {!coach && isExpanded && (
                <div style={{ borderTop: `1px solid ${T.borderFaint}`, background: T.bgPage, padding: '10px 12px' }}>
                  {market.length === 0 ? (
                    <div style={{ fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>
                      No {TIERS[tier].label} coaches available for this role.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {market.map(c => {
                        const affordable = canAfford(c.salary);
                        return (
                          <div key={c.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 4,
                            background: T.bgCard,
                            border: `1px solid ${affordable ? T.borderFaint : '#3a1a1a'}`,
                            opacity: affordable ? 1 : 0.5,
                          }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, color: affordable ? T.textPrimary : T.textDim, fontWeight: 600 }}>
                                {c.first_name} {c.last_name}
                              </div>
                              <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                                {[
                                  { label: 'OVR', val: c.overall_rating, color: ovrColor(c.overall_rating) },
                                  { label: 'OFF', val: c.offense_rating },
                                  { label: 'DEF', val: c.defense_rating },
                                  { label: 'DEV', val: c.development_rating },
                                  { label: 'EXP', val: c.experience },
                                ].map(({ label: lbl, val, color }) => (
                                  <span key={lbl} style={{ fontSize: 9, color: T.textSecondary, fontFamily: 'monospace' }}>
                                    <span style={{ color: T.textDim }}>{lbl} </span>
                                    <span style={{ color: color ?? T.textSecondary, fontWeight: 700 }}>{val}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: T.textSecondary, fontFamily: 'monospace', minWidth: 50, textAlign: 'right' }}>
                              {fmtM(c.salary)}/yr
                            </div>

                            {/* Contract duration selector */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 60 }}>
                              <div style={{ fontSize: 8, color: T.textMuted }}>Contract</div>
                              <div style={{ display: 'flex', gap: 2 }}>
                                {[1, 2, 3, 4].map(yr => (
                                  <button key={yr}
                                    onClick={() => setPendingDuration(prev => ({ ...prev, [c.id]: yr }))}
                                    style={{
                                      width: 20, height: 20, borderRadius: 3, fontSize: 9, fontWeight: 700,
                                      cursor: 'pointer',
                                      background: getDuration(c.id) === yr ? '#1a3a1a' : T.bgPage,
                                      border: `1px solid ${getDuration(c.id) === yr ? '#4caf50' : T.borderFaint}`,
                                      color: getDuration(c.id) === yr ? '#4caf50' : T.textMuted,
                                    }}>
                                    {yr}
                                  </button>
                                ))}
                              </div>
                              <div style={{ fontSize: 7, color: T.textDim }}>yr{getDuration(c.id) > 1 ? 's' : ''}</div>
                            </div>

                            <button
                              onClick={() => handleHireCoach(c)}
                              disabled={working || !affordable}
                              title={!affordable ? 'Exceeds coaching budget' : undefined}
                              style={{
                                fontSize: 9,
                                color: affordable ? '#4caf50' : '#e57373',
                                background: affordable ? '#0a1a0a' : '#1a0a0a',
                                border: `1px solid ${affordable ? '#1a3a1a' : '#3a1a1a'}`,
                                borderRadius: 3, padding: '4px 10px',
                                cursor: (working || !affordable) ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {affordable ? 'Hire' : 'Over Budget'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Scouting Staff ── */}
      <div style={{ borderTop: `1px solid ${T.borderFaint}`, paddingTop: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: T.textMuted, textTransform: 'uppercase' }}>
              Scouting Staff
            </div>
            <div style={{ fontSize: 9, color: T.textDim, marginTop: 2 }}>
              {scouts.length}/{MAX_SCOUTS} scouts · {scouts.length > 0
                ? `${scouts.reduce((s, sc) => s + Math.ceil(sc.overall_rating / 15), 0)} pts/wk draft scouting`
                : 'no scouts — draft vision limited'}
            </div>
          </div>
          <button onClick={() => setScoutsExpanded(x => !x)} style={{
            fontSize: 9, color: scoutsExpanded ? T.textMuted : '#FF8740', background: 'none',
            border: `1px solid ${scoutsExpanded ? T.borderFaint : '#2a1800'}`,
            borderRadius: 3, padding: '3px 10px', cursor: 'pointer',
          }}>
            {scoutsExpanded ? '▲ Close' : scouts.length < MAX_SCOUTS ? '+ Hire Scout' : '↔ Manage'}
          </button>
        </div>

        {scouts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: scoutsExpanded ? 10 : 0 }}>
            {scouts.map(sc => (
              <div key={sc.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 5,
                background: T.bgCard, border: `1px solid ${T.borderFaint}`,
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: scoutOvrColor(sc.overall_rating), minWidth: 28 }}>
                  {sc.overall_rating}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.textPrimary }}>{sc.first_name} {sc.last_name}</div>
                  <div style={{ fontSize: 9, color: T.textMuted, marginTop: 1 }}>
                    <span style={{ marginRight: 6 }}>{SPECIALTY_ICONS[sc.specialty] ?? '•'} {sc.specialty}</span>
                    <span style={{ color: T.textDim }}>{sc.years_on_staff}yr on staff</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: T.textSecondary, fontFamily: 'monospace', minWidth: 44, textAlign: 'right' }}>
                  {fmtScout(sc.salary)}/yr
                </div>
                <div style={{ fontSize: 9, color: '#4FC3F7', minWidth: 52, textAlign: 'right' }}>
                  +{Math.ceil(sc.overall_rating / 15)} pts/wk
                </div>
                <button onClick={() => handleFireScout(sc.id)} disabled={working} style={{
                  fontSize: 9, color: '#e57373', background: 'none',
                  border: '1px solid #3a1a1a', borderRadius: 3,
                  padding: '3px 8px', cursor: working ? 'not-allowed' : 'pointer',
                }}>
                  Release
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: T.textDim, fontStyle: 'italic', marginBottom: scoutsExpanded ? 10 : 0 }}>
            No scouts on staff.
          </div>
        )}

        {scoutsExpanded && (
          <div style={{ borderTop: `1px solid ${T.borderFaint}`, paddingTop: 10 }}>
            {scouts.length >= MAX_SCOUTS ? (
              <div style={{ fontSize: 10, color: T.textMuted, padding: '4px 0' }}>
                Scout roster full ({MAX_SCOUTS}/{MAX_SCOUTS}). Release a scout to hire.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                  Available Scouts
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {availableScouts.length === 0 ? (
                    <div style={{ fontSize: 10, color: T.textDim }}>No scouts available.</div>
                  ) : availableScouts.map(sc => (
                    <div key={sc.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 4,
                      background: T.bgCard, border: `1px solid ${T.borderFaint}`,
                    }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: scoutOvrColor(sc.overall_rating), minWidth: 26 }}>
                        {sc.overall_rating}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: T.textPrimary }}>{sc.first_name} {sc.last_name}</div>
                        <div style={{ fontSize: 9, color: T.textMuted }}>
                          {SPECIALTY_ICONS[sc.specialty] ?? '•'} {sc.specialty}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: T.textSecondary, fontFamily: 'monospace', minWidth: 44, textAlign: 'right' }}>
                        {fmtScout(sc.salary)}/yr
                      </div>
                      <div style={{ fontSize: 9, color: '#4FC3F7', minWidth: 52, textAlign: 'right' }}>
                        +{Math.ceil(sc.overall_rating / 15)} pts/wk
                      </div>
                      <button onClick={() => handleHireScout(sc.id)} disabled={working || scouts.length >= MAX_SCOUTS} style={{
                        fontSize: 9, color: '#4caf50', background: '#0a1a0a',
                        border: '1px solid #1a3a1a', borderRadius: 3,
                        padding: '4px 10px', cursor: (working || scouts.length >= MAX_SCOUTS) ? 'not-allowed' : 'pointer',
                      }}>
                        Hire
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'OVR', desc: 'Overall rating' },
          { label: 'OFF', desc: 'Offense coaching' },
          { label: 'DEF', desc: 'Defense coaching' },
          { label: 'DEV', desc: 'Player development' },
          { label: 'EXP', desc: 'Experience (yrs)' },
        ].map(({ label, desc }) => (
          <div key={label} style={{ fontSize: 8, color: T.textDim }}>
            <span style={{ color: T.textMuted, fontFamily: 'monospace' }}>{label}</span> {desc}
          </div>
        ))}
      </div>

      {/* ── Confirm Button ── */}
      <button onClick={handleConfirm} disabled={!!generatingSchedule || working} style={{
        width: '100%', padding: '12px 0',
        background: '#0a2a0a', border: '1px solid #2a5a2a',
        borderRadius: 6, color: '#4caf50', fontSize: 13, fontWeight: 700,
        cursor: (generatingSchedule || working) ? 'not-allowed' : 'pointer',
        letterSpacing: 0.5,
      }}>
        {generatingSchedule ? 'Generating Schedule...' : `✓ Lock In Staff & Start ${season} Season`}
      </button>
    </div>
  );
}

