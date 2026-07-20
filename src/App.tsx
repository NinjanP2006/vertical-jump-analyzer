import { useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from './components/HomePage';
import { JumpAnalyzer } from './components/JumpAnalyzer';
import { VideoScrubber } from './components/VideoScrubber';
import { ValidationPanel } from './components/ValidationPanel';
import './App.css';

function AppHeader() {
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  // Accounts are out of scope for this MVP, so this is an honest placeholder rather than a
  // fake login form.
  const [showAuthNote, setShowAuthNote] = useState(false);

  return (
    <header className="app__header">
      <div className="app__bar">
        <Link className="app__brand" to="/">
          Vertical Jump Analyzer
        </Link>
        <button className="app__login" onClick={() => setShowAuthNote((v) => !v)}>
          Log in / Sign up
        </button>

        {/* Dropdown rather than inline, so opening it doesn't reflow the page below. */}
        {showAuthNote && (
          <p className="app__authnote" role="status">
            Accounts aren&apos;t built yet — they&apos;re coming with saved jump history so you can
            track progress over time. You can measure your jump right now without one.
          </p>
        )}
      </div>

      {!onHome && (
        <nav className="app__tabs">
          <NavLink to="/analyze" className={({ isActive }) => (isActive ? 'active' : '')}>
            Analyze
          </NavLink>
          <NavLink to="/dev" className={({ isActive }) => (isActive ? 'active' : '')}>
            Dev scrubber
          </NavLink>
          <NavLink to="/validation" className={({ isActive }) => (isActive ? 'active' : '')}>
            Validation
          </NavLink>
        </nav>
      )}
    </header>
  );
}

function NotFound() {
  return (
    <div className="app__notfound">
      <h2>Page not found</h2>
      <Link to="/">Back to home</Link>
    </div>
  );
}

function App() {
  return (
    <>
      <AppHeader />
      <main className="app">
        <div className="app__content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/analyze" element={<JumpAnalyzer />} />
            <Route path="/dev" element={<VideoScrubber />} />
            <Route path="/validation" element={<ValidationPanel />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
    </>
  );
}

export default App;
