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
 * Account, team and staff management.
 * Owners can add new delivery agents / managers and remove staff members.
 */

export default function Settings() {
  const toast = useToast();
  const { user, business, role, canManage, logout } = useAuth();
  const isOwner = role === 'OWNER';

  // Password change state
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [issues, setIssues] = useState({});
  const [busy, setBusy] = useState(false);

  // Staff management state
  const staff = useAsync(() => api.routes.staff(), [], { skip: !canManage });
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'AGENT',
    password: '',
  });
  const [addBusy, setAddBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

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

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.phone.trim() || !addForm.password) {
      toast.warn('Please fill in all fields.');
      return;
    }
    setAddBusy(true);
    try {
      await api.routes.createStaff({
        name: addForm.name.trim(),
        email: addForm.email.trim().toLowerCase(),
        phone: addForm.phone.trim(),
        role: addForm.role,
        password: addForm.password,
      });
      toast.success(
        `Added ${addForm.name} as ${humanise(addForm.role)}`,
        `They can now sign in at /login with their email and password.`
      );
      setAddForm({ name: '', email: '', phone: '', role: 'AGENT', password: '' });
      setShowAddModal(false);
      staff.reload();
    } catch (error) {
      toast.fromError(error, 'Could not add staff member');
    } finally {
      setAddBusy(false);
    }
  };

  const handleDeleteStaff = async (member) => {
    if (!window.confirm(`Are you sure you want to remove ${member.name} (${humanise(member.role)})?`)) {
      return;
    }
    setDeletingId(member.id);
    try {
      await api.routes.deleteStaff(member.id);
      toast.success(`Removed ${member.name}`, 'They have been unassigned from routes and removed.');
      staff.reload();
    } catch (error) {
      toast.fromError(error, 'Could not remove staff member');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your account, your business and team permissions."
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
                  ? 'Full access, including billing, customer approvals and team management.'
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
              the tenant id is never taken from a request body.
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

        {/* TEAM & AGENT MANAGEMENT */}
        <Card
          title="Team & Delivery Agents"
          subtitle={
            canManage
              ? 'Manage delivery drivers and kitchen managers for your business'
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
          ) : (
            <div className="col" style={{ gap: 'var(--s-3)' }}>
              {isOwner ? (
                <div className="row spread" style={{ marginBottom: 'var(--s-2)' }}>
                  <span className="hint">{staff.data?.length || 0} active team members</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setShowAddModal(true)}
                  >
                    + Add Agent / Staff
                  </button>
                </div>
              ) : null}

              {(staff.data || []).map((member) => (
                <div
                  className="spread"
                  key={member.id}
                  style={{
                    padding: 'var(--s-2) var(--s-3)',
                    background: 'var(--surface-muted)',
                    borderRadius: 'var(--r-sm)',
                    alignItems: 'center',
                  }}
                >
                  <div className="col" style={{ gap: 2 }}>
                    <div className="row" style={{ gap: 'var(--s-2)', alignItems: 'center' }}>
                      <strong>{member.name}</strong>
                      {member.id === user?.id ? <span className="badge badge-brand">You</span> : null}
                    </div>
                    <span className="hint" style={{ fontSize: '0.8125rem' }}>
                      {member.email} · 📞 {member.phone || 'No phone'}
                    </span>
                  </div>

                  <div className="row" style={{ gap: 'var(--s-2)', alignItems: 'center' }}>
                    <span className="badge badge-plain">{humanise(member.role)}</span>
                    {isOwner && member.id !== user?.id ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ color: 'var(--risk-600)', padding: '2px 8px', fontSize: '0.75rem' }}
                        disabled={deletingId === member.id}
                        onClick={() => handleDeleteStaff(member)}
                      >
                        {deletingId === member.id ? 'Removing…' : 'Delete'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}

              <p className="hint" style={{ margin: 0, marginTop: 'var(--s-2)', fontSize: '0.8125rem' }}>
                💡 Agents only see their assigned beat for today. Assign agents to beats under the <b>Beats</b> menu.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* ADD AGENT / STAFF MODAL */}
      {showAddModal ? (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Add Delivery Agent / Staff</h3>
            <p className="hint">
              Create login credentials for a new delivery driver or kitchen manager.
            </p>

            <form onSubmit={handleAddStaff}>
              <Field label="Full Name" id="st-name">
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="e.g. Kiran Shinde"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>

              <Field label="Mobile Phone" id="st-phone">
                <input
                  type="tel"
                  className="input"
                  required
                  placeholder="e.g. +919822099887"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </Field>

              <Field label="Work Email" id="st-email">
                <input
                  type="email"
                  className="input"
                  required
                  placeholder="e.g. kiran@amrutdairy.in"
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                />
              </Field>

              <div className="row" style={{ gap: 'var(--s-3)' }}>
                <Field label="Role" id="st-role">
                  <select
                    className="input"
                    value={addForm.role}
                    onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    <option value="AGENT">Delivery Agent / Driver</option>
                    <option value="MANAGER">Kitchen / Route Manager</option>
                  </select>
                </Field>

                <Field label="Initial Password" id="st-pass">
                  <input
                    type="password"
                    className="input"
                    required
                    placeholder="Min 6 chars"
                    value={addForm.password}
                    onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="row spread" style={{ marginTop: 'var(--s-4)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <SubmitButton disabled={addBusy}>
                  {addBusy ? 'Adding…' : 'Create Staff Account →'}
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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
