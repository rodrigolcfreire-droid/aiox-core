import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="header-logo">
          <span className="logo-icon">+</span>
          <span className="logo-text">AIOX Health</span>
        </Link>
        <nav className="header-nav">
          <Link to="/" className="nav-link">Dashboard</Link>
          <Link to="/agents" className="nav-link">Agentes</Link>
          <Link to="/intelligence" className="nav-link" style={{ color: '#38bdf8' }}>Intelligence</Link>
          <Link to="/sentinel" className="nav-link">Sentinel</Link>
          <Link to="/test" className="nav-link" style={{ color: '#D946EF' }}>Test UX</Link>
        </nav>
      </div>
    </header>
  );
}

export default Header;
