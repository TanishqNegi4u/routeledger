import { useMemo, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAsync } from '../lib/useAsync.js';
import Chart, { baseOptions } from '../components/Chart.jsx';
import {
  Card,
  Empty,
  ErrorState,
  Kpi,
  KpiGrid,
  PageHeader,
  SkeletonRows,
  StatusBadge,
  humanise,
} from '../components/ui.jsx';
import styles from './Dashboard.module.css';
import {
  count,
  daysAgoIso,
  distance,
  money,
  moneyShort,
  percent,
  relativeDay,
  shortDate,
  todayIso,
} from '../lib/format.js';
import { alpha, token } from '../lib/theme.js';

/**
 * Owner/manager home. Restructured so the numbers and the trend both land above the fold:
 * KPI row → revenue trend (hero) → today's round → collections health.
 */

const WINDOWS = [
  { label: '7 days', days: 6 },
  { label: '14 days', days: 13 },
  { label: '30 days', days: 29 },
  { label: '90 days', days: 89 },
];

/**
 * Stop-status accent, as tokens rather than literals — both consumers are DOM styles, so
 * `var()` resolves. ABSENT used to be an off-palette #ef4444; it is --risk-500 now, which is
 * the same red the risk badges and the route map's absent pin already use.
 */
const STATUS_COLOURS = {
  DELIVERED: 'var(--good-500)',
  PENDING: 'var(--warn-500)',
  ABSENT: 'var(--risk-500)',
  SKIPPED: 'var(--n-400)',
};

export default function Dashboard() {
  const { user, business } = useAuth();
  const [windowIndex, setWindowIndex] = useState(1);
  const span = WINDOWS[windowIndex];
  const from = useMemo(() => daysAgoIso(span.days), [span.days]);
  const to = useMemo(() => todayIso(), []);

  const { data, error, loading, reload } = useAsync(
    () => api.dashboard.overview(from, to),
    [from, to],
  );

  const summary = data?.summary;
  const revenueSeries = data?.revenueSeries || [];
  const collectionSeries = data?.collectionSeries || [];
  const todayRuns = data?.todayRuns || [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name ? user.name.split(' ')[0] : 'there';

  const todayBeatsCount = todayRuns.length;
  const todayPlannedValue = todayRuns.reduce((sum, r) => sum + Number(r.plannedValuePaise || 0), 0);
  const outstandingValue = summary?.outstandingPaise || 0;

  const roundState = useMemo(() => {
    if (!summary || todayBeatsCount === 0) return 'UNGENERATED';
    if (summary.todayStops > 0 && summary.todayPendingStops === 0) return 'COMPLETED';
    return 'IN_PROGRESS';
  }, [summary, todayBeatsCount]);

  const contextualCta = useMemo(() => {
    switch (roundState) {
      case 'UNGENERATED':
        return {
          to: '/app/runs',
          label: 'Generate today’s runs',
          className: 'btn btn-primary btn-sm',
          sentence: `No beats generated for today yet — ${money(outstandingValue)} to collect across your book.`,
        };
      case 'COMPLETED':
        return {
          to: '/app/invoices',
          label: 'All rounds complete ✓',
          className: 'btn btn-good btn-sm',
          sentence: `All ${todayBeatsCount} ${
            todayBeatsCount === 1 ? 'beat' : 'beats'
          } complete for today — ${money(summary?.todayRevenuePaise || todayPlannedValue)} delivered, ${money(
            outstandingValue,
          )} to collect.`,
        };
      case 'IN_PROGRESS':
      default:
        return {
          to: '/app/runs',
          label: 'View live progress',
          className: 'btn btn-primary btn-sm',
          sentence: `${todayBeatsCount} ${
            todayBeatsCount === 1 ? 'beat' : 'beats'
          } in progress, ${money(todayPlannedValue)} on the road, ${money(outstandingValue)} to collect.`,
        };
    }
  }, [roundState, todayBeatsCount, todayPlannedValue, outstandingValue, summary]);

  const yesterdayPoint = useMemo(() => {
    if (revenueSeries.length < 2) return null;
    return revenueSeries[revenueSeries.length - 2];
  }, [revenueSeries]);

  const trendData = useMemo(() => {
    const labels = revenueSeries.map((point) => shortDate(point.day));
    const collectedByDay = new Map(collectionSeries.map((point) => [point.day, point.valuePaise]));
    // Canvas cannot read var(), so the palette is resolved from tokens.css at draw time.
    const billed = token('--brand-600', '#4f46e5');
    const collected = token('--good-600', '#059669');
    return {
      labels,
      datasets: [
        {
          label: 'Billed',
          data: revenueSeries.map((point) => Number(point.valuePaise || 0) / 100),
          borderColor: billed,
          backgroundColor: alpha(billed, 0.12),
          borderWidth: 2,
          fill: true,
          tension: 0.32,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: 'Collected',
          data: revenueSeries.map(
            (point) => Number(collectedByDay.get(point.day) || 0) / 100,
          ),
          borderColor: collected,
          backgroundColor: alpha(collected, 0.1),
          borderWidth: 2,
          fill: true,
          tension: 0.32,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    };
  }, [revenueSeries, collectionSeries]);

  const trendOptions = useMemo(
    () =>
      baseOptions({
        tooltipFormatter: (value) => money(Number(value) * 100),
        yAxisFormatter: (value) => moneyShort(Number(value) * 100),
      }),
    [],
  );

  const stopStatus = data?.stopStatus || [];
  const totalStopsCount = useMemo(
    () => stopStatus.reduce((sum, slice) => sum + Number(slice.count || 0), 0),
    [stopStatus],
  );

  const statusSegments = useMemo(() => {
    if (totalStopsCount === 0) return [];
    const order = ['DELIVERED', 'PENDING', 'ABSENT', 'SKIPPED'];
    const sliceMap = new Map(stopStatus.map((s) => [s.status, Number(s.count || 0)]));
    return order
      .map((key) => {
        const countVal = sliceMap.get(key) || 0;
        const pct = (countVal / totalStopsCount) * 100;
        return {
          status: key,
          count: countVal,
          percent: pct,
          color: STATUS_COLOURS[key] || 'var(--brand-400)',
          label: humanise(key),
        };
      })
      .filter((s) => s.count > 0);
  }, [stopStatus, totalStopsCount]);

  if (error) return <ErrorState error={error} onRetry={reload} />;

  const doneRatio =
    summary && summary.todayStops > 0
      ? (summary.todayDelivered / summary.todayStops) * 100
      : 0;

  return (
    <>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={loading && !data ? 'Checking the ledger and today’s round…' : contextualCta.sentence}
      >
        <div className="row" style={{ gap: 'var(--s-2)' }}>
          <Link to={contextualCta.to} className={contextualCta.className}>
            {contextualCta.label}
          </Link>
          <div className="segmented" role="group" aria-label="Date range">
            {WINDOWS.map((option, index) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={index === windowIndex}
                onClick={() => setWindowIndex(index)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      {/* --- ONBOARDING CHECKLIST FOR FRESH SIGNUPS --------------------------- */}
      {summary && summary.activeCustomers === 0 && summary.activeRoutes === 0 ? (
        <div style={{ marginBottom: 'var(--s-6)' }}>
          <Card
            title={`Welcome to RouteLedger${business?.name ? `, ${business.name}` : ''}!`}
            subtitle="Follow these 4 quick steps to set up your business and sequence your first morning delivery round."
          >
            <div className="col" style={{ gap: 'var(--s-4)', padding: 'var(--s-2) 0' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 'var(--s-4)',
                }}
              >
                <div
                  className="col"
                  style={{
                    padding: 'var(--s-4)',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    gap: 'var(--s-2)',
                  }}
                >
                  <div className="row spread">
                    <span className="badge badge-brand">Step 1</span>
                    <span className="faint" aria-hidden="true">◫</span>
                  </div>
                  <strong style={{ fontSize: '0.9375rem' }}>Set catalogue</strong>
                  <p className="hint" style={{ margin: 0, flex: '1 1 auto' }}>
                    Add your products (milk, water, tiffin, etc.) with unit prices.
                  </p>
                  <Link to="/app/products" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--s-2)' }}>
                    Add products →
                  </Link>
                </div>

                <div
                  className="col"
                  style={{
                    padding: 'var(--s-4)',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    gap: 'var(--s-2)',
                  }}
                >
                  <div className="row spread">
                    <span className="badge badge-brand">Step 2</span>
                    <span className="faint" aria-hidden="true">⛢</span>
                  </div>
                  <strong style={{ fontSize: '0.9375rem' }}>Create beats</strong>
                  <p className="hint" style={{ margin: 0, flex: '1 1 auto' }}>
                    Define delivery zones/localities and pinpoint your depot hub.
                  </p>
                  <Link to="/app/beats" className="btn btn-sm" style={{ marginTop: 'var(--s-2)' }}>
                    Create beat →
                  </Link>
                </div>

                <div
                  className="col"
                  style={{
                    padding: 'var(--s-4)',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    gap: 'var(--s-2)',
                  }}
                >
                  <div className="row spread">
                    <span className="badge badge-brand">Step 3</span>
                    <span className="faint" aria-hidden="true">◈</span>
                  </div>
                  <strong style={{ fontSize: '0.9375rem' }}>Add households</strong>
                  <p className="hint" style={{ margin: 0, flex: '1 1 auto' }}>
                    Drop map pins for customer locations and attach standing orders.
                  </p>
                  <Link to="/app/customers" className="btn btn-sm" style={{ marginTop: 'var(--s-2)' }}>
                    Add households →
                  </Link>
                </div>

                <div
                  className="col"
                  style={{
                    padding: 'var(--s-4)',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    gap: 'var(--s-2)',
                  }}
                >
                  <div className="row spread">
                    <span className="badge badge-brand">Step 4</span>
                    <span className="faint" aria-hidden="true">⌗</span>
                  </div>
                  <strong style={{ fontSize: '0.9375rem' }}>Sequence 1st round</strong>
                  <p className="hint" style={{ margin: 0, flex: '1 1 auto' }}>
                    Run 2-opt routing to generate tomorrow's doorstep delivery sheet.
                  </p>
                  <Link to="/app/runs" className="btn btn-sm" style={{ marginTop: 'var(--s-2)' }}>
                    Plan round →
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {/* --- HERO METRICS WITH COMPARISON CONTEXT ----------------------------- */}
      <KpiGrid>
        <Kpi
          label="Today's round"
          glyph="⌗"
          loading={loading}
          value={`${count(summary?.todayDelivered)} / ${count(summary?.todayStops)}`}
          badge={
            summary?.todayStops > 0 ? (
              <span className="badge badge-brand">{percent(doneRatio, 0)}</span>
            ) : null
          }
          foot={
            summary ? (
              <span className="col" style={{ gap: 'var(--s-2)' }}>
                <span className="meter" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, doneRatio)}%` }} />
                </span>
                {`${count(summary.todayPendingStops)} stops pending${
                  summary.pausedToday > 0 ? ` · ${count(summary.pausedToday)} paused` : ''
                }`}
              </span>
            ) : null
          }
        />
        <Kpi
          label="On-road / Billed"
          glyph="₹"
          loading={loading}
          value={money(summary?.todayRevenuePaise || todayPlannedValue)}
          badge={
            yesterdayPoint ? (
              <span className="badge badge-plain">vs {money(yesterdayPoint.valuePaise)} yesterday</span>
            ) : null
          }
          foot={
            summary?.todayRevenuePaise > 0
              ? `${money(summary.todayRevenuePaise)} marked delivered so far`
              : 'Planned value across active beats'
          }
        />
        <Kpi
          label="Outstanding"
          glyph="▲"
          tone={summary?.outstandingPaise > 0 ? 'risk' : 'good'}
          loading={loading}
          value={money(summary?.outstandingPaise)}
          badge={
            summary?.overdueInvoices > 0 ? (
              <span className="badge badge-risk">{count(summary.overdueInvoices)} overdue</span>
            ) : (
              <span className="badge badge-good">Settled</span>
            )
          }
          foot={`${money(summary?.monthCollectedPaise)} collected this month`}
        />
        <Kpi
          label="Distance saved"
          glyph="⇄"
          tone="good"
          loading={loading}
          value={distance(summary?.metresSavedThisMonth)}
          badge={
            summary?.avgSavedPercent > 0 ? (
              <span className="badge badge-good">+{percent(summary.avgSavedPercent, 0)}</span>
            ) : null
          }
          foot={`Optimised vs manual · ${count(summary?.activeRoutes)} active beats`}
        />
      </KpiGrid>

      {/* --- 1. REVENUE TREND (HERO — kept above the fold) -------------------- */}
      <div style={{ marginTop: 'var(--s-5)' }}>
        <Card
          title="Billed against collected"
          subtitle={`${shortDate(from)} to ${shortDate(to)} · rupees per day`}
          actions={
            <Link to="/app/invoices" className="btn btn-sm">
              Invoices
            </Link>
          }
        >
          {loading ? (
            <SkeletonRows rows={4} cols={1} />
          ) : revenueSeries.length === 0 ? (
            <Empty
              glyph="◔"
              title="No billing in this window"
              text="Generate a run and mark a few stops delivered — the curve fills in from the run sheet."
            >
              <Link to="/app/runs" className="btn btn-primary btn-sm">
                Go to runs
              </Link>
            </Empty>
          ) : (
            <Chart
              type="line"
              data={trendData}
              options={trendOptions}
              height={252}
              ariaLabel="Daily billed and collected amounts"
            />
          )}
        </Card>
      </div>

      {/* --- 2. TODAY'S ROUND ------------------------------------------------- */}
      <div className={styles.split}>
        <Card
          title="Today's beats"
          subtitle="Progress per round, straight off the sheet"
          flush
          actions={
            <Link to="/app/runs" className="btn btn-sm">
              All runs
            </Link>
          }
        >
          {loading ? (
            <SkeletonRows rows={3} cols={4} />
          ) : (data?.todayRuns || []).length === 0 ? (
            <Empty
              glyph="⌗"
              title="No runs generated for today"
              text="Sequencing takes a second — plan the round and hand each agent an ordered list."
            >
              <Link to="/app/runs" className="btn btn-primary btn-sm">
                Generate today
              </Link>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Beat</th>
                    <th>Agent</th>
                    <th className="right">Progress</th>
                    <th className="right">Saved</th>
                    <th className="right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.todayRuns.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <Link to={`/app/runs/${run.id}`}>{run.routeName}</Link>
                        <div className="hint">
                          <StatusBadge value={run.status} />
                        </div>
                      </td>
                      <td className="nowrap">{run.agentName || <span className="faint">Unassigned</span>}</td>
                      <td className="right num nowrap">
                        {count(run.completedStops)} / {count(run.totalStops)}
                      </td>
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

        <Card
          title="Today's stops"
          subtitle={
            totalStopsCount > 0
              ? `${count(totalStopsCount)} stops across ${count(todayBeatsCount)} active ${
                  todayBeatsCount === 1 ? 'beat' : 'beats'
                }`
              : 'Every stop on every beat, by status'
          }
        >
          {loading ? (
            <SkeletonRows rows={3} cols={1} />
          ) : totalStopsCount === 0 ? (
            <Empty glyph="◌" title="Nothing planned for today" text="Generate today's runs to see the split.">
              <Link to="/app/runs" className="btn btn-primary btn-sm">
                Generate runs
              </Link>
            </Empty>
          ) : (
            <div className="col" style={{ gap: 'var(--s-5)', padding: 'var(--s-2) 0' }}>
              {/* Stacked horizontal bar */}
              <div
                style={{
                  height: 18,
                  borderRadius: 'var(--r-pill)',
                  background: 'var(--n-150)',
                  display: 'flex',
                  overflow: 'hidden',
                  width: '100%',
                }}
                role="progressbar"
                aria-valuenow={Math.round(doneRatio)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Stop status distribution"
              >
                {statusSegments.map((segment) => (
                  <div
                    key={segment.status}
                    style={{
                      width: `${segment.percent}%`,
                      background: segment.color,
                      height: '100%',
                      transition: 'width var(--duration-slow) var(--ease-out)',
                    }}
                    title={`${segment.label}: ${count(segment.count)} (${percent(segment.percent, 0)})`}
                  />
                ))}
              </div>

              {/* Status breakdown grid with counts and percentages */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
                  gap: 'var(--s-3)',
                }}
              >
                {['DELIVERED', 'PENDING', 'ABSENT', 'SKIPPED'].map((st) => {
                  const slice = stopStatus.find((s) => s.status === st);
                  const countVal = Number(slice?.count || 0);
                  const pct = totalStopsCount > 0 ? (countVal / totalStopsCount) * 100 : 0;
                  return (
                    <div
                      key={st}
                      className="col"
                      style={{
                        gap: '2px',
                        padding: 'var(--s-3)',
                        borderRadius: 'var(--r-sm)',
                        background: 'var(--n-50)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div className="row" style={{ gap: 'var(--s-2)' }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: STATUS_COLOURS[st],
                            flexShrink: 0,
                          }}
                          aria-hidden="true"
                        />
                        <span className="section-title" style={{ fontSize: '0.6875rem' }}>
                          {st}
                        </span>
                      </div>
                      <div className="row spread" style={{ alignItems: 'baseline', marginTop: 'var(--s-1)' }}>
                        <strong className="num" style={{ fontSize: '1.15rem' }}>
                          {count(countVal)}
                        </strong>
                        <span className="hint num">{percent(pct, 0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* --- 3. COLLECTIONS HEALTH -------------------------------------------- */}
      <div className={styles.split}>
        <Card
          title="Chase these first"
          subtitle="Ranked by amount, age, open bills and reachability — not alphabetically"
          flush
          actions={
            <Link to="/app/collections" className="btn btn-sm">
              Full queue
            </Link>
          }
        >
          {loading ? (
            <SkeletonRows rows={5} cols={5} />
          ) : (data?.topDues || []).length === 0 ? (
            <Empty
              glyph="✓"
              title="Nothing outstanding"
              text="Every issued bill is settled. This is the screen you want to be boring."
            >
              <Link to="/app/invoices" className="btn btn-sm">
                View bills
              </Link>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Household</th>
                    <th>Beat</th>
                    <th className="right">Outstanding</th>
                    <th className="right">Oldest bill</th>
                    <th>Bucket</th>
                    <th>Next action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topDues.map((row) => (
                    <tr key={row.customerId}>
                      <td>
                        <Link to={`/app/customers/${row.customerId}`}>{row.customerName}</Link>
                        <div className="hint mono">{row.phone}</div>
                      </td>
                      <td className="nowrap">{row.routeName}</td>
                      <td className="right num nowrap" style={{ fontWeight: 650 }}>
                        {money(row.outstandingPaise)}
                      </td>
                      <td className="right nowrap">
                        {shortDate(row.oldestDueOn)}
                        <div className="hint">{relativeDay(row.oldestDueOn)}</div>
                      </td>
                      <td>
                        <StatusBadge value={row.bucket} />
                      </td>
                      <td className="muted" style={{ fontSize: '0.8125rem' }}>
                        {row.suggestedAction}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="What is moving" subtitle="Top products in the selected window" flush>
          {loading ? (
            <SkeletonRows rows={4} cols={3} />
          ) : (data?.topProducts || []).length === 0 ? (
            <Empty glyph="▤" title="No deliveries yet" text="Product mix appears once stops are marked delivered.">
              <Link to="/app/products" className="btn btn-primary btn-sm">
                View catalogue
              </Link>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="right">Units</th>
                    <th className="right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((product) => (
                    <tr key={product.productName}>
                      <td>{product.productName}</td>
                      <td className="right num">{count(product.quantity)}</td>
                      <td className="right num nowrap">{money(product.valuePaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
