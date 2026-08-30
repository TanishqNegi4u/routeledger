import { useState } from 'react';
import { Link, navigate } from '../lib/router.jsx';
import { useCustomerAuth } from '../lib/customerAuth.jsx';
import { useToast } from '../lib/toast.jsx';
import { Card, Field, SubmitButton } from '../components/ui.jsx';

export default function CustomerRegister() {
  const { login } = useCustomerAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    address: '',
    landmark: '',
    city: 'Pune',
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    if (form.name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^[0-9]{10}$/.test(form.phone.trim())) {
      setError('Please enter a valid 10-digit mobile phone number.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (form.address.trim().length < 5) {
      setError('Please provide a complete doorstep delivery address.');
      return;
    }

    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      const customerData = {
        id: Math.floor(Date.now() / 1000),
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || `${form.phone.trim()}@routeledger.consumer`,
        address: form.address.trim(),
        landmark: form.landmark.trim(),
        city: form.city.trim(),
      };

      login(customerData);
      toast.success(`Account created! Welcome, ${customerData.name}.`);
      navigate('/customer');
    }, 400);
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
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--s-4)' }}>
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
          <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 800 }}>Create Customer Account</h1>
          <p className="hint" style={{ marginTop: 'var(--s-1)' }}>
            Sign up to subscribe to daily meal tiffins, artisanal milk, and morning deliveries.
          </p>
        </div>

        <Card>
          {error ? (
            <div
              style={{
                padding: 'var(--s-3)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid var(--risk-500)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--risk-600)',
                fontSize: '0.875rem',
                marginBottom: 'var(--s-4)',
              }}
            >
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <Field label="Full Name" id="cust-reg-name">
              <input
                type="text"
                className="input"
                required
                placeholder="e.g. Ramesh Kulkarni"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>

            <div className="row" style={{ gap: 'var(--s-3)' }}>
              <Field label="Mobile Number (10 digits)" id="cust-reg-phone">
                <input
                  type="tel"
                  className="input"
                  required
                  placeholder="9822012345"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </Field>

              <Field label="Password" id="cust-reg-pass">
                <input
                  type="password"
                  className="input"
                  required
                  placeholder="At least 6 chars"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </Field>
            </div>

            <Field label="Email Address (Optional)" id="cust-reg-email">
              <input
                type="email"
                className="input"
                placeholder="you@domain.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>

            <Field label="Delivery Doorstep Address" id="cust-reg-addr">
              <input
                type="text"
                className="input"
                required
                placeholder="Flat / Floor, Building Name, Society"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </Field>

            <div className="row" style={{ gap: 'var(--s-3)' }}>
              <Field label="Landmark (Optional)" id="cust-reg-landmark">
                <input
                  type="text"
                  className="input"
                  placeholder="Near School / Gate"
                  value={form.landmark}
                  onChange={(e) => setForm((f) => ({ ...f, landmark: e.target.value }))}
                />
              </Field>

              <Field label="City" id="cust-reg-city">
                <input
                  type="text"
                  className="input"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </Field>
            </div>

            <div style={{ marginTop: 'var(--s-4)' }}>
              <SubmitButton disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Creating Account…' : 'Register & Open Customer Portal →'}
              </SubmitButton>
            </div>
          </form>

          <div
            style={{
              marginTop: 'var(--s-4)',
              paddingTop: 'var(--s-3)',
              borderTop: '1px solid var(--border)',
              textAlign: 'center',
              fontSize: '0.875rem',
            }}
          >
            <span className="hint">Already have a customer account? </span>
            <Link to="/customer/login" style={{ fontWeight: 600, color: 'var(--brand-600)' }}>
              Sign in here →
            </Link>
          </div>
        </Card>

        {/* Footer switcher */}
        <div style={{ textAlign: 'center', marginTop: 'var(--s-4)', fontSize: '0.875rem' }}>
          <span className="hint">Are you a Business Owner? </span>
          <Link to="/register" style={{ fontWeight: 600, color: 'var(--brand-600)' }}>
            Register Business Workspace →
          </Link>
        </div>
      </div>
    </div>
  );
}
