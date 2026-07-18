import { useState } from 'react';
import { VideoScrubber } from './components/VideoScrubber';
import { ValidationPanel } from './components/ValidationPanel';
import './App.css';

type Tab = 'analyzer' | 'validation';

function App() {
  const [tab, setTab] = useState<Tab>('analyzer');

  return (
    <main className="app">
      <header className="app__header">
        <h1>Vertical Jump Analyzer</h1>
        <p className="app__subtitle">
          Dev build — load a clip, run pose + takeoff/landing detection, and get a flight-time
          jump height. Use Validation to check computed heights against measured ground truth.
        </p>
        <nav className="app__tabs">
          <button className={tab === 'analyzer' ? 'active' : ''} onClick={() => setTab('analyzer')}>
            Analyzer
          </button>
          <button className={tab === 'validation' ? 'active' : ''} onClick={() => setTab('validation')}>
            Validation
          </button>
        </nav>
      </header>
      {tab === 'analyzer' ? <VideoScrubber /> : <ValidationPanel />}
    </main>
  );
}

export default App;
