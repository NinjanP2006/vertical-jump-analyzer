import { useState } from 'react';
import { JumpAnalyzer } from './components/JumpAnalyzer';
import { VideoScrubber } from './components/VideoScrubber';
import { ValidationPanel } from './components/ValidationPanel';
import './App.css';

type Tab = 'analyze' | 'dev' | 'validation';

function App() {
  const [tab, setTab] = useState<Tab>('analyze');

  return (
    <main className="app">
      <header className="app__header">
        <h1>Vertical Jump Analyzer</h1>
        <p className="app__subtitle">
          Upload a jump video and get your vertical, measured from time in the air.
        </p>
        <nav className="app__tabs">
          <button className={tab === 'analyze' ? 'active' : ''} onClick={() => setTab('analyze')}>
            Analyze
          </button>
          <button className={tab === 'dev' ? 'active' : ''} onClick={() => setTab('dev')}>
            Dev scrubber
          </button>
          <button className={tab === 'validation' ? 'active' : ''} onClick={() => setTab('validation')}>
            Validation
          </button>
        </nav>
      </header>
      {tab === 'analyze' && <JumpAnalyzer />}
      {tab === 'dev' && <VideoScrubber />}
      {tab === 'validation' && <ValidationPanel />}
    </main>
  );
}

export default App;
