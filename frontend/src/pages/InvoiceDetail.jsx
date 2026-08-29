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
import { count, fromPaise, longDate, money, moneyExact, shortDate, todayIso, toPaise } from '../lib/format.js';
import PaymentGatewaySimulator from '../components/PaymentGatewaySimulator.jsx';
import styles from './Dashboard.module.css';

/**
 * One bill, printable. The line items are the audit trail: each one came from a stop an agent marked
 * delivered, so an owner can defend every rupee on the page during a doorstep argument.
 */

export default function InvoiceDetail({ invoiceId }) {
  const toast = useToast();
  const { business } = useAuth();

  const invoice = useAsync(() => api.invoices.get(invoiceId), [invoiceId]);
  const payments = useAsync(() => api.invoices.payments(invoiceId), [invoiceId]);

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amountPaise: '', mode: 'CASH', paidOn: todayIso(), reference: '' });
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ amount: '', reason: '', sign: 'WAIVE' });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [gatewayOpen, setGatewayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState({});

  const bill = invoice.data;

  const refresh = () => {
    invoice.refresh();
    payments.reload();
  };

  const openPay = () => {
    setPayForm({
      amountPaise: bill && bill.outstandingPaise > 0 ? String(fromPaise(bill.outstandingPaise)) : '',
      mode: 'CASH',
      paidOn: todayIso(),
      reference: '',
    });
    setIssues({});
    setPayOpen(true);
  };

  const savePayment = async (event) => {
    event.preventDefault();
    const paise = toPaise(payForm.amountPaise);
    if (paise <= 0) {
      setIssues({ amountPaise: 'Enter an amount greater than zero.' });
      return;
    }
    setIssues({});
    setBusy(true);
    try {
      const receipt = await api.payments.record({
        customerId: bill.customerId,
        invoiceId: bill.id,
        amountPaise: paise,
        mode: payForm.mode,
        paidOn: payForm.paidOn,
        reference: payForm.reference.trim() || null,
      });
      toast.success(
        `${money(paise)} recorded`,
        receipt.remainingOutstandingPaise > 0
          ? `${money(receipt.remainingOutstandingPaise)} still open for this household.`
          : 'This household is fully settled.',
      );
      setPayOpen(false);
      refresh();
    } catch (error) {
      toast.fromError(error, 'Could not record that payment');
    } finally {
      setBusy(false);
    }
  };

  const saveAdjust = async (event) => {
    event.preventDefault();
    const magnitude = toPaise(adjustForm.amount);
    if (magnitude <= 0) {
      setIssues({ amount: 'Enter an amount greater than zero.' });
      return;
    }
    if (!adjustForm.reason.trim()) {
      setIssues({ reason: 'Say why — this stays on the bill.' });
      return;
    }
    const paise = adjustForm.sign === 'CHARGE' ? magnitude : -magnitude;
    setIssues({});
    setBusy(true);
    try {
      await api.invoices.adjust(bill.id, {
        adjustmentPaise: paise,
        reason: adjustForm.reason.trim(),
      });
      toast.success(
        'Bill adjusted',
        `${adjustForm.sign === 'CHARGE' ? 'Charge of' : 'Waiver of'} ${money(magnitude)} applied and the balance recalculated.`,
      );
      setAdjustOpen(false);
      setAdjustForm({ amount: '', reason: '', sign: 'WAIVE' });
      refresh();
    } catch (error) {
      toast.fromError(error, 'Could not adjust that bill');
    } finally {
      setBusy(false);
    }
  };

  const cancelBill = async () => {
    setBusy(true);
    try {
      await api.invoices.cancel(bill.id);
      toast.success(`Bill #${bill.id} cancelled`, 'It stays in the ledger marked void.');
      setCancelOpen(false);
      refresh();
    } catch (error) {
      toast.fromError(error, 'Could not cancel that bill');
    } finally {
      setBusy(false);
    }
  };

  if (invoice.error) return <ErrorState error={invoice.error} onRetry={invoice.reload} />;

  return (
    <>
      <PageHeader
        title={bill ? `Bill #${bill.id}` : <Skeleton width="160px" height={28} />}
        subtitle={
          bill ? (
            `${bill.customerName} · ${shortDate(bill.periodStart)} to ${shortDate(bill.periodEnd)} · due ${shortDate(bill.dueOn)}`
          ) : (
            <div style={{ marginTop: 'var(--s-1)' }}>
              <Skeleton width="300px" height={14} />
            </div>
          )
        }
      >
        {bill ? <StatusBadge value={bill.status} /> : null}
        <Link to="/app/invoices" className="btn btn-sm">
          ← Ledger
        </Link>
        <button type="button" className="btn btn-sm" onClick={() => window.print()}>
          Print
        </button>
        {bill && bill.status !== 'VOID' ? (
          <>
            <button type="button" className="btn btn-sm" onClick={() => setAdjustOpen(true)}>
              Adjust
            </button>
            {bill.outstandingPaise > 0 ? (
              <>
                {/* Sandbox gateway. Sits beside the manual form, never in place of it — cash at
                    the door is still the common case. */}
                <button type="button" className="btn btn-sm" onClick={() => setGatewayOpen(true)}>
                  Collect via UPI link
                </button>
                <button type="button" className="btn btn-sm btn-good" onClick={openPay}>
                  Record payment
                </button>
              </>
            ) : null}
          </>
        ) : null}
      </PageHeader>

      {invoice.loading && !bill ? (
        <Card>
          <SkeletonRows rows={5} cols={4} />
        </Card>
      ) : null}

      {bill ? (
        <Card flush>
          <div className="card-body">
            <div className="spread wrap" style={{ gap: 'var(--s-4)', alignItems: 'flex-start' }}>
              <div>
                <div className="section-title">From</div>
                <strong style={{ fontSize: 'var(--t-h3)' }}>{business?.name || 'RouteLedger'}</strong>
                <div className="hint">
                  {business?.ownerName ? `${business.ownerName} · ` : ''}
                  {business?.city || ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="section-title">Billed to</div>
                <strong style={{ fontSize: 'var(--t-h3)' }}>
                  <Link to={`/app/customers/${bill.customerId}`}>{bill.customerName}</Link>
                </strong>
                <div className="hint">{bill.address}</div>
                <div className="hint mono">{bill.phone}</div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 'var(--s-4)',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                marginTop: 'var(--s-5)',
                paddingTop: 'var(--s-4)',
                borderTop: '1px solid var(--border)',
              }}
            >
              <div>
                <div className="section-title">Period</div>
                <div style={{ fontWeight: 650 }}>
                  {shortDate(bill.periodStart)} – {shortDate(bill.periodEnd)}
                </div>
              </div>
              <div>
                <div className="section-title">Issued</div>
                <div style={{ fontWeight: 650 }}>{longDate(bill.issuedOn)}</div>
              </div>
              <div>
                <div className="section-title">Due</div>
                <div style={{ fontWeight: 650 }}>
                  {longDate(bill.dueOn)}
                  {bill.daysOverdue > 0 ? (
                    <span style={{ color: 'var(--risk-600)' }}> · {count(bill.daysOverdue)}d late</span>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="section-title">Balance</div>
                <div
                  className="num"
                  style={{
                    fontWeight: 700,
                    color: bill.outstandingPaise > 0 ? 'var(--risk-600)' : 'var(--good-600)',
                  }}
                >
                  {money(bill.outstandingPaise)}
                </div>
              </div>
            </div>
          </div>

          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="right">Delivered</th>
                  <th className="right">Rate</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(bill.lines || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="faint" style={{ textAlign: 'center' }}>
                      No delivered stops in this period — this bill only carries an adjustment.
                    </td>
                  </tr>
                ) : null}
                {(bill.lines || []).map((line) => (
                  <tr key={line.id}>
                    <td>{line.productName}</td>
                    <td className="right num">{count(line.quantity)}</td>
                    <td className="right num nowrap">{moneyExact(line.unitPricePaise)}</td>
                    <td className="right num nowrap">{moneyExact(line.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card-foot" style={{ justifyContent: 'flex-end' }}>
            <div className="col" style={{ gap: 'var(--s-2)', minWidth: 260 }}>
              <div className="spread">
                <span className="muted">Subtotal</span>
                <span className="num">{moneyExact(bill.subtotalPaise)}</span>
              </div>
              {bill.adjustmentPaise !== 0 ? (
                <div className="spread">
                  <span className="muted">Adjustment</span>
                  <span className="num">{moneyExact(bill.adjustmentPaise)}</span>
                </div>
              ) : null}
              <div className="spread" style={{ paddingTop: 'var(--s-2)', borderTop: '1px solid var(--border)' }}>
                <strong>Total</strong>
                <strong className="num">{moneyExact(bill.totalPaise)}</strong>
              </div>
              <div className="spread">
                <span className="muted">Paid</span>
                <span className="num" style={{ color: 'var(--good-600)' }}>
                  {moneyExact(bill.paidPaise)}
                </span>
              </div>
              <div
                className="spread"
                style={{ paddingTop: 'var(--s-2)', borderTop: '1px solid var(--border)' }}
              >
                <strong>Balance due</strong>
                <strong
                  className="num"
                  style={{ color: bill.outstandingPaise > 0 ? 'var(--risk-600)' : 'var(--good-600)' }}
                >
                  {moneyExact(bill.outstandingPaise)}
                </strong>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <div style={{ marginTop: 'var(--s-5)' }}>
        <Card
          flush
          title="Payments against this bill"
          subtitle="A payment recorded without a bill lands on the oldest open one, so it may appear here too."
          actions={
            bill && bill.status !== 'VOID' ? (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCancelOpen(true)}>
                Cancel bill
              </button>
            ) : null
          }
        >
          {payments.error ? (
            <ErrorState error={payments.error} onRetry={payments.reload} />
          ) : payments.loading ? (
            <SkeletonRows rows={3} cols={4} />
          ) : (payments.data || []).length === 0 ? (
            <Empty
              glyph="◔"
              title="Nothing collected against this bill"
              text="Record cash at the door, a UPI transfer, or a waiver as an adjustment."
            />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Paid on</th>
                    <th>Mode</th>
                    <th>Reference</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.data.map((payment) => (
                    <tr key={payment.id}>
                      <td className="nowrap">{shortDate(payment.paidOn)}</td>
                      <td className="nowrap">{payment.mode}</td>
                      <td className="mono">{payment.reference || <span className="faint">—</span>}</td>
                      <td className="right num nowrap" style={{ color: 'var(--good-600)', fontWeight: 650 }}>
                        {moneyExact(payment.amountPaise)}
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
        open={payOpen}
        title="Record a payment"
        subtitle={bill ? `Against bill #${bill.id} · ${money(bill.outstandingPaise)} open` : ''}
        onClose={() => setPayOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setPayOpen(false)} disabled={busy}>
              Cancel
            </button>
            <SubmitButton busy={busy} form="bill-pay-form" className="btn btn-good">
              Record payment
            </SubmitButton>
          </>
        }
      >
        <form id="bill-pay-form" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={savePayment} noValidate>
          <Field label="Amount in ₹" htmlFor="billAmount" error={issues.amountPaise}>
            <input
              id="billAmount"
              className="input"
              inputMode="decimal"
              value={payForm.amountPaise}
              onChange={(event) => setPayForm((c) => ({ ...c, amountPaise: event.target.value }))}
              autoComplete="off"
              required
            />
          </Field>
          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Mode" htmlFor="billMode">
              <select
                id="billMode"
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
            <Field label="Paid on" htmlFor="billPaidOn">
              <input
                id="billPaidOn"
                className="input"
                type="date"
                value={payForm.paidOn}
                onChange={(event) => setPayForm((c) => ({ ...c, paidOn: event.target.value }))}
                required
              />
            </Field>
          </div>
          <Field label="Reference" htmlFor="billRef" hint="UPI id, cheque number, or who took the cash">
            <input
              id="billRef"
              className="input"
              maxLength={60}
              value={payForm.reference}
              onChange={(event) => setPayForm((c) => ({ ...c, reference: event.target.value }))}
            />
          </Field>
        </form>
      </Drawer>

      <Drawer
        open={adjustOpen}
        title="Adjust this bill"
        subtitle="A waiver for spoiled milk, or a charge for something delivered off-book. The reason is stored with the bill."
        onClose={() => setAdjustOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setAdjustOpen(false)} disabled={busy}>
              Cancel
            </button>
            <SubmitButton busy={busy} form="adjust-form">
              Apply adjustment
            </SubmitButton>
          </>
        }
      >
        <form id="adjust-form" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={saveAdjust} noValidate>
          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Direction" htmlFor="adjustSign">
              <select
                id="adjustSign"
                className="select"
                value={adjustForm.sign || 'WAIVE'}
                onChange={(event) => setAdjustForm((c) => ({ ...c, sign: event.target.value }))}
              >
                <option value="WAIVE">Waive — reduce the bill</option>
                <option value="CHARGE">Charge — add to the bill</option>
              </select>
            </Field>
            <Field label="Amount in ₹" htmlFor="adjustAmount" error={issues.amount}>
              <input
                id="adjustAmount"
                className="input"
                inputMode="decimal"
                value={adjustForm.amount}
                onChange={(event) => setAdjustForm((c) => ({ ...c, amount: event.target.value }))}
                placeholder="120"
                required
              />
            </Field>
          </div>

          <Field label="Reason" htmlFor="adjustReason" error={issues.reason} hint="Shown on the bill, 160 characters">
            <textarea
              id="adjustReason"
              className="textarea"
              rows={3}
              maxLength={160}
              value={adjustForm.reason}
              onChange={(event) => setAdjustForm((c) => ({ ...c, reason: event.target.value }))}
              placeholder="Two litres soured on 14th, waived"
              required
            />
          </Field>

          {bill && toPaise(adjustForm.amount) > 0 ? (
            <div className="card" style={{ background: 'var(--surface-sunken)' }}>
              <div className="card-body col" style={{ gap: 'var(--s-2)' }}>
                <span className="section-title">After this adjustment</span>
                <span className="num" style={{ fontWeight: 650 }}>
                  {moneyExact(
                    bill.subtotalPaise +
                      (adjustForm.sign === 'CHARGE' ? toPaise(adjustForm.amount) : -toPaise(adjustForm.amount)),
                  )}{' '}
                  total
                </span>
                <span className="hint">
                  The adjustment replaces any previous one on this bill rather than stacking on top of it.
                </span>
              </div>
            </div>
          ) : null}
        </form>
      </Drawer>

      <Confirm
        open={cancelOpen}
        title={bill ? `Cancel bill #${bill.id}?` : 'Cancel bill?'}
        text="The bill is marked void and stops counting towards dues. Payments already recorded against it stay on the household's ledger. This cannot be undone from the app."
        confirmLabel="Cancel this bill"
        busy={busy}
        onCancel={() => setCancelOpen(false)}
        onConfirm={cancelBill}
      />

      <PaymentGatewaySimulator
        open={gatewayOpen && Boolean(bill)}
        amountPaise={bill?.outstandingPaise || 0}
        customerId={bill?.customerId}
        invoiceId={bill?.id ?? null}
        customerName={bill?.customerName}
        onClose={() => setGatewayOpen(false)}
        onSuccess={refresh}
      />
    </>
  );
}
