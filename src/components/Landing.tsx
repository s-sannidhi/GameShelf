import { useRef } from 'react';
import { motion } from 'framer-motion';
import { LoginRegister } from './LoginRegister';

const FEATURES = [
  {
    title: 'One library',
    description: 'See all your games in a single shelf—Steam, PlayStation, and manually added titles in one place.',
  },
  {
    title: 'Auto-sync',
    description: 'Connect your Steam and PlayStation accounts in Profile. Your library stays up to date every time you open the app.',
  },
  {
    title: 'Track progress',
    description: 'Log completion dates, playtime, ratings, and notes. Filter by completed, in progress, or backlog.',
  },
  {
    title: 'Compare with friends',
    description: 'Add friends and see which games you both own. Plan co-op or swap recommendations.',
  },
  {
    title: 'Rich metadata',
    description: 'Box art and descriptions pulled from IGDB and RAWG. Search and apply better covers to any game in your library.',
  },
  {
    title: 'Your data',
    description: 'Your library lives in your account. No ads, no selling data—just a clean place to track what you play.',
  },
];

const STEPS = [
  { step: 1, title: 'Connect', text: 'Link your Steam and PlayStation accounts in Profile. We only store what we need for sync.' },
  { step: 2, title: 'Sync', text: 'Your libraries merge into one shelf. New games appear automatically when you open the app.' },
  { step: 3, title: 'Track & share', text: 'Mark completions, add notes, and compare with friends to see your shared games.' },
];

const HIGHLIGHTS = ['Steam & PlayStation sync', 'Box art from IGDB/RAWG', 'Completion dates & ratings', 'Friend library comparison', 'Free & no ads'];

export function Landing() {
  const authRef = useRef<HTMLDivElement>(null);

  const scrollToAuth = () => {
    authRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="landing-page">
      <header className="landing-hero">
        <motion.div
          className="landing-hero-inner"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <h1 className="landing-hero-title">Game Shelf</h1>
          <p className="landing-hero-tagline">
            Your games in one place. Track your library, sync from Steam and PlayStation, and compare with friends.
          </p>
          <p className="landing-hero-sub">
            Free to use. Your data stays yours.
          </p>
          <button type="button" className="landing-hero-cta btn-primary" onClick={scrollToAuth}>
            Get started
          </button>
        </motion.div>
      </header>

      <section className="landing-highlights" aria-label="Highlights">
        <div className="landing-highlights-inner">
          {HIGHLIGHTS.map((item, i) => (
            <span key={item} className="landing-highlight-pill">{item}</span>
          ))}
        </div>
      </section>

      <section className="landing-features" aria-label="Features">
        <div className="landing-features-inner">
          <h2 className="landing-features-title">What you can do</h2>
          <ul className="landing-features-list">
            {FEATURES.map((feature, i) => (
              <motion.li
                key={feature.title}
                className="landing-feature-item"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1 + i * 0.08 }}
              >
                <h3 className="landing-feature-title">{feature.title}</h3>
                <p className="landing-feature-desc">{feature.description}</p>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>

      <section className="landing-how" aria-label="How it works">
        <div className="landing-how-inner">
          <h2 className="landing-how-title">How it works</h2>
          <ol className="landing-steps">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.step}
                className="landing-step"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.15 + i * 0.1 }}
              >
                <span className="landing-step-num" aria-hidden>{s.step}</span>
                <div className="landing-step-body">
                  <h3 className="landing-step-title">{s.title}</h3>
                  <p className="landing-step-text">{s.text}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <section className="landing-cta-strip">
        <p className="landing-cta-strip-text">Ready to organize your library?</p>
        <button type="button" className="btn-primary landing-cta-strip-btn" onClick={scrollToAuth}>
          Sign in or register
        </button>
      </section>

      <section className="landing-auth" ref={authRef} aria-label="Sign in">
        <div className="landing-auth-inner">
          <h2 className="landing-auth-heading">Sign in or create an account</h2>
          <p className="landing-auth-sub">Log in to access your library, or register to get started.</p>
          <LoginRegister embedded />
        </div>
      </section>

      <footer className="landing-footer">
        <p className="landing-footer-text">Game Shelf — your personal game library</p>
      </footer>
    </div>
  );
}
