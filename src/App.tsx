import React, { useState, useEffect, lazy, Suspense } from 'react';
import { T } from './theme';
import { useGameStore, UserTeam } from './store/gameStore';

declare const window: any;

// All heavy tab components are lazy-loaded — they only parse/execute on first visit
const Home       = lazy(() => import('./Home'));
const Standings  = lazy(() => import('./Standings'));
const Teams      = lazy(() => import('./Teams'));
const Schedule   = lazy(() => import('./Schedule'));
const Stats      = lazy(() => import('./Stats'));
const Playoffs   = lazy(() => import('./Playoffs'));
const Trades     = lazy(() => import('./Trades'));
const Franchise  = lazy(() => import('./Franchise'));
const Draft      = lazy(() => import('./Draft'));
const DepthChart = lazy(() => import('./DepthChart'));
const Records    = lazy(() => import('./Records'));
const NewsFeed   = lazy(() => import('./newsCenter/NewsFeed'));
const TeamSelection = lazy(() => import('./TeamSelection'));

type Tab = 'home' | 'standings' | 'teams' | 'schedule' | 'stats' | 'playoffs' | 'trades' | 'franchise' | 'draft' | 'depth' | 'records' | 'news';
type Screen = 'loading' | 'start' | 'team-select' | 'setup' | 'game';

interface SetupStep { label: string; done: boolean; }

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: 'home',      label: 'Home' },
  { id: 'standings', label: 'Standings' },
  { id: 'teams',     label: 'Teams' },
  { id: 'schedule',  label: 'Schedule' },
  { id: 'stats',     label: 'Stats' },
  { id: 'records',   label: 'Records' },
  { id: 'playoffs',  label: 'Playoffs' },
  { id: 'trades',    label: 'Trades' },
  { id: 'franchise', label: 'Franchise' },
  { id: 'depth',     label: 'Depth Chart' },
  { id: 'news',      label: '📰 News' },
];

// Shown while a lazy tab chunk is first loading
function TabFallback() {
  return (
    <div style={{ padding: 48, color: T.textDim, fontSize: 12, fontFamily: 'monospace', textAlign: 'center' }}>
      Loading...
    </div>
  );
}

export default function App() {
  const [screen, setScreen]           = useState<Screen>('loading');
  const [activeTab, setActiveTab]     = useState<Tab>('home');
  // Tracks which tabs have ever been visited so we can keep them mounted
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(new Set(['home']));
  const [setupSteps, setSetupSteps]   = useState<SetupStep[]>([]);
  const [setupComplete, setSetupComplete] = useState(false);
  const [hasSave, setHasSave]         = useState(false);

  const {
    currentSeason, setCurrentSeason,
    userTeam, setUserTeam,
    playoffsComplete, setPlayoffsComplete,
    difficulty, setDifficulty,
    advanceSeason,
  } = useGameStore();

  useEffect(() => {
    window.api.getDifficulty().then((d: string) => setDifficulty(d as any));
    Promise.all([
      window.api.getCurrentSeason(),
      window.api.getUserTeam(),
      window.api.getOffseasonStatus(),
    ]).then(([season, team, offseason]: [number, UserTeam | null, any]) => {
      setCurrentSeason(season);
      setPlayoffsComplete(offseason.playoffsComplete ?? false);
      if (!team) {
        setHasSave(false);
        setScreen('start');
      } else {
        setHasSave(true);
        window.api.checkSetupDone().then((done: boolean) => {
          setUserTeam(team);
          setScreen(done ? 'start' : 'setup');
          if (!done) runSetup();
        });
      }
    });
  }, []);

  // Navigate to a tab and mark it as mounted so it stays alive
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setMountedTabs(prev => new Set([...prev, tab]));
  };

  const markStep = (label: string, done: boolean) => {
    setSetupSteps(prev => {
      const existing = prev.find(s => s.label === label);
      if (existing) return prev.map(s => s.label === label ? { ...s, done } : s);
      return [...prev, { label, done }];
    });
  };

  const runSetup = async () => {
    markStep('Importing real NFL contracts from OTC...', false);
    await window.api.importOtcContracts();
    markStep('Importing real NFL contracts from OTC...', true);

    markStep('Building player career histories...', false);
    await window.api.importNflverseStats();
    markStep('Building player career histories...', true);

    markStep('Finalizing dynasty setup...', false);
    await window.api.balanceRosters();
    await new Promise(r => setTimeout(r, 600));
    markStep('Finalizing dynasty setup...', true);

    setSetupComplete(true);
    setTimeout(() => setScreen('game'), 1200);
  };

  const handleDifficultyChange = async (level: 'easy' | 'normal' | 'hard') => {
    setDifficulty(level);
    await window.api.setDifficulty(level);
  };

  const handleTeamSelect = async (team: UserTeam) => {
    setUserTeam(team);
    setScreen('setup');
    setSetupSteps([]);
    setSetupComplete(false);
    // New dynasty — flush all mounted tab state so they start fresh
    setMountedTabs(new Set(['home']));
    setActiveTab('home');
    await window.api.resetSave();
    await window.api.setUserTeam(team.id);
    runSetup();
  };

  function handleSeasonAdvance(nextSeason: number) {
    // Components stay mounted — they self-update via their currentSeason useEffect deps
    advanceSeason(nextSeason);
    setActiveTab('home');
  }

  const tabs = playoffsComplete
    ? [...BASE_TABS.filter(t => t.id !== 'news'), { id: 'draft' as Tab, label: '⚡ Draft' }, { id: 'news' as Tab, label: '📰 News' }]
    : BASE_TABS;

  // Helpers for the keep-alive pattern
  const isMounted  = (id: Tab) => mountedTabs.has(id);
  const tabStyle   = (id: Tab): React.CSSProperties =>
    activeTab === id ? {} : { display: 'none' };

  // ── Start Screen ──────────────────────────────────────────────────────────
  if (screen === 'start') {
    return (
      <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 4, marginBottom: 8 }}>PRESENTED BY</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: '#4FC3F7', fontFamily: 'monospace', letterSpacing: -2 }}>NFL</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.textPrimary, fontFamily: 'monospace', letterSpacing: 4 }}>SIMULATOR</div>
        <div style={{ fontSize: 11, color: '#FF8740', letterSpacing: 6, marginBottom: 32 }}>DYNASTY MODE</div>
        <button
          onClick={() => setScreen('team-select')}
          style={{ padding: '16px 24px', fontSize: 13, fontWeight: 'bold', letterSpacing: 3, background: '#4caf50', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace' }}
        >
          NEW DYNASTY
        </button>
        <button
          onClick={() => { if (hasSave) setScreen('game'); }}
          style={{ padding: '16px 24px', fontSize: 13, fontWeight: 'bold', letterSpacing: 3, background: 'transparent', color: hasSave ? T.textMuted : T.borderFaint, border: `1px solid ${hasSave ? T.borderStrong : T.bgCard}`, borderRadius: 4, cursor: hasSave ? 'pointer' : 'default', fontFamily: 'monospace' }}
        >
          {hasSave ? 'CONTINUE' : 'NO SAVED DYNASTY'}
        </button>
      </div>
    );
  }

  // ── Team Selection ────────────────────────────────────────────────────────
  if (screen === 'team-select') {
    return (
      <Suspense fallback={<TabFallback />}>
        <TeamSelection onSelect={handleTeamSelect} />
      </Suspense>
    );
  }

  // ── Setup Screen ──────────────────────────────────────────────────────────
  if (screen === 'setup') {
    return (
      <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#4FC3F7', fontFamily: 'monospace', marginBottom: 4 }}>NFL SIMULATOR</div>
        {userTeam && (
          <div style={{ fontSize: 13, color: T.textDim, marginBottom: 32 }}>
            {userTeam.city} {userTeam.name}
          </div>
        )}
        <div style={{ background: T.bgPanel, border: `1px solid ${T.borderMid}`, borderRadius: 8, padding: '32px 40px', minWidth: 380 }}>
          <div style={{ fontSize: 10, color: T.textDim, letterSpacing: 3, marginBottom: 20 }}>SETTING UP YOUR DYNASTY</div>
          {setupSteps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ color: step.done ? '#4caf50' : '#FF8740', fontFamily: 'monospace', fontSize: 14 }}>
                {step.done ? '✓' : '…'}
              </span>
              <span style={{ fontSize: 12, color: step.done ? T.textPrimary : T.textDim }}>{step.label}</span>
            </div>
          ))}
          <div style={{ marginTop: 20, fontSize: 11, color: setupComplete ? '#4caf50' : T.textDim, fontFamily: 'monospace', letterSpacing: 2 }}>
            {setupComplete ? 'DYNASTY READY — LOADING...' : 'PLEASE WAIT'}
          </div>
        </div>
      </div>
    );
  }

  // ── Loading / no user ─────────────────────────────────────────────────────
  if (screen === 'loading' || !userTeam) {
    return (
      <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim, fontFamily: 'monospace', fontSize: 13, letterSpacing: 3 }}>
        LOADING...
      </div>
    );
  }

  // ── Main Game ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: T.bgPanel, borderBottom: `1px solid ${T.borderFaint}` }}>
        <span style={{ fontSize: 14, fontWeight: 900, color: '#4FC3F7', fontFamily: 'monospace' }}>NFL</span>
        <span style={{ color: T.borderFaint }}>|</span>
        <span style={{ fontSize: 12, color: T.textMuted, fontFamily: 'monospace' }}>{userTeam.city} {userTeam.name}</span>
        <button
          onClick={async () => {
            if (window.confirm('Start a new dynasty? This will wipe all current progress.')) {
              await window.api.resetSave();
              setUserTeam(null);
              setHasSave(false);
              setSetupSteps([]);
              setSetupComplete(false);
              setMountedTabs(new Set(['home']));
              setScreen('start');
            }
          }}
          style={{ fontSize: 10, color: T.borderStrong, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          new dynasty
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: T.textDim, letterSpacing: 1 }}>DIFFICULTY</span>
          {(['easy', 'normal', 'hard'] as const).map(d => (
            <button key={d} onClick={() => handleDifficultyChange(d)} style={{
              padding: '3px 8px', fontSize: 9, fontFamily: 'monospace',
              background: difficulty === d ? (d === 'easy' ? '#1a3a1a' : d === 'hard' ? '#3a1a1a' : '#1a1a2a') : 'none',
              color: difficulty === d ? (d === 'easy' ? '#4caf50' : d === 'hard' ? '#e57373' : '#4FC3F7') : T.textDim,
              border: `1px solid ${difficulty === d ? (d === 'easy' ? '#4caf50' : d === 'hard' ? '#e57373' : '#4FC3F7') : T.borderFaint}`,
              borderRadius: 3, cursor: 'pointer', textTransform: 'uppercase',
            }}>
              {d}
            </button>
          ))}
          <span style={{ fontSize: 11, color: T.textDim, marginLeft: 8, fontFamily: 'monospace' }}>{currentSeason}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', overflowX: 'auto', background: T.bgPanel, borderBottom: `1px solid ${T.borderFaint}` }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => handleTabChange(tab.id)} style={{
            padding: '11px 22px', background: 'none', border: 'none', cursor: 'pointer',
            color: activeTab === tab.id ? '#4FC3F7' : tab.id === 'draft' ? '#FF8740' : T.textMuted,
            borderBottom: activeTab === tab.id ? '2px solid #4FC3F7' : '2px solid transparent',
            fontWeight: activeTab === tab.id ? 'bold' : 'normal',
            fontSize: 13, whiteSpace: 'nowrap', fontFamily: 'monospace',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content — each tab mounts once on first visit, then stays mounted hidden */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Suspense fallback={<TabFallback />}>

          {isMounted('home') && (
            <div style={tabStyle('home')}>
              <Home
                onNavigate={tab => handleTabChange(tab as Tab)}
                onSeasonAdvance={handleSeasonAdvance}
              />
            </div>
          )}

          {isMounted('standings') && (
            <div style={tabStyle('standings')}>
              <Standings />
            </div>
          )}

          {isMounted('teams') && (
            <div style={tabStyle('teams')}>
              <Teams />
            </div>
          )}

          {isMounted('schedule') && (
            <div style={tabStyle('schedule')}>
              <Schedule />
            </div>
          )}

          {isMounted('stats') && (
            <div style={tabStyle('stats')}>
              <Stats />
            </div>
          )}

          {isMounted('records') && (
            <div style={tabStyle('records')}>
              <Records />
            </div>
          )}

          {isMounted('playoffs') && (
            <div style={tabStyle('playoffs')}>
              <Playoffs />
            </div>
          )}

          {isMounted('trades') && (
            <div style={tabStyle('trades')}>
              <Trades />
            </div>
          )}

          {isMounted('franchise') && (
            <div style={tabStyle('franchise')}>
              <Franchise />
            </div>
          )}

          {isMounted('depth') && (
            <div style={tabStyle('depth')}>
              <DepthChart />
            </div>
          )}

          {isMounted('news') && (
            <div style={tabStyle('news')}>
              <NewsFeed />
            </div>
          )}

          {isMounted('draft') && (
            <div style={tabStyle('draft')}>
              <Draft onDraftComplete={() => handleTabChange('home')} />
            </div>
          )}

        </Suspense>
      </div>

    </div>
  );
}
