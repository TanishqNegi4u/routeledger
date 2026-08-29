import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { useAsync } from '../lib/useAsync.js';
import {
  Card,
  Empty,
  ErrorState,
  Field,
  PageHeader,
  SkeletonRows,
  StatusBadge,
  SubmitButton,
  humanise,
} from '../components/ui.jsx';
import { initials } from '../lib/format.js';
import styles from './Dashboard.module.css';

/**
 * Account and team. Deliberately thin: everything operational lives on its own screen, and the one
 * genuinely sensitive action here — changing a password — re-checks the current one server side.
 */

export default function Settings() {
  const toast = useToast();
  const { user, business, role, canManage, logout } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [issues, setIssues] = useState({});
  const [busy, setBusy] = useState(false);

  const staff = useAsync(() => api.routes.staff(), [], { skip: !canManage });

  const set = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setIssues((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const changePassword = async (event) => {
    event.preventDefault();
    const found = {};
    if (!form.currentPassword) found.currentPassword = 'Enter the password you use today.';
    if (form.newPassword.length < 8) found.newPassword = 'At least 8 characters.';
    if (form.newPassword.length > 72) found.newPassword = 'At most 72 characters.';
    if (form.newPassword && form.confirm !== form.newPassword) found.confirm = 'The two do not match.';
    if (form.currentPassword && form.currentPassword === form.newPassword) {
      found.newPassword = 'Pick something different from the current password.';
    }
    setIssues(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await api.auth.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed', 'Sign in again on your other devices with the new one.');
    } catch (error) {
      if (error.status === 400 || error.status === 401) {
        setIssues({ currentPassword: 'That does not match the password on file.' });
      }
      toast.fromError(error, 'Could not change your password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your account, your business and who else can sign in."
      >
        <button type="button" className="btn btn-sm" onClick={() => logout('/')}>
          Sign out
        </button>
      </PageHeader>

      <div className={styles.duo} style={{ marginTop: 0 }}>
        <Card title="You" subtitle="Read-only for now — ask your owner to change a name or a role">
          <div className="row" style={{ gap: 'var(--s-4)', alignItems: 'center' }}>
            <div
              aria-hidden="true"
              style={{
                width: 52,
                height: 52,
                borderRadius: 'var(--r-pill)',
                background: 'var(--brand-100)',
                color: 'var(--brand-700)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: 'var(--t-body)',
              }}
            >
              {initials(user?.name)}
            </div>
            <div className="col" style={{ gap: 2 }}>
              <strong style={{ fontSize: 'var(--t-h3)' }}>{user?.name || '—'}</strong>
              <span className="hint">{user?.email}</span>
              <span className="hint mono">{user?.phone}</span>
            </div>
          </div>
          <div style={{ marginTop: 'var(--s-4)' }}>
            <div className="section-title">Role</div>
            <div className="row" style={{ gap: 'var(--s-2)', alignItems: 'center' }}>
              <StatusBadge value="ACTIVE">{humanise(role)}</StatusBadge>
              <span className="hint">
                {role === 'OWNER'
                  ? 'Full access, including billing and team.'
                  : role === 'MANAGER'
                    ? 'Everything except account ownership.'
                    : 'Your round, plus recording payments and pauses at the door.'}
              </span>
            </div>
          </div>
        </Card>

        <Card title="Business" subtitle="What appears at the top of every printed bill">
          <div className="col" style={{ gap: 'var(--s-3)' }}>
            <div>
              <div className="section-title">Name</div>
              <strong style={{ fontSize: 'var(--t-h3)' }}>{business?.name || '—'}</strong>
            </div>
            <div className={styles.duo} style={{ marginTop: 0, gap: 'var(--s-4)' }}>
              <div>
                <div className="section-title">Owner</div>
                <div style={{ fontWeight: 650 }}>{business?.ownerName || '—'}</div>
              </div>
              <div>
                <div className="section-title">City</div>
                <div style={{ fontWeight: 650 }}>{business?.city || '—'}</div>
              </div>
            </div>
            <div className={styles.duo} style={{ marginTop: 0, gap: 'var(--s-4)' }}>
              <div>
                <div className="section-title">Plan</div>
                <div style={{ fontWeight: 650 }}>{humanise(business?.plan || 'STARTER')}</div>
              </div>
              <div>
                <div className="section-title">Currency</div>
                <div className="mono" style={{ fontWeight: 650 }}>
                  {business?.currency || 'INR'}
                </div>
              </div>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Every row this account can read is scoped to this business by the token you signed in with —
              the tenant id is never taken from a request body, so one business can never read another's
              round.
            </p>
          </div>
        </Card>
      </div>

      <div className={styles.duo}>
        <Card
          title="Change password"
          subtitle="The current password is verified server side before anything changes."
        >
          <form className="col" style={{ gap: 'var(--s-4)' }} onSubmit={changePassword} noValidate>
            <Field label="Current password" htmlFor="currentPassword" error={issues.currentPassword}>
              <input
                id="currentPassword"
                className="input"
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={set('currentPassword')}
                required
              />
            </Field>
            <Field
              label="New password"
              htmlFor="newPassword"
              error={issues.newPassword}
              hint="8 to 72 characters. A short phrase beats a clever word."
            >
              <input
                id="newPassword"
                className="input"
                type="password"
                autoComplete="new-password"
                value={form.newPassword}
                onChange={set('newPassword')}
                required
              />
            </Field>
            <Field label="Repeat new password" htmlFor="confirm" error={issues.confirm}>
              <input
                id="confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={set('confirm')}
                required
              />
            </Field>
            <SubmitButton busy={busy} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
              Change password
            </SubmitButton>
          </form>
        </Card>

        <Card
          title="Team"
          subtitle={
            canManage
              ? 'Everyone who can sign in to this business'
              : 'Only owners and managers can see the roster'
          }
        >
          {!canManage ? (
            <Empty
              glyph="◍"
              title="Not your permission level"
              text="Your owner manages who can sign in. Ask them to add an agent."
            />
          ) : staff.error ? (
            <ErrorState error={staff.error} onRetry={staff.reload} />
          ) : staff.loading ? (
            <SkeletonRows rows={3} cols={2} />
          ) : (staff.data || []).length === 0 ? (
            <Empty
              glyph="◍"
              title="No agents yet"
              text="Register an agent account and assign them a beat, and their round appears on their phone."
            />
          ) : (
            <div className="col" style={{ gap: 'var(--s-3)' }}>
              {staff.data.map((member) => (
                <div className="spread" key={member.id}>
                  <div className="col" style={{ gap: 0 }}>
                    <strong>{member.name}</strong>
                    <span className="hint">{member.email}</span>
                  </div>
                  <span className="badge badge-plain">{humanise(member.role)}</span>
                </div>
              ))}
              <p className="hint" style={{ margin: 0 }}>
                Agents only ever see the beat assigned to them, and only for today and the recent past.
              </p>
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 'var(--s-5)' }}>
        <Card
          title="Under the bonnet"
          subtitle="What actually runs when you press Generate runs or Generate bills"
        >
          <div
            style={{
              display: 'grid',
              gap: 'var(--s-4)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <div>
              <div className="section-title">Sequencing</div>
              <p className="hint" style={{ margin: 0 }}>
                A sparse graph of your households (k-nearest plus a spanning tree so it stays connected),
                all-pairs shortest paths with Dijkstra over a binary heap, a nearest-neighbour tour, then
                2-opt until no improving swap remains.
              </p>
            </div>
            <div>
              <div className="section-title">Pauses</div>
              <p className="hint" style={{ margin: 0 }}>
                An interval tree answers “is this household paused on this date” in O(log n) while the sheet
                is built, which is why a holiday never turns into a disputed line on a bill.
              </p>
            </div>
            <div>
              <div className="section-title">Search and dues</div>
              <p className="hint" style={{ margin: 0 }}>
                A per-business trie answers household search on the third keystroke, and a max-heap keeps the
                chase list ordered by risk without sorting the whole book.
              </p>
            </div>
            <div>
              <div className="section-title">API</div>
              <p className="hint" style={{ margin: 0 }}>
                Every screen here is a thin client over the documented REST API.{' '}
                <a href="/swagger-ui.html" target="_blank" rel="noreferrer">
                  Open the API reference
                </a>
                .
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
