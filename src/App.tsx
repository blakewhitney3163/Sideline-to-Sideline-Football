import React, { useState, useEffect } from 'react';
import Home from './Home';
import Standings from './Standings';
import Teams from './Teams';
import Schedule from './Schedule';
import Stats from './Stats';
import Playoffs from './Playoffs';
import TeamSelection from './TeamSelection';
import Trades from './Trades';
import Franchise from './Franchise';
import Draft from './Draft';
import DepthChart from './DepthChart';
import Records from './Records';
import NewsFeed from './newsCenter/NewsFeed';
import { T } from './theme';

declare const window: any;

type Tab = 'home' | 'standings' | 'teams' | 'schedule' | 'stats' | 'playoffs' | 'trades' | 'franchise' | 'draft' | 'depth' | 'records' | 'news';
type Screen = 'loading' | 'start' | 'team-select' | 'setup' | 'game';

interface UserTeam {
  id: number; city: string; name: string;
  abbreviation: string; conference: string; division: string;
}

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

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [currentSeason, setCurrentSeason] = useState(2025);
  const [userTeam, setUserTeam] = useState<UserTeam | null>(null);
  const [playoffsComplete, setPlayoffsComplete] = useState(false);
  const [playoffData, setPlayoffData] = useState<any>(null);
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([]);
  const [setupComplete, setSetupComplete] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [difficulty, setDifficultyState] = useState<'easy' | 'normal' | 'hard'>('normal');

  useEffect(() => {
    window.api.getDifficulty().then((d: string) => setDifficultyState(d as any));
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
    setDifficultyState(level);
    await window.api.setDifficulty(level);
  };

  const handleTeamSelect = async (team: UserTeam) => {
    setUserTeam(team);
    setScreen('setup');
    setSetupSteps([]);
    setSetupComplete(false);
    await window.api.resetSave();
    await window.api.setUserTeam(team.id);
    runSetup();
  };

  const tabs = playoffsComplete
    ? [...BASE_TABS.filter(t => t.id !== 'news'), { id: 'draft' as Tab, label: '⚡ Draft' }, { id: 'news' as Tab, label: '📰 News' }]
    : BASE_TABS;

  // ── Start Screen ──────────────────────────────────────────────────────────
  if (screen === 'start') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bgPage, gap: 32 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 4, marginBottom: 8 }}>PRESENTED BY</div>
          <div style={{ color: '#4FC3F7', fontSize: 48, fontWeight: 900, letterSpacing: 6, fontFamily: 'monospace' }}>NFL</div>
          <div style={{ color: T.textPrimary, fontSize: 18, letterSpacing: 8, fontFamily: 'monospace' }}>SIMULATOR</div>
          <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 3, marginTop: 8 }}>DYNASTY MODE</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <button
            onClick={() => setScreen('team-select')}
            style={{
              padding: '16px 24px', fontSize: 13, fontWeight: 'bold', letterSpacing: 3,
              background: '#4caf50', color: '#000', border: 'none', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'monospace',
            }}
          >
            NEW DYNASTY
          </button>
          <button
            onClick={() => { if (hasSave) setScreen('game'); }}
            style={{
              padding: '16px 24px', fontSize: 13, fontWeight: 'bold', letterSpacing: 3,
              background: 'transparent',
              color: hasSave ? T.textMuted : T.borderFaint,
              border: `1px solid ${hasSave ? T.borderStrong : T.bgCard}`,
              borderRadius: 4, cursor: hasSave ? 'pointer' : 'default',
              fontFamily: 'monospace',
            }}
          >
            {hasSave ? 'CONTINUE' : 'NO SAVED DYNASTY'}
          </button>
        </div>
      </div>
    );
  }

  // ── Team Selection ────────────────────────────────────────────────────────
  if (screen === 'team-select') {
    return <TeamSelection onSelect={handleTeamSelect} />;
  }

  // ── Setup Screen ──────────────────────────────────────────────────────────
  if (screen === 'setup') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bgPage, gap: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#4FC3F7', fontSize: 24, fontWeight: 900, letterSpacing: 4, fontFamily: 'monospace' }}>NFL SIMULATOR</div>
          {userTeam && (
            <div style={{ color: T.textMuted, fontSize: 13, marginTop: 6 }}>
              {userTeam.city} {userTeam.name}
            </div>
          )}
        </div>

        <div style={{ background: T.bgCard, border: `1px solid ${T.borderFaint}`, borderRadius: 8, padding: '24px 32px', minWidth: 340 }}>
          <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 2, fontWeight: 700, marginBottom: 16 }}>SETTING UP YOUR DYNASTY</div>
          {setupSteps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ color: step.done ? '#4caf50' : '#FF8740', fontWeight: 700, fontSize: 14, width: 16 }}>
                {step.done ? '✓' : '…'}
              </span>
              <span style={{ color: step.done ? T.textMuted : T.textPrimary, fontSize: 12 }}>{step.label}</span>
            </div>
          ))}
        </div>

        {setupComplete ? (
          <div style={{ color: '#4caf50', fontSize: 12, letterSpacing: 2 }}>DYNASTY READY — LOADING...</div>
        ) : (
          <div style={{ color: T.textDim, fontSize: 10, letterSpacing: 2 }}>PLEASE WAIT</div>
        )}
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (screen === 'loading' || !userTeam) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bgPage, color: T.textDim, fontSize: 12, letterSpacing: 3 }}>
        LOADING...
      </div>
    );
  }

  // ── Main Game ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: T.bgPage, overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: `1px solid ${T.borderFaint}`, background: T.bgPanel, flexShrink: 0, gap: 12 }}>
        <span style={{ color: '#4FC3F7', fontWeight: 900, fontSize: 14, letterSpacing: 3, fontFamily: 'monospace' }}>NFL</span>
        <span style={{ color: T.borderFaint }}>|</span>
        <span style={{ color: T.textMuted, fontSize: 12 }}>{userTeam.city} {userTeam.name}</span>
        <button
          onClick={async () => {
            if (window.confirm('Start a new dynasty? This will wipe all current progress.')) {
              await window.api.resetSave();
              setUserTeam(null);
              setHasSave(false);
              setSetupSteps([]);
              setSetupComplete(false);
              setScreen('start');
            }
          }}
          style={{ fontSize: 10, color: T.borderStrong, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          new dynasty
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: T.textDim, fontSize: 9, letterSpacing: 1 }}>DIFFICULTY</span>
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
          <span style={{ color: T.textDim, fontSize: 11, marginLeft: 8 }}>{currentSeason}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.borderFaint}`, background: T.bgPanel, flexShrink: 0, overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
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

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'home' && (
          <Home
            userTeam={userTeam}
            currentSeason={currentSeason}
            onTabChange={(tab) => setActiveTab(tab as Tab)}
            onSeasonAdvance={handleSeasonAdvance}
            onPlayoffsComplete={() => setPlayoffsComplete(true)}
          />
        )}
        {activeTab === 'standings' && <Standings currentSeason={currentSeason} />}
        {activeTab === 'teams'     && <Teams />}
        {activeTab === 'schedule'  && <Schedule currentSeason={currentSeason} />}
        {activeTab === 'stats'     && <Stats currentSeason={currentSeason} />}
        {activeTab === 'records'   && <Records />}
        {activeTab === 'playoffs'  && (
          <Playoffs currentSeason={currentSeason} onChampionCrowned={() => setPlayoffsComplete(true)} />
        )}
        {activeTab === 'trades'    && <Trades userTeam={userTeam} currentSeason={currentSeason} />}
        {activeTab === 'franchise' && (
          <Franchise userTeam={userTeam} currentSeason={currentSeason} onNavigate={(tab) => setActiveTab(tab as Tab)} />
        )}
        {activeTab === 'depth'     && <DepthChart userTeam={userTeam} />}
        {activeTab === 'news'      && <NewsFeed />}
        {activeTab === 'draft'     && (
          <Draft
            userTeam={userTeam}
            currentSeason={currentSeason}
            onDraftComplete={() => setActiveTab('home')}
          />
        )}
      </div>
    </div>
  );

  function handleSeasonAdvance(nextSeason: number) {
    setCurrentSeason(nextSeason);
    setPlayoffsComplete(false);
    setPlayoffData(null);
    setActiveTab('home');
  }
}
