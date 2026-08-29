import { useEffect, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { useAsync, useDebounced } from '../lib/useAsync.js';
import {
  AutoFocus,
  Card,
  Drawer,
  Empty,
  ErrorState,
  Field,
  PageHeader,
  Pager,
  SkeletonRows,
  SubmitButton,
} from '../components/ui.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import { count, money, shortDate, todayIso } from '../lib/format.js';
import styles from './Dashboard.module.css';

/**
 * The household book. Search here is served by the per-tenant trie on the API, which is why it
 * answers on the third keystroke instead of waiting for a LIKE scan.
 */

const BLANK = {
  routeId: '',
  name: '',
  phone: '',
  address: '',
  landmark: '',
  lat: '',
  lng: '',
  notes: '',
  joinedOn: todayIso(),
  active: true,
};

const PHONE = /^[0-9+][0-9 -]{7,19}$/;

export default function Customers() {
  const toast = useToast();
  const { canManage } = useAuth();
  const [term, setTerm] = useState('');
  const [routeId, setRouteId] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [issues, setIssues] = useState({});
  const [busy, setBusy] = useState(false);

  const query = useDebounced(term.trim(), 220);
  const searching = query.length >= 2;

  const routes = useAsync(() => api.routes.list(false), []);
  const list = useAsync(
    () => api.customers.page({ routeId: routeId || undefined, activeOnly, page, size: 12 }),
    [routeId, activeOnly, page],
    { skip: searching },
  );
  const hits = useAsync(() => api.customers.search(query, 25), [query], { skip: !searching });

  useEffect(() => {
    setPage(0);
  }, [routeId, activeOnly]);

  const openCreate = () => {
    setEditing('new');
    setForm({ ...BLANK, routeId: routeId || (routes.data?.[0]?.id ?? '') });
    setIssues({});
  };

  const openEdit = (customer) => {
    setEditing(customer);
    setForm({
      routeId: customer.routeId ?? '',
      name: customer.name || '',
      phone: customer.phone || '',
      address: customer.address || '',
      landmark: customer.landmark || '',
      lat: customer.lat == null ? '' : String(customer.lat),
      lng: customer.lng == null ? '' : String(customer.lng),
      notes: customer.notes || '',
      joinedOn: customer.joinedOn || todayIso(),
      active: customer.active,
    });
    setIssues({});
  };

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setIssues((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const handleLocationChange = (lat, lng) => {
    setForm((current) => ({ ...current, lat, lng }));
    setIssues((current) => ({ ...current, lat: undefined, lng: undefined }));
  };

  const validate = () => {
    const found = {};
    if (!form.routeId) found.routeId = 'Pick the beat this household sits on.';
    if (form.name.trim().length < 2) found.name = 'Name is required.';
    if (!PHONE.test(form.phone.trim())) found.phone = 'Use 8-20 digits, e.g. 9822012345.';
    if (form.address.trim().length < 4) found.address = 'A door number and street is enough.';
    if (form.lat !== '' && Number.isNaN(Number(form.lat))) found.lat = 'Latitude must be a number.';
    if (form.lng !== '' && Number.isNaN(Number(form.lng))) found.lng = 'Longitude must be a number.';
    setIssues(found);
    return Object.keys(found).length === 0;
  };

  const save = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setBusy(true);
    const body = {
      routeId: Number(form.routeId),
      name: form.name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      landmark: form.landmark.trim() || null,
      lat: form.lat === '' ? null : Number(form.lat),
      lng: form.lng === '' ? null : Number(form.lng),
      notes: form.notes.trim() || null,
      active: form.active,
      joinedOn: form.joinedOn || null,
    };
    try {
      if (editing === 'new') {
        const created = await api.customers.create(body);
        toast.success(`${created.name} added`, 'Give them a standing order to put them on the round.');
      } else {
        await api.customers.update(editing.id, body);
        toast.success(`${body.name} updated`);
      }
      setEditing(null);
      list.reload();
    } catch (error) {
      const fromServer = {};
      (error.fieldErrors || []).forEach((issue) => {
        fromServer[issue.field] = issue.message;
      });
      if (Object.keys(fromServer).length) setIssues(fromServer);
      toast.fromError(error, 'Could not save this household');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (customer) => {
    try {
      await api.customers.setActive(customer.id, !customer.active);
      toast.success(customer.active ? `${customer.name} paused` : `${customer.name} reactivated`);
      list.reload();
    } catch (error) {
      toast.fromError(error, 'Could not change that household');
    }
  };

  return (
    <>
      <PageHeader
        title="Households"
        subtitle="Everyone you deliver to. Search runs against a prefix tree on the server, so three letters is usually enough."
      >
        {canManage ? (
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Add household
          </button>
        ) : null}
      </PageHeader>

      <Card
        flush
        title={searching ? `Matches for “${query}”` : 'The book'}
        subtitle={
          searching
            ? 'Instant prefix matches on name and phone'
            : 'Filtered by beat and status, 12 to a page'
        }
        actions={
          <div className="row wrap" style={{ gap: 'var(--s-3)' }}>
            <AutoFocus>
              <input
                className="input"
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search name or phone…"
                aria-label="Search households"
                style={{ minWidth: 220 }}
              />
            </AutoFocus>
            <select
              className="select"
              value={routeId}
              onChange={(event) => setRouteId(event.target.value)}
              aria-label="Filter by beat"
              style={{ width: 'auto' }}
            >
              <option value="">All beats</option>
              {(routes.data || []).map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name}
                </option>
              ))}
            </select>
            <label className="check">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(event) => setActiveOnly(event.target.checked)}
              />
              <span>Active only</span>
            </label>
          </div>
        }
      >
        {searching ? (
          hits.error ? (
            <ErrorState error={hits.error} onRetry={hits.reload} />
          ) : hits.loading ? (
            <SkeletonRows rows={4} cols={3} />
          ) : (hits.data || []).length === 0 ? (
            <Empty
              glyph="⌕"
              title="No household matches that"
              text="Try fewer letters, or the last four digits of the phone number."
            />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Household</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Beat</th>
                  </tr>
                </thead>
                <tbody>
                  {hits.data.map((hit) => (
                    <tr key={hit.id}>
                      <td>
                        <Link to={`/app/customers/${hit.id}`}>{hit.name}</Link>
                      </td>
                      <td className="mono nowrap">{hit.phone}</td>
                      <td className="truncate" style={{ maxWidth: 280 }}>
                        {hit.address}
                      </td>
                      <td className="nowrap">{hit.routeName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.loading ? (
          <SkeletonRows rows={7} cols={5} />
        ) : (list.data?.content || []).length === 0 ? (
          <Empty
            glyph="◈"
            title={routeId || !activeOnly ? 'No households matching this filter' : 'No households here yet'}
            text={
              routeId || !activeOnly
                ? 'Try resetting your beat or active filter to see all households on the book.'
                : "Add the first one and give it a standing order — it joins tomorrow's round automatically."
            }
          >
            {routeId || !activeOnly ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setRouteId('');
                  setActiveOnly(true);
                }}
              >
                Reset filters
              </button>
            ) : canManage ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                Add household
              </button>
            ) : null}
          </Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Household</th>
                    <th>Beat</th>
                    <th className="right">Orders</th>
                    <th className="right">Monthly</th>
                    <th className="right">Outstanding</th>
                    <th>Joined</th>
                    {canManage ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {list.data.content.map((customer) => (
                    <tr key={customer.id} className={customer.active ? '' : 'row-dim'}>
                      <td>
                        <Link to={`/app/customers/${customer.id}`}>{customer.name}</Link>
                        <div className="hint mono">{customer.phone}</div>
                      </td>
                      <td className="nowrap">
                        {customer.routeName}
                        {customer.lat == null || customer.lng == null ? (
                          <div className="hint" style={{ color: 'var(--warn-600)' }}>
                            No coordinates
                          </div>
                        ) : null}
                      </td>
                      <td className="right num">{count(customer.activeSubscriptions)}</td>
                      <td className="right num nowrap">{money(customer.monthlyValuePaise)}</td>
                      <td className="right num nowrap">
                        {customer.outstandingPaise > 0 ? (
                          <span style={{ color: 'var(--risk-600)', fontWeight: 650 }}>
                            {money(customer.outstandingPaise)}
                          </span>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                      <td className="nowrap">{shortDate(customer.joinedOn)}</td>
                      {canManage ? (
                        <td className="right nowrap">
                          <button type="button" className="btn btn-sm" onClick={() => openEdit(customer)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => toggleActive(customer)}
                          >
                            {customer.active ? 'Deactivate' : 'Restore'}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={list.data.page}
              size={list.data.size}
              totalElements={list.data.totalElements}
              totalPages={list.data.totalPages}
              onPage={setPage}
              busy={list.loading}
            />
          </>
        )}
      </Card>

      <Drawer
        open={Boolean(editing)}
        title={editing === 'new' ? 'Add household' : `Edit ${editing?.name || ''}`}
        subtitle="Coordinates are optional — without them the household is served after the optimised stops, never dropped."
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
            <SubmitButton busy={busy} form="customer-form">
              {editing === 'new' ? 'Add household' : 'Save changes'}
            </SubmitButton>
          </>
        }
      >
        <form id="customer-form" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={save} noValidate>
          <Field label="Beat" htmlFor="routeId" error={issues.routeId}>
            <select id="routeId" className="select" value={form.routeId} onChange={set('routeId')}>
              <option value="">Choose a beat…</option>
              {(routes.data || []).map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name}
                  {route.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Name" htmlFor="name" error={issues.name}>
            <input
              id="name"
              className="input"
              value={form.name}
              onChange={set('name')}
              placeholder="Kale, Flat 4B"
              required
            />
          </Field>

          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Phone" htmlFor="phone" error={issues.phone}>
              <input
                id="phone"
                className="input"
                value={form.phone}
                onChange={set('phone')}
                inputMode="tel"
                placeholder="9822012345"
                required
              />
            </Field>
            <Field label="Joined on" htmlFor="joinedOn">
              <input
                id="joinedOn"
                className="input"
                type="date"
                value={form.joinedOn}
                onChange={set('joinedOn')}
              />
            </Field>
          </div>

          <Field label="Address" htmlFor="address" error={issues.address}>
            <input
              id="address"
              className="input"
              value={form.address}
              onChange={set('address')}
              placeholder="Sai Residency, Lane 4, Kothrud"
              required
            />
          </Field>

          <Field
            label="Landmark"
            htmlFor="landmark"
            hint="What the agent needs at the gate — bell code, floor, dog"
          >
            <input
              id="landmark"
              className="input"
              value={form.landmark}
              onChange={set('landmark')}
              placeholder="Second floor, ring twice"
            />
          </Field>

          <LocationPicker
            lat={form.lat}
            lng={form.lng}
            onChange={handleLocationChange}
          />

          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Latitude" htmlFor="lat" error={issues.lat} hint="Synced with map pin">
              <input
                id="lat"
                className="input"
                value={form.lat}
                onChange={set('lat')}
                inputMode="decimal"
                placeholder="18.5074"
              />
            </Field>
            <Field label="Longitude" htmlFor="lng" error={issues.lng} hint="Synced with map pin">
              <input
                id="lng"
                className="input"
                value={form.lng}
                onChange={set('lng')}
                inputMode="decimal"
                placeholder="73.8077"
              />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes" hint="Only you and your managers see this">
            <textarea
              id="notes"
              className="textarea"
              rows={3}
              maxLength={400}
              value={form.notes}
              onChange={set('notes')}
              placeholder="Pays on the 5th, prefers UPI"
            />
          </Field>

          <label className="check">
            <input type="checkbox" checked={form.active} onChange={set('active')} />
            <span>
              Active
              <span className="hint" style={{ display: 'block' }}>
                Inactive households stay in the book and keep their history, but never appear on a run
                sheet or an invoice again.
              </span>
            </span>
          </label>
        </form>
      </Drawer>
    </>
  );
}
