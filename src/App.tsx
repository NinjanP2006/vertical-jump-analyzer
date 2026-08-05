import { useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from './components/HomePage';
import { JumpAnalyzer } from './components/JumpAnalyzer';
import { HistoryPage } from './components/HistoryPage';
import { VideoScrubber } from './components/VideoScrubber';
import { ValidationPanel } from './components/ValidationPanel';
import { useAuth } from './auth/useAuth';
import './App.css';

function AuthControl() {
  const { user, loading, configured, login, logout } = useAuth();
  // When Cognito env isn't set, accounts are unavailable — show an honest placeholder note.
  const [showNote, setShowNote] = useState(false);

  if (!configured) {
    return (
      <>
        <button className="app__login" onClick={() => setShowNote((v) => !v)}>
          Log in / Sign up
        </button>
        {showNote && (
          <p className="app__authnote" role="status">
            Accounts aren&apos;t enabled in this build. You can measure your jump right now without
            one.
          </p>
        )}
      </>
    );
  }

  if (loading) return <span className="app__authloading">…</span>;

  if (user) {
    return (
      <div className="app__account">
        {user.email && <span className="app__email">{user.email}</span>}
        <button className="app__login" onClick={logout}>
          Log out
        </button>
      </div>
    );
  }

  return (
    <button className="app__login" onClick={login}>
      Log in / Sign up
    </button>
  );
}

function AppHeader() {
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const { user } = useAuth();

  return (
    <header className="app__header">
      <div className="app__bar">
        <Link className="app__brand" to="/">
          Vertical Jump Analyzer
        </Link>
        <AuthControl />
      </div>

      {!onHome && (
        <nav className="app__tabs">
          <NavLink to="/analyze" className={({ isActive }) => (isActive ? 'active' : '')}>
            Analyze
          </NavLink>
          {user && (
            <NavLink to="/history" className={({ isActive }) => (isActive ? 'active' : '')}>
              History
            </NavLink>
          )}
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
            <Route path="/history" element={<HistoryPage />} />
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
