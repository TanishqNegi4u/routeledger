import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { useAsync, useOptimistic, useOfflineQueue, isNetworkError } from '../lib/useAsync.js';
import StopBoard from '../components/StopBoard.jsx';
import RouteMap from '../components/RouteMap.jsx';
import PaymentGatewaySimulator from '../components/PaymentGatewaySimulator.jsx';
import { Card, Empty, ErrorState, PageHeader, Skeleton, SkeletonRows, StatusBadge } from '../components/ui.jsx';
import { count, fromPaise, isoDate, longDate, money, relativeDay, todayIso, toPaise } from '../lib/format.js';

/**
 * The agent's screen. One job: walk the beat top to bottom and tap each door.
 *
 * Status taps are optimistic — the row paints immediately and retries in the background if offline,
 * only rolling back with a toast if the server actively rejects the update.
 */

/** Mirrors RunService: completed counts every stop that is no longer PENDING. */
function reconcile(detail, updatedStop) {
  const stops = detail.stops.map((stop) => (stop.id === updatedStop.id ? updatedStop : stop));
  const touched = stops.filter((stop) => stop.status !== 'PENDING').length;
  const total = Number(detail.run.totalStops || 0);
  const status = touched === 0 ? 'PLANNED' : touched >= total ? 'COMPLETED' : 'IN_PROGRESS';
  return { run: { ...detail.run, completedStops: touched, status }, stops };
}

function shiftDay(iso, delta) {
  const parts = String(iso).split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + delta);
  return isoDate(date);
}

export default function MyRound() {
  const { user } = useAuth();
  const toast = useToast();
  const [date, setDate] = useState(todayIso);
  const [runId, setRunId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [paymentPrompt, setPaymentPrompt] = useState(null);
  const [gatewayTarget, setGatewayTarget] = useState(null);
  const [view, setView] = useState('list');

  const runs = useAsync(() => api.runs.mine(date), [date]);

  useEffect(() => {
    const list = runs.data;
    if (!list || list.length === 0) {
      setRunId(null);
      return;
    }
    setRunId((current) => (list.some((run) => run.id === current) ? current : list[0].id));
  }, [runs.data]);

  const detail = useAsync(() => api.runs.detail(runId), [runId], { skip: !runId });
  const applyOptimistic = useOptimistic(detail.setData);

  const stops = useMemo(() => detail.data?.stops || [], [detail.data]);

  /**
   * Quick-collect lives on the stop row, so a doorstep marked delivered from the map has to
   * hand back to the list for the agent to actually take the cash.
   */
  useEffect(() => {
    if (paymentPrompt) setView('list');
  }, [paymentPrompt]);

  const { enqueue, dequeue, processQueue, syncing, pendingCount } = useOfflineQueue(
    async (item) => {
      const saved = await api.runs.updateStop(item.stopId, item.body);
      if (saved) {
        detail.setData((value) => (value ? reconcile(value, saved) : value));
      }
      return saved;
    },
  );

  const checkCustomerOutstanding = async (stop) => {
    try {
      const cust = await api.customers.get(stop.customerId);
      if (cust && cust.outstandingPaise > 0) {
        setPaymentPrompt({
          stopId: stop.id,
          customerId: stop.customerId,
          customerName: stop.customerName,
          amount: String(fromPaise(cust.outstandingPaise)),
          mode: 'CASH',
          saving: false,
        });
      }
    } catch {
      /* non-blocking */
    }
  };

  const handleRecordPayment = async (event) => {
    event.preventDefault();
    if (!paymentPrompt) return;
    const paise = toPaise(paymentPrompt.amount);
    if (paise <= 0) return;
    setPaymentPrompt((prev) => (prev ? { ...prev, saving: true } : null));
    try {
      const receipt = await api.payments.record({
        customerId: paymentPrompt.customerId,
        invoiceId: null,
        amountPaise: paise,
        mode: paymentPrompt.mode,
        paidOn: todayIso(),
      });
      if (receipt.possibleDuplicate) {
        toast.info(
          'Possible duplicate',
          `A payment of ${money(paise)} was already recorded for ${paymentPrompt.customerName} in the last 5 minutes.`,
        );
      }
      toast.success(
        `Recorded ${money(paise)} from ${paymentPrompt.customerName}`,
        receipt.remainingOutstandingPaise > 0
          ? `${money(receipt.remainingOutstandingPaise)} still open.`
          : `${paymentPrompt.customerName} is fully settled.`,
      );
      setPaymentPrompt(null);
    } catch (error) {
      toast.fromError(error, 'Could not record that payment');
      setPaymentPrompt((prev) => (prev ? { ...prev, saving: false } : null));
    }
  };

  /**
   * Hands the quick-collect prompt over to the sandbox checkout. The prompt stays open behind the
   * sheet so a declined authorisation drops the agent straight back onto the cash form.
   */
  const openGateway = (prompt) => {
    const paise = toPaise(prompt.amount);
    if (paise <= 0) {
      toast.info('Nothing to charge', 'Enter an amount greater than zero first.');
      return;
    }
    setGatewayTarget({ customerId: prompt.customerId, customerName: prompt.customerName, amountPaise: paise });
  };

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
        (failure) => {
          if (isNetworkError(failure)) {
            enqueue({
              stopId,
              body,
              customerName: current.customerName,
              onSuccess: () => {
                toast.success(`Synced stop for ${current.customerName}`);
              },
              onError: (err) => {
                toast.fromError(err, `Sync failed for ${current.customerName}`);
                detail.reload();
              },
            });
            toast.info('Saved offline', 'Weak or no signal — stop saved offline and will sync automatically.');
          } else {
            toast.fromError(failure, 'That stop did not save');
          }
        },
        (failure) => !isNetworkError(failure),
      );
      if (saved) {
        dequeue(stopId);
        detail.setData((value) => reconcile(value, saved));
      }
      if (body.status === 'DELIVERED') {
        checkCustomerOutstanding(current);
      }
    } catch {
      /* handled in applyOptimistic */
    } finally {
      setBusyId(null);
    }
  };

  const list = runs.data || [];
  // A finished round from an earlier day is a record, not a worksheet.
  const readOnlyRound = date !== todayIso() && detail.data?.run?.status === 'COMPLETED';

  return (
    <>
      <PageHeader
        title={`Your round, ${relativeDay(date).toLowerCase()}`}
        subtitle={`${longDate(date)} · ${user?.name || 'Agent'}. Stops are in walking order from the depot — work straight down the list.`}
      >
        <div className="row" style={{ gap: 'var(--s-2)' }}>
          {pendingCount > 0 ? (
            <button
              type="button"
              className="badge badge-warn"
              style={{
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--s-1)',
                padding: 'var(--s-1) var(--s-3)',
              }}
              onClick={() => processQueue()}
              title="Click to retry syncing pending updates now"
            >
              {syncing ? <span className="spinner" style={{ width: 11, height: 11 }} /> : '⚡'}
              <span>{pendingCount} pending sync</span>
            </button>
          ) : null}
          <button type="button" className="btn btn-sm" onClick={() => setDate((d) => shiftDay(d, -1))}>
            ← Yesterday
          </button>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value || todayIso())}
            style={{ width: 'auto' }}
            aria-label="Round date"
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setDate((d) => shiftDay(d, 1))}
            disabled={date >= todayIso()}
          >
            Tomorrow →
          </button>
        </div>
      </PageHeader>

      {runs.error ? <ErrorState error={runs.error} onRetry={runs.reload} /> : null}

      {!runs.error && runs.loading ? (
        <Card flush>
          <SkeletonRows rows={5} cols={3} />
        </Card>
      ) : null}

      {!runs.error && !runs.loading && list.length === 0 ? (
        <Empty
          glyph="◔"
          title="No beat assigned to you for this date"
          text="Either the round has not been generated yet or this beat belongs to another agent. Check with the owner, or look at yesterday."
        />
      ) : null}

      {!runs.error && list.length > 1 ? (
        <div className="segmented" role="group" aria-label="Your beats" style={{ marginBottom: 'var(--s-4)' }}>
          {list.map((run) => (
            <button
              key={run.id}
              type="button"
              aria-pressed={run.id === runId}
              onClick={() => setRunId(run.id)}
            >
              {run.routeName} · {count(run.completedStops)}/{count(run.totalStops)}
            </button>
          ))}
        </div>
      ) : null}

      {list.length > 0 && runId ? (
        <Card
          flush
          title={detail.data?.run?.routeName || <Skeleton width="180px" height={20} />}
          subtitle={
            detail.data?.run
              ? `${detail.data.run.distanceModel === 'ROAD_APPROX' ? 'Road-approximate' : 'Geodesic'} plan, sequenced from the depot`
              : undefined
          }
          actions={
            detail.data?.run ? (
              <div className="row" style={{ gap: 'var(--s-3)' }}>
                <div className="segmented" role="group" aria-label="Round view">
                  <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                    List
                  </button>
                  <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
                    Map
                  </button>
                </div>
                <StatusBadge value={detail.data.run.status} />
              </div>
            ) : null
          }
        >
          {detail.error ? (
            <ErrorState error={detail.error} onRetry={detail.reload} />
          ) : detail.loading && !detail.data ? (
            <SkeletonRows rows={6} cols={3} />
          ) : detail.data ? (
            view === 'map' ? (
              <RouteMap
                stops={stops}
                onDeliver={(stop) => updateStop(stop.id, { status: 'DELIVERED' })}
                busyId={busyId}
                readOnly={readOnlyRound}
                showLive={date === todayIso()}
              />
            ) : (
              <StopBoard
                run={detail.data.run}
                stops={stops}
                onUpdate={updateStop}
                busyId={busyId}
                readOnly={readOnlyRound}
                paymentPrompt={paymentPrompt}
                onDismissPaymentPrompt={() => setPaymentPrompt(null)}
                onRecordPayment={handleRecordPayment}
                onPaymentPromptChange={setPaymentPrompt}
                onCollectViaGateway={openGateway}
              />
            )
          ) : null}
        </Card>
      ) : null}

      <PaymentGatewaySimulator
        open={Boolean(gatewayTarget)}
        amountPaise={gatewayTarget?.amountPaise || 0}
        customerId={gatewayTarget?.customerId}
        invoiceId={null}
        customerName={gatewayTarget?.customerName}
        onClose={() => setGatewayTarget(null)}
        onSuccess={(receipt) => {
          // Booked through the same endpoint the cash form uses, so the prompt's work is done.
          toast.success(
            `${money(gatewayTarget?.amountPaise || 0)} from ${gatewayTarget?.customerName}`,
            receipt?.remainingOutstandingPaise > 0
              ? `${money(receipt.remainingOutstandingPaise)} still open.`
              : `${gatewayTarget?.customerName} is fully settled.`,
          );
          setPaymentPrompt(null);
        }}
      />
    </>
  );
}
