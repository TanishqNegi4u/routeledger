import { useState } from 'react';
import { Link, navigate } from '../lib/router.jsx';
import { useCustomerAuth } from '../lib/customerAuth.jsx';
import { useToast } from '../lib/toast.jsx';
import { Card, Field, SubmitButton } from '../components/ui.jsx';

export default function CustomerLogin() {
  const { login } = useCustomerAuth();
  const toast = useToast();

  const [id, setId] = useState('9822011111');
  const [password, setPassword] = useState('Customer@123');
  const [busy, setBusy] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!id.trim() || !password) {
      toast.warn('Please enter your Customer ID / Phone and password.');
      return;
    }

    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      const isSunil = id.includes('9822011111') || id.includes('sunil');
      const customerData = {
        id: isSunil ? 1 : 2,
        name: isSunil ? 'Sunil Joshi' : 'Priya Sharma',
        phone: isSunil ? '9822011111' : '9822022222',
        email: id.includes('@') ? id : `${id}@routeledger.consumer`,
        address: isSunil ? 'Flat 402, Rohan Heights, Kothrud' : 'Flat 101, Green Woods, Baner',
      };

      login(customerData);
      toast.success(`Welcome back, ${customerData.name}!`);
      navigate('/customer');
    }, 400);
  };

  const handleQuickDemo = (name, phone, addr) => {
    const customerData = {
      id: phone.endsWith('111') ? 1 : 2,
      name,
      phone,
      email: `${phone}@routeledger.consumer`,
      address: addr,
    };
    login(customerData);
    toast.success(`Logged in as ${name}`);
    navigate('/customer');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--surface-sunken)',
        padding: 'var(--s-4)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--s-5)' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 'var(--r-md)',
              background: 'linear-gradient(135deg, var(--brand-500), var(--good-500))',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              fontSize: '1.5rem',
              color: '#fff',
              margin: '0 auto var(--s-3)',
            }}
          >
            🍱
          </div>
          <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 800 }}>Customer Portal Login</h1>
          <p className="hint" style={{ marginTop: 'var(--s-1)' }}>
            Sign in with your Customer ID / Phone to manage meal subscriptions, advance payments, and skips.
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit}>
            <Field label="Mobile Number or Customer ID" id="cust-id">
              <input
                type="text"
                className="input"
                required
                placeholder="e.g. 9822011111 or email@domain.com"
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </Field>

            <Field label="Password" id="cust-pass">
              <input
                type="password"
                className="input"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <div style={{ marginTop: 'var(--s-4)' }}>
              <SubmitButton disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Signing in…' : 'Sign in to Customer Portal →'}
              </SubmitButton>
            </div>
          </form>

          {/* Quick Demo Sign-in */}
          <div
            style={{
              marginTop: 'var(--s-4)',
              paddingTop: 'var(--s-3)',
              borderTop: '1px solid var(--border)',
            }}
          >
            <span className="hint" style={{ display: 'block', marginBottom: 'var(--s-2)', fontSize: '0.8125rem' }}>
              ⚡ 1-Click Demo Profiles:
            </span>
            <div className="row" style={{ gap: 'var(--s-2)' }}>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => handleQuickDemo('Sunil Joshi', '9822011111', 'Flat 402, Rohan Heights, Kothrud')}
              >
                👤 Sunil Joshi (9822011111)
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => handleQuickDemo('Priya Sharma', '9822022222', 'Flat 101, Green Woods, Baner')}
              >
                👤 Priya Sharma (9822022222)
              </button>
            </div>
          </div>
        </Card>

        {/* Footer switcher */}
        <div style={{ textAlign: 'center', marginTop: 'var(--s-4)', fontSize: '0.875rem' }}>
          <span className="hint">Are you a Business Owner or Agent? </span>
          <Link to="/login" style={{ fontWeight: 600, color: 'var(--brand-600)' }}>
            Operator Staff Login →
          </Link>
        </div>
      </div>
    </div>
  );
}
