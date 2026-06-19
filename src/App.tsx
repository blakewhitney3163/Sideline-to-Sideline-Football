import React, { useState, useEffect, lazy, Suspense } from 'react';
import { T } from './theme';
import { useGameStore, UserTeam } from './store/gameStore';

declare const window: any;

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
const Import     = lazy(() => import('./Import'));
const TeamSelection = lazy(() => import('./TeamSelection'));
const SavePicker = lazy(() => import('./SavePicker'));

type Tab = 'home' | 'standings' | 'teams' | 'schedule' | 'stats' | 'playoffs' | 'trades' | 'franchise' | 'draft' | 'depth' | 'records' | 'news' | 'import';
type Screen = 'save-picker' | 'loading' | 'start' | 'team-select' | 'setup' | 'game';

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
  { id: 'import',    label: 'Import' },
];

function TabFallback() {
  return (
    <div style={{ color: '#4FC3F7', fontFamily: 'monospace', textAlign: 'center', paddingTop: 80 }}>
      Loading...
    </div>
  );
}

export default function App() {
  const [screen, setScreen]           = useState<Screen>('save-picker');
  const [activeTab, setActiveTab]     = useState<Tab>('home');
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

  const handleSaveLoaded = async () => {
    setScreen('loading');
    const [season, team, offseason, diff] = await Promise.all([
      window.api.getCurrentSeason(),
      window.api.getUserTeam(),
      window.api.getOffseasonStatus(),
      window.api.getDifficulty(),
    ]);
    setCurrentSeason(season);
    setPlayoffsComplete(offseason.playoffsComplete ?? false);
    setDifficulty(diff as any);
    if (!team) {
      setHasSave(false);
      setScreen('start');
    } else {
      setHasSave(true);
      setUserTeam(team);
      setScreen('game');
    }
  };

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
    markStep('Finalizing dynasty setup...', false);
    await window.api.balanceRosters();
    await new Promise(r => setTimeout(r, 800));
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
    setMountedTabs(new Set(['home']));
    setActiveTab('home');
    await window.api.resetSave();
    await window.api.setUserTeam(team.id);
    runSetup();
  };

  const handleSeasonAdvance = (nextSeason: number) => {
    advanceSeason(nextSeason);
    setActiveTab('home');
  };

  const tabs = playoffsComplete
    ? [...BASE_TABS.filter(t => t.id !== 'news' && t.id !== 'import'), { id: 'draft' as Tab, label: '⚡ Draft' }, { id: 'news' as Tab, label: '📰 News' }, { id: 'import' as Tab, label: 'Import' }]
    : BASE_TABS;

  const isMounted = (id: Tab) => mountedTabs.has(id);
  const tabStyle  = (id: Tab): React.CSSProperties => activeTab === id ? {} : { display: 'none' };

  // ── Save Picker ───────────────────────────────────────────────────────────
  if (screen === 'save-picker') {
    return (
      <Suspense fallback={<TabFallback />}>
        <SavePicker onSaveLoaded={handleSaveLoaded} />
      </Suspense>
    );
  }

  // ── Start Screen ──────────────────────────────────────────────────────────
  if (screen === 'start') {
    return (
      <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        <div style={{ marginBottom: 8, fontSize: 10, letterSpacing: 6, color: T.textDim }}>DYNASTY SIMULATOR</div>
        <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: 8, color: '#4FC3F7', marginBottom: 4 }}>GRIDIRON</div>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 4, color: T.textMuted, marginBottom: 48 }}>DYNASTY</div>
        <div style={{ fontSize: 11, letterSpacing: 3, color: T.textDim, marginBottom: 24 }}>FRANCHISE MODE</div>
        <button
          onClick={() => setScreen('team-select')}
          style={{ padding: '16px 24px', fontSize: 13, fontWeight: 'bold', letterSpacing: 3, background: '#4caf50', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', marginBottom: 12 }}
        >
          NEW DYNASTY
        </button>
        <button
          onClick={() => { if (hasSave) setScreen('game'); }}
          style={{ padding: '16px 24px', fontSize: 13, fontWeight: 'bold', letterSpacing: 3, background: 'transparent', color: hasSave ? T.textMuted : T.borderFaint, border: `1px solid ${hasSave ? T.borderStrong : T.bgCard}`, borderRadius: 4, cursor: hasSave ? 'pointer' : 'default', fontFamily: 'monospace', marginBottom: 20 }}
        >
          {hasSave ? 'CONTINUE' : 'NO SAVED DYNASTY'}
        </button>
        <button
          onClick={() => setScreen('save-picker')}
          style={{ fontSize: 10, color: T.textDim, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'monospace', letterSpacing: 1 }}
        >
          ← switch save file
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
      <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4, color: '#4FC3F7', marginBottom: 8 }}>GRIDIRON DYNASTY</div>
        {userTeam && (
          <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 32 }}>
            {userTeam.city} {userTeam.name}
          </div>
        )}
        <div style={{ fontSize: 10, letterSpacing: 3, color: T.textDim, marginBottom: 20 }}>SETTING UP YOUR DYNASTY</div>
        {setupSteps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, fontSize: 12, color: step.done ? '#4caf50' : T.textMuted }}>
            <span style={{ width: 16, textAlign: 'center' }}>{step.done ? '✓' : '…'}</span>
            <span>{step.label}</span>
          </div>
        ))}
        <div style={{ marginTop: 32, fontSize: 10, letterSpacing: 2, color: setupComplete ? '#4caf50' : T.textDim }}>
          {setupComplete ? 'DYNASTY READY — LOADING...' : 'PLEASE WAIT'}
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (screen === 'loading' || !userTeam) {
    return (
      <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4FC3F7', fontFamily: 'monospace', fontSize: 13, letterSpacing: 4 }}>
        LOADING...
      </div>
    );
  }

  // ── Main Game ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', flexDirection: 'column', fontFamily: 'monospace' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: `1px solid ${T.bgCard}`, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 4, color: '#4FC3F7' }}>GID</span>
        <span style={{ color: T.borderFaint }}>|</span>
        <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 'bold' }}>{userTeam.city} {userTeam.name}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
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
          <button
            onClick={() => setScreen('save-picker')}
            style={{ fontSize: 10, color: T.textDim, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            switch save
          </button>
          <span style={{ fontSize: 10, color: T.textDim, letterSpacing: 2 }}>DIFFICULTY</span>
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
          <span style={{ fontSize: 11, color: T.textDim, letterSpacing: 2 }}>{currentSeason}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.bgCard}`, overflowX: 'auto' }}>
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

      {/* Tab content — keep-alive pattern */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Suspense fallback={<TabFallback />}>

          {isMounted('home') && (
            <div style={tabStyle('home')}>
              <Home onTabChange={tab => handleTabChange(tab as Tab)} onSeasonAdvance={handleSeasonAdvance} />
            </div>
          )}
          {isMounted('standings') && (
            <div style={tabStyle('standings')}><Standings /></div>
          )}
          {isMounted('teams') && (
            <div style={tabStyle('teams')}><Teams /></div>
          )}
          {isMounted('schedule') && (
            <div style={tabStyle('schedule')}><Schedule /></div>
          )}
          {isMounted('stats') && (
            <div style={tabStyle('stats')}><Stats /></div>
          )}
          {isMounted('records') && (
            <div style={tabStyle('records')}><Records /></div>
          )}
          {isMounted('playoffs') && (
            <div style={tabStyle('playoffs')}><Playoffs /></div>
          )}
          {isMounted('trades') && (
            <div style={tabStyle('trades')}><Trades /></div>
          )}
          {isMounted('franchise') && (
            <div style={tabStyle('franchise')}><Franchise /></div>
          )}
          {isMounted('depth') && (
            <div style={tabStyle('depth')}><DepthChart /></div>
          )}
          {isMounted('news') && (
            <div style={tabStyle('news')}><NewsFeed /></div>
          )}
          {isMounted('import') && (
            <div style={tabStyle('import')}><Import /></div>
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
