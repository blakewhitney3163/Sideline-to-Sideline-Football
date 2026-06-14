import React, { useState } from 'react';
import Standings from './Standings';
import Teams from './Teams';
import Schedule from './Schedule';
import Home from './Home';
import Stats from './Stats';

type Tab = 'home' | 'standings' | 'teams' | 'schedule' |'stats' | 'playoffs';

const tabs: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'standings', label: 'Standings' },
  { id: 'teams', label: 'Teams' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'stats', label: 'Stats' },
  { id: 'playoffs', label: 'Playoffs' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('standings');

  return (
    <div style={{ fontFamily: 'Arial', background: '#1a1a2e', minHeight: '100vh', color: 'white' }}>
     
      {/* Header */}
      <div style={{ background: '#0f0f23', padding: '12px 20px', borderBottom: '2px solid #4FC3F7' }}>
        <h1 style={{ margin: 0, color: '#4FC3F7', fontSize: '20px', letterSpacing: '2px' }}>
          NFL SIMULATOR
        </h1>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', background: '#0f0f23', borderBottom: '1px solid #333' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 24px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeTab === tab.id ? '#4FC3F7' : '#aaa',
              borderBottom: activeTab === tab.id ? '2px solid #4FC3F7' : '2px solid transparent',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              fontSize: '14px',
              transition: 'color 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'home' && <Home />}
        {activeTab === 'standings' && <Standings />}
        {activeTab === 'teams' && <Teams />}
        {activeTab === 'schedule' && <Schedule />}
        {activeTab === 'stats' && <Stats />}
        {activeTab === 'playoffs' && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>
            <h2 style={{ color: '#4FC3F7' }}>Playoffs</h2>
            <p>Coming soon — playoff bracket and results.</p>
          </div>
        )}
      </div>
    </div>
  );
}