import { useState } from 'react';
import { Link } from '../lib/router.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { useAsync } from '../lib/useAsync.js';
import {
  Card,
  Confirm,
  Drawer,
  Empty,
  ErrorState,
  Field,
  PageHeader,
  Skeleton,
  SkeletonRows,
  StatusBadge,
  SubmitButton,
} from '../components/ui.jsx';
import {
  WEEKDAYS,
  count,
  fromPaise,
  longDate,
  maskToDays,
  money,
  relativeDay,
  shortDate,
  todayIso,
  toPaise,
  toggleMaskBit,
} from '../lib/format.js';
import styles from './Dashboard.module.css';

/**
 * One household, everything about it: standing orders, pause windows, bills and payments.
 * This is the screen an owner opens when a customer phones to complain, so it has to answer
 * "what did you deliver and what do I owe" without another click.
 */

const BLANK_SUB = {
  productId: '',
  quantity: '1',
  frequency: 'DAILY',
  weekdayMask: 127,
  startOn: todayIso(),
  endOn: '',
  active: true,
};

const BLANK_PAUSE = { startOn: todayIso(), endOn: todayIso(), reason: '', subscriptionId: '' };

const BLANK_PAYMENT = { amountPaise: '', mode: 'CASH', paidOn: todayIso(), reference: '', invoiceId: '' };

export default function CustomerDetail({ customerId }) {
  const toast = useToast();
  const { canManage } = useAuth();

  const customer = useAsync(() => api.customers.get(customerId), [customerId]);
  const subscriptions = useAsync(() => api.subscriptions.forCustomer(customerId), [customerId]);
  const pauses = useAsync(() => api.pauses.forCustomer(customerId), [customerId]);
  const invoices = useAsync(() => api.invoices.forCustomer(customerId), [customerId]);
  const payments = useAsync(() => api.payments.forCustomer(customerId), [customerId]);
  const products = useAsync(() => api.products.active(), []);

  const [subDrawer, setSubDrawer] = useState(null);
  const [subForm, setSubForm] = useState(BLANK_SUB);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseForm, setPauseForm] = useState(BLANK_PAUSE);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState(BLANK_PAYMENT);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState({});

  const record = customer.data;

  const refreshMoney = () => {
    invoices.reload();
    payments.reload();
    customer.refresh();
  };

  const openSubCreate = () => {
    setSubDrawer('new');
    setSubForm({ ...BLANK_SUB, productId: products.data?.[0]?.id ?? '' });
    setIssues({});
  };

  const openSubEdit = (subscription) => {
    setSubDrawer(subscription);
    setSubForm({
      productId: subscription.productId,
      quantity: String(subscription.quantity),
      frequency: subscription.frequency,
      weekdayMask: subscription.weekdayMask,
      startOn: subscription.startOn,
      endOn: subscription.endOn || '',
      active: subscription.active,
    });
    setIssues({});
  };

  const saveSub = async (event) => {
    event.preventDefault();
    const found = {};
    if (!subForm.productId) found.productId = 'Pick a product.';
    const quantity = Number.parseInt(subForm.quantity, 10);
    if (!quantity || quantity < 1) found.quantity = 'At least one unit.';
    if (subForm.frequency === 'WEEKLY_DAYS' && Number(subForm.weekdayMask) === 0) {
      found.weekdayMask = 'Pick at least one weekday.';
    }
    if (subForm.endOn && subForm.endOn < subForm.startOn) found.endOn = 'End cannot precede start.';
    setIssues(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    const body = {
      customerId: Number(customerId),
      productId: Number(subForm.productId),
      quantity,
      frequency: subForm.frequency,
      weekdayMask: subForm.frequency === 'WEEKLY_DAYS' ? Number(subForm.weekdayMask) : 127,
      startOn: subForm.startOn,
      endOn: subForm.endOn || null,
      active: subForm.active,
    };
    try {
      if (subDrawer === 'new') {
        await api.subscriptions.create(body);
        toast.success('Standing order added', 'It joins the next generated run.');
      } else {
        await api.subscriptions.update(subDrawer.id, body);
        toast.success('Standing order updated');
      }
      setSubDrawer(null);
      subscriptions.reload();
      customer.refresh();
    } catch (error) {
      toast.fromError(error, 'Could not save that order');
    } finally {
      setBusy(false);
    }
  };

  const toggleSub = async (subscription) => {
    try {
      await api.subscriptions.setActive(subscription.id, !subscription.active);
      subscriptions.reload();
      customer.refresh();
    } catch (error) {
      toast.fromError(error, 'Could not change that order');
    }
  };

  const savePause = async (event) => {
    event.preventDefault();
    const found = {};
    if (!pauseForm.startOn) found.startOn = 'Start date is required.';
    if (!pauseForm.endOn) found.endOn = 'End date is required.';
    if (pauseForm.endOn && pauseForm.startOn && pauseForm.endOn < pauseForm.startOn) {
      found.endOn = 'End cannot precede start.';
    }
    setIssues(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await api.pauses.create({
        customerId: Number(customerId),
        subscriptionId: pauseForm.subscriptionId ? Number(pauseForm.subscriptionId) : null,
        startOn: pauseForm.startOn,
        endOn: pauseForm.endOn,
        reason: pauseForm.reason.trim() || null,
      });
      toast.success('Pause recorded', 'Those dates disappear from the sheet and never reach a bill.');
      setPauseOpen(false);
      setPauseForm(BLANK_PAUSE);
      pauses.reload();
    } catch (error) {
      toast.fromError(error, 'Could not save that pause');
    } finally {
      setBusy(false);
    }
  };

  const removePause = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.pauses.remove(removing.id);
      toast.success('Pause removed');
      setRemoving(null);
      pauses.reload();
    } catch (error) {
      toast.fromError(error, 'Could not remove that pause');
    } finally {
      setBusy(false);
    }
  };

  const savePayment = async (event) => {
    event.preventDefault();
    const paise = toPaise(payForm.amountPaise);
    const found = {};
    if (paise <= 0) found.amountPaise = 'Enter an amount greater than zero.';
    setIssues(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const receipt = await api.payments.record({
        customerId: Number(customerId),
        invoiceId: payForm.invoiceId ? Number(payForm.invoiceId) : null,
        amountPaise: paise,
        mode: payForm.mode,
        paidOn: payForm.paidOn,
        reference: payForm.reference.trim() || null,
      });
      toast.success(
        `${money(paise)} recorded`,
        receipt.remainingOutstandingPaise > 0
          ? `${money(receipt.remainingOutstandingPaise)} still open.`
          : 'This household is fully settled.',
      );
      setPayOpen(false);
      setPayForm(BLANK_PAYMENT);
      refreshMoney();
    } catch (error) {
      toast.fromError(error, 'Could not record that payment');
    } finally {
      setBusy(false);
    }
  };

  if (customer.error) return <ErrorState error={customer.error} onRetry={customer.reload} />;

  return (
    <>
      <PageHeader
        title={record ? record.name : <Skeleton width="200px" height={28} />}
        subtitle={
          record ? (
            `${record.address}${record.landmark ? ` · ${record.landmark}` : ''} · ${record.routeName}`
          ) : (
            <div style={{ marginTop: 'var(--s-1)' }}>
              <Skeleton width="320px" height={14} />
            </div>
          )
        }
      >
        <Link to="/app/customers" className="btn btn-sm">
          ← Book
        </Link>
        {canManage ? (
          <button type="button" className="btn btn-sm" onClick={() => setPayOpen(true)}>
            Record payment
          </button>
        ) : null}
      </PageHeader>

      {customer.loading && !record ? (
        <div
          className="card"
          style={{
            display: 'grid',
            gap: 'var(--s-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            padding: 'var(--s-5)',
          }}
          aria-hidden="true"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="col" style={{ gap: 'var(--s-2)' }}>
              <Skeleton width="60%" height={10} />
              <Skeleton width="80%" height={26} />
              <Skeleton width="70%" height={10} />
            </div>
          ))}
        </div>
      ) : null}

      {record ? (
        <div
          className="card"
          style={{
            display: 'grid',
            gap: 'var(--s-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            padding: 'var(--s-5)',
          }}
        >
          <div>
            <div className="section-title">Outstanding</div>
            <div
              className="num"
              style={{
                fontWeight: 700,
                fontSize: 'var(--t-h3)',
                color: record.outstandingPaise > 0 ? 'var(--risk-600)' : 'var(--good-600)',
              }}
            >
              {money(record.outstandingPaise)}
            </div>
            <div className="hint">
              {record.outstandingPaise > 0 ? 'Across open bills' : 'Nothing pending'}
            </div>
          </div>
          <div>
            <div className="section-title">Monthly value</div>
            <div className="num" style={{ fontWeight: 700, fontSize: 'var(--t-h3)' }}>
              {money(record.monthlyValuePaise)}
            </div>
            <div className="hint">If nothing is paused</div>
          </div>
          <div>
            <div className="section-title">Standing orders</div>
            <div className="num" style={{ fontWeight: 700, fontSize: 'var(--t-h3)' }}>
              {count(record.activeSubscriptions)}
            </div>
            <div className="hint">Active right now</div>
          </div>
          <div>
            <div className="section-title">Phone</div>
            <div className="mono" style={{ fontWeight: 650 }}>
              <a href={`tel:${record.phone}`}>{record.phone}</a>
            </div>
            <div className="hint">Joined {shortDate(record.joinedOn)}</div>
          </div>
          <div>
            <div className="section-title">Status</div>
            <div style={{ marginTop: 2 }}>
              <StatusBadge value={record.active ? 'ACTIVE' : 'INACTIVE'} />
            </div>
            <div className="hint">
              {record.lat == null || record.lng == null
                ? 'No coordinates — served after optimised stops'
                : `Pinned at ${record.lat.toFixed(4)}, ${record.lng.toFixed(4)}`}
            </div>
          </div>
        </div>
      ) : null}

      {record?.notes ? (
        <div className="card" style={{ marginTop: 'var(--s-4)', padding: 'var(--s-4) var(--s-5)' }}>
          <div className="section-title">Private note</div>
          <p style={{ margin: 0, color: 'var(--text-soft)' }}>{record.notes}</p>
        </div>
      ) : null}

      <div style={{ marginTop: 'var(--s-5)' }}>
        <Card
          flush
          title="Standing orders"
          subtitle="What goes to this door, how often. Runs are generated from these rules, never typed by hand."
          actions={
            canManage ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={openSubCreate}>
                Add order
              </button>
            ) : null
          }
        >
          {subscriptions.error ? (
            <ErrorState error={subscriptions.error} onRetry={subscriptions.reload} />
          ) : subscriptions.loading ? (
            <SkeletonRows rows={3} cols={5} />
          ) : (subscriptions.data || []).length === 0 ? (
            <Empty
              glyph="◇"
              title="No standing order yet"
              text="Add one and this household appears on the next generated round automatically."
            >
              {canManage ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={openSubCreate}>
                  Add order
                </button>
              ) : null}
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="right">Qty</th>
                    <th>Schedule</th>
                    <th className="right">Per delivery</th>
                    <th>Window</th>
                    {canManage ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.data.map((sub) => (
                    <tr key={sub.id} className={sub.active ? '' : 'row-dim'}>
                      <td>
                        {sub.productName}
                        <div className="hint">{sub.unitLabel}</div>
                      </td>
                      <td className="right num">{count(sub.quantity)}</td>
                      <td className="nowrap">
                        {sub.weekdayLabel}
                        <div className="hint">{sub.frequency === 'ALTERNATE_DAY' ? 'Every other day from the start date' : sub.frequency === 'DAILY' ? 'Daily' : 'Chosen weekdays'}</div>
                      </td>
                      <td className="right num nowrap">{money(sub.perDeliveryPaise)}</td>
                      <td className="nowrap">
                        {shortDate(sub.startOn)}
                        {sub.endOn ? ` → ${shortDate(sub.endOn)}` : ' → open'}
                      </td>
                      {canManage ? (
                        <td className="right nowrap">
                          <button type="button" className="btn btn-sm" onClick={() => openSubEdit(sub)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => toggleSub(sub)}
                          >
                            {sub.active ? 'Stop' : 'Resume'}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 'var(--s-5)' }}>
        <Card
          flush
          title="Pause windows"
          subtitle="Holidays and travel. Stored in an interval tree, so a date is checked in O(log n) while the sheet is built — paused days never reach a run or a bill."
          actions={
            <button type="button" className="btn btn-sm" onClick={() => { setPauseForm(BLANK_PAUSE); setIssues({}); setPauseOpen(true); }}>
              Add pause
            </button>
          }
        >
          {pauses.error ? (
            <ErrorState error={pauses.error} onRetry={pauses.reload} />
          ) : pauses.loading ? (
            <SkeletonRows rows={2} cols={4} />
          ) : (pauses.data || []).length === 0 ? (
            <Empty
              glyph="⏸"
              title="No pauses on record"
              text="When they travel, add the window here instead of remembering to skip the door."
            />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>To</th>
                    <th className="right">Days</th>
                    <th>Applies to</th>
                    <th>Reason</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pauses.data.map((pause) => (
                    <tr key={pause.id} className={pause.activeNow ? '' : 'row-dim'}>
                      <td className="nowrap">
                        {shortDate(pause.startOn)}
                        {pause.activeNow ? (
                          <div className="hint" style={{ color: 'var(--warn-600)' }}>
                            Paused right now
                          </div>
                        ) : null}
                      </td>
                      <td className="nowrap">{shortDate(pause.endOn)}</td>
                      <td className="right num">{count(pause.days)}</td>
                      <td className="nowrap">
                        {pause.subscriptionLabel || <span className="faint">Every order</span>}
                      </td>
                      <td className="truncate" style={{ maxWidth: 220 }}>
                        {pause.reason || <span className="faint">—</span>}
                      </td>
                      <td className="right nowrap">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setRemoving(pause)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className={styles.duo}>
        <Card flush title="Bills" subtitle="One per billing period, built from delivered stops only">
          {invoices.error ? (
            <ErrorState error={invoices.error} onRetry={invoices.reload} />
          ) : invoices.loading ? (
            <SkeletonRows rows={4} cols={4} />
          ) : (invoices.data || []).length === 0 ? (
            <Empty
              glyph="₹"
              title="No bills yet"
              text="Generate the month's invoices from the Bills screen and this household's copy appears here."
            />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Status</th>
                    <th className="right">Total</th>
                    <th className="right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="nowrap">
                        {canManage ? (
                          <Link to={`/app/invoices/${invoice.id}`}>
                            {shortDate(invoice.periodStart)} – {shortDate(invoice.periodEnd)}
                          </Link>
                        ) : (
                          <span>
                            {shortDate(invoice.periodStart)} – {shortDate(invoice.periodEnd)}
                          </span>
                        )}
                        <div className="hint">
                          Due {shortDate(invoice.dueOn)}
                          {invoice.daysOverdue > 0 ? ` · ${count(invoice.daysOverdue)}d late` : ''}
                        </div>
                      </td>
                      <td>
                        <StatusBadge value={invoice.status} />
                      </td>
                      <td className="right num nowrap">{money(invoice.totalPaise)}</td>
                      <td className="right num nowrap">
                        {invoice.outstandingPaise > 0 ? (
                          <span style={{ color: 'var(--risk-600)', fontWeight: 650 }}>
                            {money(invoice.outstandingPaise)}
                          </span>
                        ) : (
                          <span className="faint">settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          flush
          title="Payments"
          subtitle="Newest first. A payment with no bill attached settles the oldest open one."
          actions={
            canManage ? (
              <button
                type="button"
                className="btn btn-sm btn-good"
                onClick={() => { setPayForm(BLANK_PAYMENT); setIssues({}); setPayOpen(true); }}
              >
                Record
              </button>
            ) : null
          }
        >
          {payments.error ? (
            <ErrorState error={payments.error} onRetry={payments.reload} />
          ) : payments.loading ? (
            <SkeletonRows rows={4} cols={3} />
          ) : (payments.data || []).length === 0 ? (
            <Empty
              glyph="✓"
              title="Nothing collected yet"
              text="Cash at the door, UPI, a bank transfer — record it here and every balance moves at once."
            />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Paid on</th>
                    <th>Mode</th>
                    <th>Against</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.data.map((payment) => (
                    <tr key={payment.id}>
                      <td className="nowrap">
                        {shortDate(payment.paidOn)}
                        <div className="hint">{relativeDay(payment.paidOn)}</div>
                      </td>
                      <td className="nowrap">
                        {payment.mode}
                        {payment.reference ? <div className="hint mono">{payment.reference}</div> : null}
                      </td>
                      <td className="nowrap">
                        {payment.invoiceId ? `Bill #${payment.invoiceId}` : <span className="faint">Oldest open</span>}
                      </td>
                      <td className="right num nowrap" style={{ color: 'var(--good-600)', fontWeight: 650 }}>
                        {money(payment.amountPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Drawer
        open={Boolean(subDrawer)}
        title={subDrawer === 'new' ? 'Add standing order' : 'Edit standing order'}
        subtitle="Runs are generated from this rule every night, so a change here changes tomorrow's sheet."
        onClose={() => setSubDrawer(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setSubDrawer(null)} disabled={busy}>
              Cancel
            </button>
            <SubmitButton busy={busy} form="sub-form">
              {subDrawer === 'new' ? 'Add order' : 'Save changes'}
            </SubmitButton>
          </>
        }
      >
        <form id="sub-form" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={saveSub} noValidate>
          <Field label="Product" htmlFor="productId" error={issues.productId}>
            <select
              id="productId"
              className="select"
              value={subForm.productId}
              onChange={(event) => setSubForm((c) => ({ ...c, productId: event.target.value }))}
            >
              <option value="">Choose a product…</option>
              {(products.data || []).map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {money(product.pricePaise)} / {product.unitLabel}
                </option>
              ))}
            </select>
          </Field>

          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Quantity" htmlFor="quantity" error={issues.quantity}>
              <input
                id="quantity"
                className="input"
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                value={subForm.quantity}
                onChange={(event) => setSubForm((c) => ({ ...c, quantity: event.target.value }))}
              />
            </Field>
            <Field label="Frequency" htmlFor="frequency">
              <select
                id="frequency"
                className="select"
                value={subForm.frequency}
                onChange={(event) => setSubForm((c) => ({ ...c, frequency: event.target.value }))}
              >
                <option value="DAILY">Every day</option>
                <option value="ALTERNATE_DAY">Alternate days</option>
                <option value="WEEKLY_DAYS">Chosen weekdays</option>
              </select>
            </Field>
          </div>

          {subForm.frequency === 'WEEKLY_DAYS' ? (
            <Field
              label="Weekdays"
              error={issues.weekdayMask}
              hint={`Currently: ${maskToDays(Number(subForm.weekdayMask))}`}
            >
              <div className="segmented" role="group" aria-label="Delivery weekdays">
                {WEEKDAYS.map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={(Number(subForm.weekdayMask) & (1 << index)) !== 0}
                    onClick={() =>
                      setSubForm((c) => ({ ...c, weekdayMask: toggleMaskBit(Number(c.weekdayMask), index) }))
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}

          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Starts on" htmlFor="startOn">
              <input
                id="startOn"
                className="input"
                type="date"
                value={subForm.startOn}
                onChange={(event) => setSubForm((c) => ({ ...c, startOn: event.target.value }))}
                required
              />
            </Field>
            <Field label="Ends on" htmlFor="endOn" error={issues.endOn} hint="Leave blank for open-ended">
              <input
                id="endOn"
                className="input"
                type="date"
                value={subForm.endOn}
                onChange={(event) => setSubForm((c) => ({ ...c, endOn: event.target.value }))}
              />
            </Field>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={subForm.active}
              onChange={(event) => setSubForm((c) => ({ ...c, active: event.target.checked }))}
            />
            <span>
              Active
              <span className="hint" style={{ display: 'block' }}>
                An inactive order keeps its history but stops appearing on new sheets.
              </span>
            </span>
          </label>
        </form>
      </Drawer>

      <Drawer
        open={pauseOpen}
        title="Add a pause"
        subtitle="Both dates are included. The interval is indexed on save, so tonight's run generation already knows about it."
        onClose={() => setPauseOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setPauseOpen(false)} disabled={busy}>
              Cancel
            </button>
            <SubmitButton busy={busy} form="pause-form">
              Save pause
            </SubmitButton>
          </>
        }
      >
        <form id="pause-form" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={savePause} noValidate>
          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="From" htmlFor="pauseStart" error={issues.startOn}>
              <input
                id="pauseStart"
                className="input"
                type="date"
                value={pauseForm.startOn}
                onChange={(event) => setPauseForm((c) => ({ ...c, startOn: event.target.value }))}
                required
              />
            </Field>
            <Field label="To" htmlFor="pauseEnd" error={issues.endOn}>
              <input
                id="pauseEnd"
                className="input"
                type="date"
                value={pauseForm.endOn}
                onChange={(event) => setPauseForm((c) => ({ ...c, endOn: event.target.value }))}
                required
              />
            </Field>
          </div>

          <Field
            label="Applies to"
            htmlFor="pauseSub"
            hint="Leave on every order unless they are only stopping one item"
          >
            <select
              id="pauseSub"
              className="select"
              value={pauseForm.subscriptionId}
              onChange={(event) => setPauseForm((c) => ({ ...c, subscriptionId: event.target.value }))}
            >
              <option value="">Every order for this household</option>
              {(subscriptions.data || []).map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.productName} × {sub.quantity}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Reason" htmlFor="pauseReason" hint="Optional, 120 characters">
            <input
              id="pauseReason"
              className="input"
              maxLength={120}
              value={pauseForm.reason}
              onChange={(event) => setPauseForm((c) => ({ ...c, reason: event.target.value }))}
              placeholder="Out of town for Diwali"
            />
          </Field>
        </form>
      </Drawer>

      <Drawer
        open={payOpen}
        title="Record a payment"
        subtitle="Money in. Bills settle oldest first unless you point this at one."
        onClose={() => setPayOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setPayOpen(false)} disabled={busy}>
              Cancel
            </button>
            <SubmitButton busy={busy} form="pay-form" className="btn btn-good">
              Record payment
            </SubmitButton>
          </>
        }
      >
        <form id="pay-form" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={savePayment} noValidate>
          <Field label="Amount in ₹" htmlFor="amount" error={issues.amountPaise}>
            <input
              id="amount"
              className="input"
              inputMode="decimal"
              value={payForm.amountPaise}
              onChange={(event) => setPayForm((c) => ({ ...c, amountPaise: event.target.value }))}
              placeholder="1250"
              autoComplete="off"
            />
          </Field>

          {record && record.outstandingPaise > 0 ? (
            <button
              type="button"
              className="btn btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() =>
                setPayForm((c) => ({ ...c, amountPaise: String(fromPaise(record.outstandingPaise)) }))
              }
            >
              Settle everything · {money(record.outstandingPaise)}
            </button>
          ) : null}

          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Mode" htmlFor="mode">
              <select
                id="mode"
                className="select"
                value={payForm.mode}
                onChange={(event) => setPayForm((c) => ({ ...c, mode: event.target.value }))}
              >
                <option value="CASH">Cash at the door</option>
                <option value="UPI">UPI</option>
                <option value="BANK">Bank transfer</option>
                <option value="ADJUSTMENT">Adjustment / waiver</option>
              </select>
            </Field>
            <Field label="Paid on" htmlFor="paidOn">
              <input
                id="paidOn"
                className="input"
                type="date"
                value={payForm.paidOn}
                onChange={(event) => setPayForm((c) => ({ ...c, paidOn: event.target.value }))}
                required
              />
            </Field>
          </div>

          <Field label="Against bill" htmlFor="invoiceId" hint="Leave blank to settle the oldest open bill first">
            <select
              id="invoiceId"
              className="select"
              value={payForm.invoiceId}
              onChange={(event) => setPayForm((c) => ({ ...c, invoiceId: event.target.value }))}
            >
              <option value="">Oldest open bill</option>
              {(invoices.data || [])
                .filter((invoice) => invoice.outstandingPaise > 0)
                .map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    #{invoice.id} · {shortDate(invoice.periodStart)}–{shortDate(invoice.periodEnd)} ·{' '}
                    {money(invoice.outstandingPaise)} open
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Reference" htmlFor="reference" hint="UPI id, cheque number, or who took the cash">
            <input
              id="reference"
              className="input"
              maxLength={60}
              value={payForm.reference}
              onChange={(event) => setPayForm((c) => ({ ...c, reference: event.target.value }))}
              placeholder="UPI 4821"
            />
          </Field>
        </form>
      </Drawer>

      <Confirm
        open={Boolean(removing)}
        title="Remove this pause?"
        text={
          removing
            ? `${longDate(removing.startOn)} to ${longDate(removing.endOn)} becomes deliverable again. Runs already generated for those dates are not rebuilt automatically.`
            : ''
        }
        confirmLabel="Remove pause"
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={removePause}
      />
    </>
  );
}
