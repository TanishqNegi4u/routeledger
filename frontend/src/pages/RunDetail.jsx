import { useMemo, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { useAsync, useOptimistic } from '../lib/useAsync.js';
import StopBoard from '../components/StopBoard.jsx';
import { Card, ErrorState, PageHeader, Skeleton, SkeletonRows, StatusBadge } from '../components/ui.jsx';
import { clock, count, distance, longDate, money, percent, relativeDay } from '../lib/format.js';

/**
 * One run, with its ordered stops. Managers use this to see where an agent is; an agent lands here
 * from a link and can update stops exactly as on their own screen.
 */

function reconcile(detail, updatedStop) {
  const stops = detail.stops.map((stop) => (stop.id === updatedStop.id ? updatedStop : stop));
  const touched = stops.filter((stop) => stop.status !== 'PENDING').length;
  const total = Number(detail.run.totalStops || 0);
  const status = touched === 0 ? 'PLANNED' : touched >= total ? 'COMPLETED' : 'IN_PROGRESS';
  return { run: { ...detail.run, completedStops: touched, status }, stops };
}

export default function RunDetail({ runId }) {
  const toast = useToast();
  const { isAgent } = useAuth();
  const [busyId, setBusyId] = useState(null);

  const detail = useAsync(() => api.runs.detail(runId), [runId]);
  const applyOptimistic = useOptimistic(detail.setData);
  const stops = useMemo(() => detail.data?.stops || [], [detail.data]);
  const run = detail.data?.run;

  const updateStop = async (stopId, body) => {
    const current = stops.find((stop) => stop.id === stopId);
    if (!current) return;
    setBusyId(stopId);
    const optimistic = {
      ...current,
      status: body.status ?? current.status,
      note: body.note === undefined ? current.note : body.note,
    };
    try {
      const saved = await applyOptimistic(
        (value) => reconcile(value, optimistic),
        () => api.runs.updateStop(stopId, body),
        (failure) => toast.fromError(failure, 'That stop did not save'),
      );
      if (saved) detail.setData((value) => reconcile(value, saved));
    } catch {
      /* rolled back already */
    } finally {
      setBusyId(null);
    }
  };

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;

  return (
    <>
      <PageHeader
        title={run ? run.routeName : <Skeleton width="220px" height={28} />}
        subtitle={
          run ? (
            `${longDate(run.runDate)} · ${relativeDay(run.runDate)} · ${run.agentName || 'unassigned'} · sequenced ${clock(run.sequencedAt)}`
          ) : (
            <div style={{ marginTop: 'var(--s-1)' }}>
              <Skeleton width="340px" height={14} />
            </div>
          )
        }
      >
        {run ? <StatusBadge value={run.status} /> : null}
        <Link to={isAgent ? '/app/my-round' : '/app/runs'} className="btn btn-sm">
          ← Back
        </Link>
      </PageHeader>

      {detail.loading && !run ? (
        <div
          className="card"
          style={{
            marginBottom: 'var(--s-5)',
            display: 'grid',
            gap: 'var(--s-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            padding: 'var(--s-5)',
          }}
          aria-hidden="true"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="col" style={{ gap: 'var(--s-2)' }}>
              <Skeleton width="60%" height={10} />
              <Skeleton width="80%" height={22} />
              <Skeleton width="70%" height={10} />
            </div>
          ))}
        </div>
      ) : null}

      {run ? (
        <div
          className="card"
          style={{
            marginBottom: 'var(--s-5)',
            display: 'grid',
            gap: 'var(--s-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            padding: 'var(--s-5)',
          }}
        >
          <div>
            <div className="section-title">As entered</div>
            <div className="num" style={{ fontWeight: 650 }}>{distance(run.baselineMetres)}</div>
            <div className="hint">Order households were added in</div>
          </div>
          <div>
            <div className="section-title">Nearest neighbour</div>
            <div className="num" style={{ fontWeight: 650 }}>{distance(run.greedyMetres)}</div>
            <div className="hint">Greedy tour before improvement</div>
          </div>
          <div>
            <div className="section-title">After 2-opt</div>
            <div className="num" style={{ fontWeight: 650, color: 'var(--good-600)' }}>
              {distance(run.plannedMetres)}
            </div>
            <div className="hint">{count(run.twoOptSwaps)} improving swaps found</div>
          </div>
          <div>
            <div className="section-title">Saved</div>
            <div className="num" style={{ fontWeight: 650, color: 'var(--good-600)' }}>
              {distance(run.savedMetres)} · {percent(run.savedPercent, 1)}
            </div>
            <div className="hint">Against the as-entered order</div>
          </div>
          <div>
            <div className="section-title">Collected</div>
            <div className="num" style={{ fontWeight: 650 }}>{money(run.collectedValuePaise)}</div>
            <div className="hint">Of {money(run.plannedValuePaise)} on the sheet</div>
          </div>
        </div>
      ) : null}

      <Card flush>
        {detail.loading && !detail.data ? (
          <SkeletonRows rows={6} cols={3} />
        ) : detail.data ? (
          <StopBoard run={run} stops={stops} onUpdate={updateStop} busyId={busyId} />
        ) : null}
      </Card>
    </>
  );
}
