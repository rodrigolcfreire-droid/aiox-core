import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TestDashboard from './pages/TestDashboard';
import DomainDetail from './pages/DomainDetail';
import AgentPanel from './pages/AgentPanel';
import AgentDetail from './pages/AgentDetail';
import IntelligenceDashboard from './pages/IntelligenceDashboard';
import AudiovisualDashboard from './pages/AudiovisualDashboard';
import { SentinelDashboard } from './components/sentinel';
import Header from './components/shared/Header';
import './styles/App.css';

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/test" element={<TestDashboard />} />
          <Route path="/domain/:domainId" element={<DomainDetail />} />
          <Route path="/agents" element={<AgentPanel />} />
          <Route path="/agents/:agentId" element={<AgentDetail />} />
          <Route path="/intelligence" element={<IntelligenceDashboard />} />
          <Route path="/audiovisual" element={<AudiovisualDashboard />} />
          <Route path="/sentinel" element={<SentinelDashboard />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
