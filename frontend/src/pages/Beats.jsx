import { useState } from 'react';
import { Link } from '../lib/router.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useAsync } from '../lib/useAsync.js';
import {
  Card,
  Drawer,
  Empty,
  ErrorState,
  Field,
  PageHeader,
  SkeletonRows,
  StatusBadge,
  SubmitButton,
} from '../components/ui.jsx';
import { count, distance } from '../lib/format.js';
import styles from './Dashboard.module.css';

/**
 * Beats are the geographic unit of the business: one agent, one depot, one ordered walk.
 *
 * The lower half of this screen is the clusterer. It builds a minimum spanning tree over the
 * households on a beat (Kruskal, union-find), cuts the longest edges, and hands back walkable
 * groups — which is how an owner splits a round that has quietly grown to 90 doors.
 */

const BLANK = {
  name: '',
  agentId: '',
  depotLabel: '',
  depotLat: '',
  depotLng: '',
  active: true,
};

export default function Beats() {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [issues, setIssues] = useState({});
  const [busy, setBusy] = useState(false);

  const [plan, setPlan] = useState({ routeId: '', clusters: '3', maxLinkMetres: '1200' });
  const [planning, setPlanning] = useState(false);
  const [result, setResult] = useState(null);

  const routes = useAsync(() => api.routes.list(false), []);
  const staff = useAsync(() => api.routes.staff(), []);

  const openCreate = () => {
    setEditing('new');
    setForm(BLANK);
    setIssues({});
  };

  const openEdit = (route) => {
    setEditing(route);
    setForm({
      name: route.name || '',
      agentId: route.agentId ?? '',
      depotLabel: route.depotLabel || '',
      depotLat: route.depotLat == null ? '' : String(route.depotLat),
      depotLng: route.depotLng == null ? '' : String(route.depotLng),
      active: route.active,
    });
    setIssues({});
  };

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setIssues((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const save = async (event) => {
    event.preventDefault();
    const found = {};
    if (form.name.trim().length < 2) found.name = 'Give the beat a name your agents will recognise.';
    if (form.depotLabel.trim().length < 2) found.depotLabel = 'Where does the round start?';
    const lat = Number(form.depotLat);
    const lng = Number(form.depotLng);
    if (form.depotLat === '' || Number.isNaN(lat) || lat < -90 || lat > 90) {
      found.depotLat = 'Latitude between -90 and 90.';
    }
    if (form.depotLng === '' || Number.isNaN(lng) || lng < -180 || lng > 180) {
      found.depotLng = 'Longitude between -180 and 180.';
    }
    setIssues(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    const body = {
      name: form.name.trim(),
      agentId: form.agentId ? Number(form.agentId) : null,
      depotLabel: form.depotLabel.trim(),
      depotLat: lat,
      depotLng: lng,
      active: form.active,
    };
    try {
      if (editing === 'new') {
        await api.routes.create(body);
        toast.success(`${body.name} created`, 'Assign households to it from the book.');
      } else {
        await api.routes.update(editing.id, body);
        toast.success(`${body.name} updated`);
      }
      setEditing(null);
      routes.reload();
    } catch (error) {
      const fromServer = {};
      (error.fieldErrors || []).forEach((issue) => {
        fromServer[issue.field] = issue.message;
      });
      if (Object.keys(fromServer).length) setIssues(fromServer);
      toast.fromError(error, 'Could not save this beat');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (route) => {
    try {
      await api.routes.setActive(route.id, !route.active);
      toast.success(route.active ? `${route.name} paused` : `${route.name} back in service`);
      routes.reload();
    } catch (error) {
      toast.fromError(error, 'Could not change that beat');
    }
  };

  const runPlan = async (event) => {
    event.preventDefault();
    setPlanning(true);
    setResult(null);
    try {
      const response = await api.customers.beats({
        routeId: plan.routeId || undefined,
        clusters: Math.min(12, Math.max(2, Number.parseInt(plan.clusters, 10) || 3)),
        maxLinkMetres: Math.max(100, Number(plan.maxLinkMetres) || 1200),
      });
      setResult(response);
      toast.success(
        `${count(response.clusters.length)} walkable groups`,
        response.unplaced > 0
          ? `${count(response.unplaced)} households have no coordinates and were left out.`
          : 'Every household with a pin was placed.',
      );
    } catch (error) {
      toast.fromError(error, 'Could not cluster that beat');
    } finally {
      setPlanning(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Beats"
        subtitle="One agent, one depot, one ordered walk. Every run is planned per beat, starting and ending at its depot."
      >
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          Add beat
        </button>
      </PageHeader>

      <Card flush title="Your beats" subtitle="Depot coordinates are the anchor the optimiser sequences from">
        {routes.error ? (
          <ErrorState error={routes.error} onRetry={routes.reload} />
        ) : routes.loading ? (
          <SkeletonRows rows={4} cols={5} />
        ) : (routes.data || []).length === 0 ? (
          <Empty
            glyph="⌗"
            title="No beats yet"
            text="A beat is a walking round. Create one, point it at a depot, then add households to it."
          >
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
              Add beat
            </button>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Beat</th>
                  <th>Agent</th>
                  <th>Depot</th>
                  <th className="right">Households</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {routes.data.map((route) => (
                  <tr key={route.id} className={route.active ? '' : 'row-dim'}>
                    <td>{route.name}</td>
                    <td className="nowrap">
                      {route.agentName || <span className="faint">Unassigned</span>}
                    </td>
                    <td>
                      {route.depotLabel}
                      <div className="hint mono">
                        {route.depotLat.toFixed(4)}, {route.depotLng.toFixed(4)}
                      </div>
                    </td>
                    <td className="right num">{count(route.customerCount)}</td>
                    <td>
                      <StatusBadge value={route.active ? 'ACTIVE' : 'INACTIVE'} />
                    </td>
                    <td className="right nowrap">
                      <button type="button" className="btn btn-sm" onClick={() => openEdit(route)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => toggleActive(route)}
                      >
                        {route.active ? 'Retire' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ marginTop: 'var(--s-5)' }}>
        <Card
          title="Split a beat into walkable groups"
          subtitle="Kruskal's algorithm over a distance graph of the households, cut at the longest links. Union-find keeps the merge check near O(1), so 500 doors cluster instantly."
        >
          <form className="row wrap" style={{ gap: 'var(--s-4)', alignItems: 'flex-end' }} onSubmit={runPlan}>
            <div style={{ minWidth: 200 }}>
              <Field label="Beat" htmlFor="planRoute">
                <select
                  id="planRoute"
                  className="select"
                  value={plan.routeId}
                  onChange={(event) => setPlan((c) => ({ ...c, routeId: event.target.value }))}
                >
                  <option value="">Every household</option>
                  {(routes.data || []).map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.name} · {count(route.customerCount)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ width: 130 }}>
              <Field label="Groups" htmlFor="planClusters" hint="2 to 12">
                <input
                  id="planClusters"
                  className="input"
                  type="number"
                  min={2}
                  max={12}
                  inputMode="numeric"
                  value={plan.clusters}
                  onChange={(event) => setPlan((c) => ({ ...c, clusters: event.target.value }))}
                />
              </Field>
            </div>
            <div style={{ width: 170 }}>
              <Field label="Max link (m)" htmlFor="planLink" hint="Cut edges longer than this">
                <input
                  id="planLink"
                  className="input"
                  type="number"
                  min={100}
                  step={100}
                  inputMode="numeric"
                  value={plan.maxLinkMetres}
                  onChange={(event) => setPlan((c) => ({ ...c, maxLinkMetres: event.target.value }))}
                />
              </Field>
            </div>
            <SubmitButton busy={planning}>Cluster now</SubmitButton>
          </form>

          {result ? (
            <div style={{ marginTop: 'var(--s-5)' }}>
              <div className="section-title">
                {result.routeName || 'All beats'} · asked for {count(result.requestedClusters)} groups ·
                cut above {distance(result.maxLinkMetres)}
                {result.unplaced > 0 ? ` · ${count(result.unplaced)} without coordinates` : ''}
              </div>
              {result.clusters.length === 0 ? (
                <Empty
                  glyph="◌"
                  title="Nothing to cluster"
                  text="This beat has no households with coordinates yet. Add latitude and longitude on the household form."
                />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gap: 'var(--s-4)',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    marginTop: 'var(--s-3)',
                  }}
                >
                  {result.clusters.map((cluster) => (
                    <div
                      key={cluster.index}
                      className="card"
                      style={{ background: 'var(--surface-sunken)', padding: 'var(--s-4)' }}
                    >
                      <div className="spread">
                        <strong>Group {cluster.index + 1}</strong>
                        <span className="badge badge-brand">{count(cluster.size)} doors</span>
                      </div>
                      <div className="hint" style={{ marginBottom: 'var(--s-3)' }}>
                        Centre {cluster.centroidLat.toFixed(4)}, {cluster.centroidLng.toFixed(4)} · spread{' '}
                        {distance(cluster.radiusMetres)}
                      </div>
                      <div className="col" style={{ gap: 'var(--s-1)' }}>
                        {cluster.customers.map((hit) => (
                          <div key={hit.id} className="truncate">
                            <Link to={`/app/customers/${hit.id}`}>{hit.name}</Link>
                            <span className="hint"> · {hit.address}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="hint" style={{ marginTop: 'var(--s-4)', marginBottom: 0 }}>
              Nothing clustered yet. Pick a beat and press Cluster now — households stay exactly where they
              are, this only tells you where the natural seams fall.
            </p>
          )}
        </Card>
      </div>

      <Drawer
        open={Boolean(editing)}
        title={editing === 'new' ? 'Add beat' : `Edit ${editing?.name || ''}`}
        subtitle="The depot is where the agent starts and finishes. Every optimised tour is anchored to it."
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
            <SubmitButton busy={busy} form="beat-form">
              {editing === 'new' ? 'Add beat' : 'Save changes'}
            </SubmitButton>
          </>
        }
      >
        <form id="beat-form" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={save} noValidate>
          <Field label="Beat name" htmlFor="beatName" error={issues.name}>
            <input
              id="beatName"
              className="input"
              value={form.name}
              onChange={set('name')}
              placeholder="Kothrud morning"
              required
            />
          </Field>

          <Field
            label="Agent"
            htmlFor="agentId"
            error={issues.agentId}
            hint="Only this agent sees the beat on Your round"
          >
            <select id="agentId" className="select" value={form.agentId} onChange={set('agentId')}>
              <option value="">Unassigned for now</option>
              {(staff.data || []).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.role}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Depot" htmlFor="depotLabel" error={issues.depotLabel}>
            <input
              id="depotLabel"
              className="input"
              value={form.depotLabel}
              onChange={set('depotLabel')}
              placeholder="Dairy collection point, Karve Road"
              required
            />
          </Field>

          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Depot latitude" htmlFor="depotLat" error={issues.depotLat}>
              <input
                id="depotLat"
                className="input"
                value={form.depotLat}
                onChange={set('depotLat')}
                inputMode="decimal"
                placeholder="18.5074"
                required
              />
            </Field>
            <Field label="Depot longitude" htmlFor="depotLng" error={issues.depotLng}>
              <input
                id="depotLng"
                className="input"
                value={form.depotLng}
                onChange={set('depotLng')}
                inputMode="decimal"
                placeholder="73.8077"
                required
              />
            </Field>
          </div>

          <label className="check">
            <input type="checkbox" checked={form.active} onChange={set('active')} />
            <span>
              In service
              <span className="hint" style={{ display: 'block' }}>
                A retired beat keeps its history but is skipped when runs are generated.
              </span>
            </span>
          </label>
        </form>
      </Drawer>
    </>
  );
}
