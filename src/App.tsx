import { VideoScrubber } from './components/VideoScrubber';
import './App.css';

function App() {
  return (
    <main className="app">
      <header className="app__header">
        <h1>Vertical Jump Analyzer</h1>
        <p className="app__subtitle">
          Dev frame scrubber (Milestone 1) — load a clip, step frame-by-frame with ← / →, and read
          the true per-frame timestamps the height calculation will depend on.
        </p>
      </header>
      <VideoScrubber />
    </main>
  );
}

export default App;
