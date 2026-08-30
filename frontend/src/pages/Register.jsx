import { useState } from 'react';
import { Link, navigate } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { Field, SubmitButton } from '../components/ui.jsx';
import styles from './Auth.module.css';

const BLANK = {
  businessName: '',
  ownerName: '',
  city: '',
  phone: '',
  email: '',
  password: '',
};

/** Mirrors the server-side @Pattern so the operator is told before the round trip. */
const PHONE = /^[0-9+][0-9 -]{7,19}$/;

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [issues, setIssues] = useState({});

  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setIssues((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const validate = () => {
    const found = {};
    if (form.businessName.trim().length < 2) found.businessName = 'Give your round a name.';
    if (form.ownerName.trim().length < 2) found.ownerName = 'Who runs it?';
    if (!PHONE.test(form.phone.trim())) found.phone = 'Use 8-20 digits, e.g. 9822012345.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) found.email = 'That email looks incomplete.';
    if (form.password.length < 8) found.password = 'At least 8 characters.';
    setIssues(found);
    return Object.keys(found).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    setFailure(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const session = await register({
        businessName: form.businessName.trim(),
        ownerName: form.ownerName.trim(),
        city: form.city.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      toast.success(`${session.business.name} is live. Let's set up your first beat.`);
      navigate('/app/beats', { replace: true });
    } catch (error) {
      setFailure(error.message || 'That did not go through.');
      const fromServer = {};
      (error.fieldErrors || []).forEach((issue) => {
        fromServer[issue.field] = issue.message;
      });
      if (Object.keys(fromServer).length) setIssues(fromServer);
    } finally {
      setBusy(false);
    }
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

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 4,
              background: 'var(--surface-muted)',
              padding: 4,
              borderRadius: 'var(--r-md)',
              margin: 'var(--s-4) 0 var(--s-3)',
            }}
          >
            <div
              style={{
                padding: 'var(--s-2)',
                fontSize: '0.8125rem',
                fontWeight: 700,
                borderRadius: 'var(--r-sm)',
                background: 'var(--surface)',
                color: 'var(--text)',
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              🏪 Register Business / Owner
            </div>
            <Link
              to="/customer/register"
              style={{
                padding: 'var(--s-2)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                borderRadius: 'var(--r-sm)',
                color: 'var(--text-muted)',
                textAlign: 'center',
                textDecoration: 'none',
              }}
            >
              🍱 Register as Customer →
            </Link>
          </div>

          <h1 className={styles.title}>Start your round</h1>
          <p className={styles.sub}>
            Free for 14 days on the Trial plan. No card, no setup call — import customers as you go.
          </p>

          <form className={styles.form} onSubmit={submit} noValidate>
            {failure ? (
              <p className={styles.alert} role="alert">
                {failure}
              </p>
            ) : null}

            <Field label="Business name" htmlFor="businessName" error={issues.businessName}>
              <input
                id="businessName"
                className="input"
                value={form.businessName}
                onChange={set('businessName')}
                placeholder="Amrut Dairy & Daily Needs"
                aria-invalid={issues.businessName ? 'true' : undefined}
                required
              />
            </Field>

            <div className={styles.pair}>
              <Field label="Your name" htmlFor="ownerName" error={issues.ownerName}>
                <input
                  id="ownerName"
                  className="input"
                  value={form.ownerName}
                  onChange={set('ownerName')}
                  placeholder="Sudhir Kale"
                  autoComplete="name"
                  aria-invalid={issues.ownerName ? 'true' : undefined}
                  required
                />
              </Field>
              <Field label="City" htmlFor="city" hint="Optional">
                <input
                  id="city"
                  className="input"
                  value={form.city}
                  onChange={set('city')}
                  placeholder="Pune"
                />
              </Field>
            </div>

            <Field label="Phone" htmlFor="phone" error={issues.phone} hint="Customers see this on bills">
              <input
                id="phone"
                className="input"
                value={form.phone}
                onChange={set('phone')}
                placeholder="9822012345"
                inputMode="tel"
                autoComplete="tel"
                aria-invalid={issues.phone ? 'true' : undefined}
                required
              />
            </Field>

            <Field label="Work email" htmlFor="email" error={issues.email}>
              <input
                id="email"
                className="input"
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@yourdairy.in"
                autoComplete="username"
                inputMode="email"
                aria-invalid={issues.email ? 'true' : undefined}
                required
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              error={issues.password}
              hint="8 characters or more"
            >
              <input
                id="password"
                className="input"
                type="password"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                aria-invalid={issues.password ? 'true' : undefined}
                required
              />
            </Field>

            <SubmitButton busy={busy} className="btn btn-primary btn-lg btn-block">
              Create my workspace
            </SubmitButton>
          </form>

          <p className={styles.swap}>
            Already running? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>

      <aside className={styles.proof}>
        <span className={styles.proofKicker}>What you get on day one</span>
        <h2 className={styles.proofTitle}>Your first beat is sequenced within a minute of adding it.</h2>
        <div className={styles.proofList}>
          <div className={styles.proofItem}>
            <span className={styles.proofNum}>◈</span>
            <span className={styles.proofText}>
              <b>Add a depot and a handful of houses.</b> Drop rough coordinates or let the address stand
              in; the optimiser works with whatever you have.
            </span>
          </div>
          <div className={styles.proofItem}>
            <span className={styles.proofNum}>⌗</span>
            <span className={styles.proofText}>
              <b>Generate tomorrow.</b> One click plans every active beat, honours pause windows and hands
              each agent an ordered doorstep list on their phone.
            </span>
          </div>
          <div className={styles.proofItem}>
            <span className={styles.proofNum}>▤</span>
            <span className={styles.proofText}>
              <b>Bill from what was actually delivered.</b> Month-end invoices are built from the run
              sheet, not from the standing order, so credits stop being arguments.
            </span>
          </div>
        </div>
        <div className={styles.stat}>
          <span>
            <span className={styles.statValue}>14 days</span>
            <span className={styles.statLabel} style={{ display: 'block' }}>
              Free trial
            </span>
          </span>
          <span>
            <span className={styles.statValue}>₹0</span>
            <span className={styles.statLabel} style={{ display: 'block' }}>
              Setup cost
            </span>
          </span>
          <span>
            <span className={styles.statValue}>Export</span>
            <span className={styles.statLabel} style={{ display: 'block' }}>
              Your data, always
            </span>
          </span>
        </div>
      </aside>
    </div>
  );
}
