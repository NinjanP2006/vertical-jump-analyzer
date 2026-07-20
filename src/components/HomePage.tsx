import { Link } from 'react-router-dom';
import './HomePage.css';

export function HomePage() {
  return (
    <div className="home">
      <section className="home__hero">
        <h1 className="home__title">Know your vertical.</h1>
        <p className="home__tagline">
          Film a jump, get your vertical in centimetres. No jump mat, no measuring tape, no
          equipment — just your phone.
        </p>

        <div className="home__cta">
          <Link className="home__primary" to="/analyze">
            Analyze my jump
          </Link>
        </div>
      </section>

      <section className="home__points">
        <div className="home__point">
          <h2>Measured from hang time</h2>
          <p>
            Your height comes from how long you&apos;re in the air, using <code>h = g·t²/8</code>.
            No reference object or calibration needed in the shot.
          </p>
        </div>
        <div className="home__point">
          <h2>Your video stays yours</h2>
          <p>
            Everything runs on your device. Your clip is never uploaded to a server — there
            isn&apos;t one.
          </p>
        </div>
        <div className="home__point">
          <h2>See where the number came from</h2>
          <p>
            Jump straight to the detected takeoff and landing frames, so you can check the
            measurement rather than just trust it.
          </p>
        </div>
      </section>

      <section className="home__how">
        <h2 className="home__howtitle">How to film it</h2>
        <ol className="home__steps">
          <li>
            <strong>Side-on, whole body in frame</strong> — feet included, through the entire jump.
          </li>
          <li>
            <strong>60 fps, normal video</strong> — not slow-motion. Frame rate is what drives
            accuracy.
          </li>
          <li>
            <strong>Steady camera, landscape</strong> — prop your phone up or have someone hold it.
          </li>
        </ol>
        <Link className="home__inline" to="/analyze">
          Get started →
        </Link>
      </section>
    </div>
  );
}
