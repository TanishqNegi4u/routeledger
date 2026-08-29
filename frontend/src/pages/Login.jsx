import { useState } from 'react';
import { Link, navigate, useLocation } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { Field, SubmitButton } from '../components/ui.jsx';
import styles from './Auth.module.css';

const DEMO = [
  { label: 'Owner', email: 'owner@amrutdairy.in', note: 'Everything' },
  { label: 'Manager', email: 'meera@amrutdairy.in', note: 'No billing settings' },
  { label: 'Agent', email: 'ravi@amrutdairy.in', note: 'Doorstep round only' },
];

const DEMO_PASSWORD = 'Demo@12345';

export default function Login() {
  const { login } = useAuth();
  const { query } = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setFailure(null);
    setBusy(true);
    try {
      const session = await login(email, password);
      toast.success(`Welcome back, ${session.user.name.split(' ')[0]}.`);
      const target = query.next || (session.user.role === 'AGENT' ? '/app/my-round' : '/app');
      navigate(target, { replace: true });
    } catch (error) {
      setFailure(error.message || 'Those details did not work.');
    } finally {
      setBusy(false);
    }
  };

  const useDemo = (demoEmail) => {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setFailure(null);
  };

  return (
    <div className={styles.wrap}>
      <section className={styles.panel}>
        <div className={styles.inner}>
          <Link to="/" className={styles.brand}>
            <span className={styles.mark} aria-hidden="true">
              RL
            </span>
            <span className={styles.brandName}>RouteLedger</span>
          </Link>

          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.sub}>
            The round, the book and the money — one screen before the first delivery.
          </p>

          {query.expired ? (
            <p className={styles.notice} style={{ marginTop: 'var(--s-5)' }}>
              Your session timed out for safety. Sign in to pick up where you left off.
            </p>
          ) : null}

          <form className={styles.form} onSubmit={submit} noValidate>
            {failure ? (
              <p className={styles.alert} role="alert">
                {failure}
              </p>
            ) : null}

            <Field label="Work email" htmlFor="email">
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="owner@amrutdairy.in"
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </Field>

            <SubmitButton busy={busy} className="btn btn-primary btn-lg btn-block">
              Sign in
            </SubmitButton>
          </form>

          <p className={styles.swap}>
            New round? <Link to="/register">Create a free workspace</Link>
          </p>

          <div className={styles.demo}>
            <div className={styles.demoHead}>Demo tenant — tap a role to fill the form</div>
            {DEMO.map((account) => (
              <div className={styles.demoRow} key={account.email}>
                <span>
                  <b>{account.label}</b>
                  <span className="hint" style={{ display: 'block' }}>
                    {account.note}
                  </span>
                </span>
                <button type="button" className="btn btn-sm" onClick={() => useDemo(account.email)}>
                  Use
                </button>
              </div>
            ))}
            <p className="hint" style={{ marginTop: 'var(--s-3)' }}>
              Password for every demo account: <span className="mono">{DEMO_PASSWORD}</span>
            </p>
          </div>
        </div>
      </section>

      <aside className={styles.proof}>
        <span className={styles.proofKicker}>Why operators switch</span>
        <h2 className={styles.proofTitle}>A delivery round is a graph problem, not a WhatsApp group.</h2>
        <div className={styles.proofList}>
          <div className={styles.proofItem}>
            <span className={styles.proofNum}>1</span>
            <span className={styles.proofText}>
              <b>The round sequences itself.</b> Every morning each beat is re-ordered from the depot with
              a nearest-neighbour tour improved by 2-opt, so a new customer never breaks the route.
            </span>
          </div>
          <div className={styles.proofItem}>
            <span className={styles.proofNum}>2</span>
            <span className={styles.proofText}>
              <b>Pauses stop leaking money.</b> Vacation windows live in an interval tree, so a paused
              household is skipped on the sheet and never billed for milk it did not take.
            </span>
          </div>
          <div className={styles.proofItem}>
            <span className={styles.proofNum}>3</span>
            <span className={styles.proofText}>
              <b>Dues are ranked, not listed.</b> A max-heap over amount, age and reachability puts the
              money most likely to be lost at the top of the collections queue.
            </span>
          </div>
        </div>
        <div className={styles.stat}>
          <span>
            <span className={styles.statValue}>11–18%</span>
            <span className={styles.statLabel} style={{ display: 'block' }}>
              Typical distance saved
            </span>
          </span>
          <span>
            <span className={styles.statValue}>4 min</span>
            <span className={styles.statLabel} style={{ display: 'block' }}>
              Month-end billing
            </span>
          </span>
          <span>
            <span className={styles.statValue}>0</span>
            <span className={styles.statLabel} style={{ display: 'block' }}>
              Notebooks needed
            </span>
          </span>
        </div>
      </aside>
    </div>
  );
}
