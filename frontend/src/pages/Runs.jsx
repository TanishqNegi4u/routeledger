import { useMemo, useState } from 'react';
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
  Kpi,
  KpiGrid,
  PageHeader,
  Pager,
  SkeletonRows,
  StatusBadge,
  SubmitButton,
} from '../components/ui.jsx';
import {
  count,
  distance,
  isoDate,
  longDate,
  money,
  percent,
  relativeDay,
  shortDate,
  todayIso,
} from '../lib/format.js';
import styles from './Dashboard.module.css';

/**
 * Run planning for owners and managers. The generate drawer is the only place in the app that
 * triggers the route optimiser, so it explains what it is about to do before it does it.
 */

function shiftDay(iso, delta) {
  const parts = String(iso).split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + delta);
  return isoDate(date);
}

function tomorrowIso() {
  return shiftDay(todayIso(), 1);
}

export default function Runs() {
  const toast = useToast();
  const [date, setDate] = useState(todayIso);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    runDate: tomorrowIso(),
    days: '1',
    distanceModel: 'ROAD_APPROX',
    replaceExisting: false,
    routeIds: [],
  });
  const [outcome, setOutcome] = useState(null);

  const today = useAsync(() => api.runs.byDate(date), [date]);
  const history = useAsync(() => api.runs.page(page, 12), [page]);
  const routes = useAsync(() => api.routes.list(true), []);

  const totals = useMemo(() => {
    const list = today.data || [];
    return list.reduce(
      (acc, run) => ({
        stops: acc.stops + Number(run.totalStops || 0),
        done: acc.done + Number(run.completedStops || 0),
        planned: acc.planned + Number(run.plannedMetres || 0),
        saved: acc.saved + Number(run.savedMetres || 0),
        value: acc.value + Number(run.plannedValuePaise || 0),
      }),
      { stops: 0, done: 0, planned: 0, saved: 0, value: 0 },
    );
  }, [today.data]);

  const toggleRoute = (id) => {
    setForm((current) => ({
      ...current,
      routeIds: current.routeIds.includes(id)
        ? current.routeIds.filter((value) => value !== id)
        : [...current.routeIds, id],
    }));
  };

  const generate = async (event) => {
    event.preventDefault();
    setBusy(true);
    setOutcome(null);
    try {
      const result = await api.runs.generate({
        runDate: form.runDate,
        days: Math.min(14, Math.max(1, Number.parseInt(form.days, 10) || 1)),
        routeIds: form.routeIds.length ? form.routeIds : null,
        distanceModel: form.distanceModel,
        replaceExisting: form.replaceExisting,
      });
      setOutcome(result);
      toast.success(
        `${count(result.createdRuns + result.rebuiltRuns)} runs sequenced`,
        `${count(result.totalStops)} stops planned · ${distance(result.savedMetres)} saved against entry order.`,
      );
      setDate(form.runDate);
      today.reload();
      history.reload();
    } catch (error) {
      toast.fromError(error, 'Could not generate runs');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Runs"
        subtitle="Sequence tomorrow before you sleep. Each beat is planned from its depot, paused households are dropped, and the sheet records how much distance the plan saved."
      >
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          Generate runs
        </button>
      </PageHeader>

      <KpiGrid>
        <Kpi
          label="Stops on this date"
          glyph="◈"
          loading={today.loading}
          value={`${count(totals.done)} / ${count(totals.stops)}`}
          foot={`${count((today.data || []).length)} beats scheduled`}
        />
        <Kpi
          label="Planned distance"
          glyph="⇄"
          loading={today.loading}
          value={distance(totals.planned)}
          foot="Sum of every optimised leg"
        />
        <Kpi
          label="Distance saved"
          glyph="▼"
          tone="good"
          loading={today.loading}
          value={distance(totals.saved)}
          foot={
            totals.planned + totals.saved > 0
              ? `${percent((totals.saved / (totals.planned + totals.saved)) * 100, 1)} shorter than entry order`
              : 'Nothing sequenced yet'
          }
        />
        <Kpi
          label="Sheet value"
          glyph="₹"
          loading={today.loading}
          value={money(totals.value)}
          foot="What this date is worth if every door opens"
        />
      </KpiGrid>

      <div style={{ marginTop: 'var(--s-5)' }}>
        <Card
          flush
          title={`${relativeDay(date)} · ${longDate(date)}`}
          subtitle="One row per beat. Open a beat to see its ordered doorstep list."
          actions={
            <div className="row" style={{ gap: 'var(--s-2)' }}>
              <button type="button" className="btn btn-sm" onClick={() => setDate((d) => shiftDay(d, -1))}>
                ←
              </button>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value || todayIso())}
                style={{ width: 'auto' }}
                aria-label="Run date"
              />
              <button type="button" className="btn btn-sm" onClick={() => setDate((d) => shiftDay(d, 1))}>
                →
              </button>
            </div>
          }
        >
          {today.error ? (
            <ErrorState error={today.error} onRetry={today.reload} />
          ) : today.loading ? (
            <SkeletonRows rows={3} cols={6} />
          ) : (today.data || []).length === 0 ? (
            <Empty
              glyph="⌗"
              title="Nothing planned for this date"
              text="Generate the round and every active beat is sequenced in one pass."
            >
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
                Generate runs
              </button>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Beat</th>
                    <th>Agent</th>
                    <th>Status</th>
                    <th className="right">Stops</th>
                    <th className="right">Planned</th>
                    <th className="right">Saved</th>
                    <th className="right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {today.data.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <Link to={`/app/runs/${run.id}`}>{run.routeName}</Link>
                        <div className="hint">{run.twoOptSwaps} 2-opt swaps applied</div>
                      </td>
                      <td className="nowrap">
                        {run.agentName || <span className="faint">Unassigned</span>}
                      </td>
                      <td>
                        <StatusBadge value={run.status} />
                      </td>
                      <td className="right num nowrap">
                        {count(run.completedStops)} / {count(run.totalStops)}
                      </td>
                      <td className="right num nowrap">{distance(run.plannedMetres)}</td>
                      <td className="right num nowrap">
                        {run.savedMetres > 0 ? (
                          <span style={{ color: 'var(--good-600)' }}>
                            {distance(run.savedMetres)} · {percent(run.savedPercent, 0)}
                          </span>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                      <td className="right num nowrap">{money(run.plannedValuePaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 'var(--s-5)' }}>
        <Card flush title="Run history" subtitle="Newest first, across every beat">
          {history.error ? (
            <ErrorState error={history.error} onRetry={history.reload} />
          ) : history.loading ? (
            <SkeletonRows rows={6} cols={5} />
          ) : (history.data?.content || []).length === 0 ? (
            <Empty glyph="◔" title="No runs yet" text="Your first generated round will appear here.">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
                Generate runs
              </button>
            </Empty>
          ) : (
            <>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Beat</th>
                      <th>Status</th>
                      <th className="right">Stops</th>
                      <th className="right">Planned</th>
                      <th className="right">Saved</th>
                      <th className="right">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.content.map((run) => (
                      <tr key={run.id}>
                        <td className="nowrap">
                          <Link to={`/app/runs/${run.id}`}>{shortDate(run.runDate)}</Link>
                          <div className="hint">{relativeDay(run.runDate)}</div>
                        </td>
                        <td className="nowrap">{run.routeName}</td>
                        <td>
                          <StatusBadge value={run.status} />
                        </td>
                        <td className="right num nowrap">
                          {count(run.completedStops)} / {count(run.totalStops)}
                        </td>
                        <td className="right num nowrap">{distance(run.plannedMetres)}</td>
                        <td className="right num nowrap">{distance(run.savedMetres)}</td>
                        <td className="right num nowrap">{money(run.collectedValuePaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={history.data.page}
                size={history.data.size}
                totalElements={history.data.totalElements}
                totalPages={history.data.totalPages}
                onPage={setPage}
                busy={history.loading}
              />
            </>
          )}
        </Card>
      </div>

      <Drawer
        open={open}
        title="Generate runs"
        subtitle="Builds the sheet, drops paused households and sequences each beat from its depot."
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
              Close
            </button>
            <SubmitButton busy={busy} form="generate-runs">
              Sequence now
            </SubmitButton>
          </>
        }
      >
        <form id="generate-runs" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={generate}>
          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Start date" htmlFor="runDate">
              <input
                id="runDate"
                className="input"
                type="date"
                value={form.runDate}
                onChange={(event) => setForm((c) => ({ ...c, runDate: event.target.value }))}
                required
              />
            </Field>
            <Field label="Days" htmlFor="days" hint="1 to 14 consecutive days">
              <input
                id="days"
                className="input"
                type="number"
                min={1}
                max={14}
                inputMode="numeric"
                value={form.days}
                onChange={(event) => setForm((c) => ({ ...c, days: event.target.value }))}
              />
            </Field>
          </div>

          <Field
            label="Distance model"
            htmlFor="distanceModel"
            hint="Road-approximate adds a detour factor to straight-line distance, which matches Indian lanes far better."
          >
            <select
              id="distanceModel"
              className="select"
              value={form.distanceModel}
              onChange={(event) => setForm((c) => ({ ...c, distanceModel: event.target.value }))}
            >
              <option value="ROAD_APPROX">Road approximate (recommended)</option>
              <option value="GEODESIC">Geodesic straight line</option>
            </select>
          </Field>

          <div className="field">
            <span className="label">Beats</span>
            <span className="hint" style={{ marginBottom: 'var(--s-2)' }}>
              Leave everything unticked to plan every active beat.
            </span>
            {routes.loading ? (
              <span className="hint">Loading beats…</span>
            ) : (routes.data || []).length === 0 ? (
              <span className="hint">
                No active beats yet — <Link to="/app/beats">create one</Link> first.
              </span>
            ) : (
              <div className="col" style={{ gap: 'var(--s-2)' }}>
                {routes.data.map((route) => (
                  <label className="check" key={route.id}>
                    <input
                      type="checkbox"
                      checked={form.routeIds.includes(route.id)}
                      onChange={() => toggleRoute(route.id)}
                    />
                    <span>
                      {route.name}
                      <span className="hint">
                        {' '}
                        · {count(route.customerCount)} households
                        {route.agentName ? ` · ${route.agentName}` : ''}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={form.replaceExisting}
              onChange={(event) => setForm((c) => ({ ...c, replaceExisting: event.target.checked }))}
            />
            <span>
              Rebuild runs that already exist
              <span className="hint" style={{ display: 'block' }}>
                Off by default, so re-running never wipes a sheet an agent is already working through.
                Rebuilding keeps stops that are already marked.
              </span>
            </span>
          </label>

          {outcome ? (
            <div className="card" style={{ background: 'var(--surface-sunken)' }}>
              <div className="card-body col" style={{ gap: 'var(--s-2)' }}>
                <span className="section-title">Last generation</span>
                <span className="num" style={{ fontWeight: 650 }}>
                  {count(outcome.createdRuns)} created · {count(outcome.rebuiltRuns)} rebuilt ·{' '}
                  {count(outcome.skippedRuns)} skipped
                </span>
                <span className="hint">
                  {count(outcome.totalStops)} stops · {distance(outcome.savedMetres)} saved
                </span>
                {(outcome.messages || []).map((message) => (
                  <span className="hint" key={message}>
                    · {message}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </form>
      </Drawer>
    </>
  );
}
