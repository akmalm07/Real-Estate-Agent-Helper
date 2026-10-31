import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function HomePage() {
  const [imageUnavailable, setImageUnavailable] = useState(false);

  return (
    <div className="journal">
      <a className="journal-skip" href="#main-content">Skip to content</a>

      <header className="journal-masthead journal-container">
        <Link to="/" className="journal-wordmark" aria-label="RealCRM home">RealCRM</Link>
        <p className="journal-masthead-note">A workspace for real estate</p>
        <nav aria-label="Main navigation">
          <a href="#workspace">The workspace</a>
          <Link to="/login">Sign in <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="journal-container">
        <section className="journal-hero" aria-labelledby="home-title">
          <div className="journal-hero-copy">
            <p className="journal-eyebrow utility-label">Real estate, in context</p>
            <h1 id="home-title">Keep the people.<br />Keep the context.</h1>
            <p className="journal-deck">
              Behind every property is a conversation. Keep lead details, notes and
              property records together, so you can pick up where you left off.
            </p>
            <div className="journal-actions">
              <Link className="journal-primary-link" to="/login">
                Sign in to RealCRM <span aria-hidden="true">↗</span>
              </Link>
              <a className="journal-text-link" href="#workspace">
                Explore the workspace <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="journal-account-note">New here? Choose Sign Up on the sign-in page.</p>
          </div>

          <figure className="journal-figure">
            <p className="journal-folio font-mono">In perspective <span>Architecture</span></p>
            <div className="journal-photo-frame">
              {imageUnavailable ? (
                <div className="journal-photo-fallback">
                  <p className="journal-eyebrow">Architecture / Editorial</p>
                  <p>Room for a different perspective.</p>
                  <span>The photograph is unavailable. Your workspace is still a sign-in away.</span>
                </div>
              ) : (
                <img
                  src="/images/campus-north-mx-granger.webp"
                  alt="White residential campus buildings around a leafy courtyard beneath a blue sky."
                  width={1400}
                  height={1050}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  onError={() => setImageUnavailable(true)}
                />
              )}
            </div>
            <figcaption>
              <span>Campus North Residential Commons, University of Chicago.</span>
              <span>Mx. Granger / Wikimedia Commons / CC0.<br />Editorial photograph. Not a property listing. No affiliation or endorsement.</span>
            </figcaption>
          </figure>
        </section>

        <section id="workspace" className="journal-workspace" aria-labelledby="workspace-title">
          <div className="journal-introduction">
            <p className="journal-eyebrow utility-label">The workspace</p>
            <h2 id="workspace-title">A place for the details that matter.</h2>
            <p>
              Start with the dashboard for an overview, then move into the people,
              properties and conversations behind your day.
            </p>
            <Link to="/login" className="journal-text-link">
              Open your workspace <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <dl className="journal-workflow">
            <div>
              <dt>Know the person</dt>
              <dd>Keep contact information, lead details, status and notes in one record.</dd>
            </div>
            <div>
              <dt>Keep the property in view</dt>
              <dd>Review and manage property records alongside your lead work.</dd>
            </div>
            <div>
              <dt>Return to the conversation</dt>
              <dd>Read conversations and refer back to the details before your next reply.</dd>
            </div>
          </dl>
        </section>
      </main>

      <footer className="journal-footer journal-container">
        <p>RealCRM <span>People. Properties. Conversations.</span></p>
        <nav aria-label="Legal">
          <Link to="/terms">Terms of Service</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </nav>
      </footer>
    </div>
  );
}
