import React, { useState, useEffect } from 'react';
import Home from './Home';
import Standings from './Standings';
import Teams from './Teams';
import Schedule from './Schedule';
import Stats from './Stats';
import Playoffs from './Playoffs';
import TeamSelection from './TeamSelection';

declare const window: any;

type Tab = 'home' | 'standings' | 'teams' | 'schedule' | 'stats' | 'playoffs';

interface UserTeam {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'standings', label: 'Standings' },
  { id: 'teams', label: 'Teams' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'stats', label: 'Stats' },
  { id: 'playoffs', label: 'Playoffs' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [playoffData, setPlayoffData] = useState(null);
  const [currentSeason, setCurrentSeason] = useState<number>(2025);
  const [userTeam, setUserTeam] = useState<UserTeam | null | undefined>(undefined);

  useEffect(() => {
    Promise.all([
      window.api.getCurrentSeason(),
      window.api.getUserTeam(),
    ]).then(([season, team]: [number, UserTeam | null]) => {
      setCurrentSeason(season);
      setUserTeam(team);
    });
  }, []);

  const handleSeasonAdvance = (nextSeason: number) => {
    setCurrentSeason(nextSeason);
    setPlayoffData(null);
    setActiveTab('home');
  };

  // Loading
  if (userTeam === undefined) {
    return (
      <div style={{
        background: '#080808', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#222', fontFamily: 'sans-serif', fontSize: 14,
      }}>
        Loading...
      </div>
    );
  }

  // First launch — no team selected
  if (userTeam === null) {
    return <TeamSelection onSelect={(team) => setUserTeam(team)} />;
  }

  return (
    <div style={{ background: '#0d0d0d', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>

      {/* App Header */}
      <div style={{
        background: '#0f0f0f', borderBottom: '1px solid #1a1a1a',
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 'bold', color: '#4FC3F7', letterSpacing: 1 }}>
            NFL SIMULATOR
          </div>
          <div style={{ fontSize: 12, color: '#2a2a2a' }}>|</div>
          <div style={{ fontSize: 13, color: '#FF8740', fontWeight: 'bold' }}>
            {userTeam.city} {userTeam.name}
          </div>
          <button
            onClick={() => setUserTeam(null)}
            style={{
              fontSize: 10, color: '#333', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
            }}
          >
            change
          </button>
        </div>
        <div style={{ fontSize: 12, color: '#333' }}>
          {currentSeason} Season
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ background: '#0f0f0f', borderBottom: '1px solid #161616', display: 'flex', paddingLeft: 8 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '11px 22px', background: 'none', border: 'none',
              cursor: 'pointer',
              color: activeTab === tab.id ? '#4FC3F7' : '#555',
              borderBottom: activeTab === tab.id ? '2px solid #4FC3F7' : '2px solid transparent',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              fontSize: 13, transition: 'color 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'home' && (
          <Home
            currentSeason={currentSeason}
            onSeasonAdvance={handleSeasonAdvance}
            userTeam={userTeam}
          />
        )}
        {activeTab === 'standings' && <Standings currentSeason={currentSeason} />}
        {activeTab === 'teams' && <Teams />}
        {activeTab === 'schedule' && <Schedule currentSeason={currentSeason} />}
        {activeTab === 'stats' && <Stats currentSeason={currentSeason} />}
        {activeTab === 'playoffs' && (
          <Playoffs data={playoffData} setData={setPlayoffData} currentSeason={currentSeason} />
        )}
      </div>
    </div>
  );
}