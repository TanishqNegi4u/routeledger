import { useState } from 'react';
import { Link } from '../lib/router.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
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
  SkeletonRows,
  StatusBadge,
  SubmitButton,
} from '../components/ui.jsx';
import { count, fromPaise, money, percent, shortDate, todayIso, toPaise } from '../lib/format.js';
import PaymentGatewaySimulator from '../components/PaymentGatewaySimulator.jsx';
import styles from './Dashboard.module.css';

/**
 * The chase list. Ranked by a max-heap on the server: risk is a blend of how much is owed, how long
 * it has been owed and how many bills are open, so the top of this list is genuinely the best use of
 * the next ten phone calls.
 */

const LIMITS = [25, 50, 100];

export default function Collections() {
  const toast = useToast();
  const { canManage } = useAuth();
  const [limit, setLimit] = useState(25);
  const [target, setTarget] = useState(null);
  const [gatewayTarget, setGatewayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ amountPaise: '', mode: 'UPI', paidOn: todayIso(), reference: '' });
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState({});

  const dues = useAsync(() => api.collections.dues(limit), [limit]);

  const openPay = (row) => {
    setTarget(row);
    setPayForm({
      amountPaise: String(fromPaise(row.outstandingPaise)),
      mode: 'UPI',
      paidOn: todayIso(),
      reference: '',
    });
    setIssues({});
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
        customerId: target.customerId,
        invoiceId: null,
        amountPaise: paise,
        mode: payForm.mode,
        paidOn: payForm.paidOn,
        reference: payForm.reference.trim() || null,
      });
      if (receipt.possibleDuplicate) {
        toast.info(
          'Possible duplicate',
          `A payment of ${money(paise)} was already recorded for ${target.customerName} in the last 5 minutes.`,
        );
      }
      toast.success(
        `${money(paise)} from ${target.customerName}`,
        receipt.remainingOutstandingPaise > 0
          ? `${money(receipt.remainingOutstandingPaise)} still open · ${count(receipt.settledInvoiceIds?.length || 0)} bill(s) closed.`
          : 'Fully settled — they drop off this list.',
      );
      const paidCustomerId = target.customerId;
      setTarget(null);
      dues.setData((current) => {
        if (!current || !current.rows) return current;
        const remaining = Number(receipt.remainingOutstandingPaise || 0);
        const updatedRows = current.rows
          .map((r) =>
            r.customerId === paidCustomerId
              ? remaining > 0
                ? { ...r, outstandingPaise: remaining }
                : null
              : r,
          )
          .filter(Boolean);
        return {
          ...current,
          rows: updatedRows,
          customersOwing: updatedRows.length,
          totalOutstandingPaise: Math.max(0, Number(current.totalOutstandingPaise || 0) - paise),
        };
      });
    } catch (error) {
      toast.fromError(error, 'Could not record that payment');
    } finally {
      setBusy(false);
    }
  };

  const data = dues.data;
  const rows = data?.rows || [];

  return (
    <>
      <PageHeader
        title="Collections"
        subtitle="Who to call first. Ranked by a from-scratch max-heap on a risk score, not by name or by date — the top ten calls here recover the most money per minute."
      >
        <div className="row" style={{ gap: 'var(--s-2)' }}>
          <span className="hint">Show</span>
          <select
            className="select"
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            aria-label="How many households to rank"
            style={{ width: 'auto' }}
          >
            {LIMITS.map((option) => (
              <option key={option} value={option}>
                Top {option}
              </option>
            ))}
          </select>
        </div>
      </PageHeader>

      <KpiGrid>
        <Kpi
          label="Total outstanding"
          glyph="₹"
          tone={data && data.totalOutstandingPaise > 0 ? 'warn' : 'good'}
          loading={dues.loading}
          value={money(data?.totalOutstandingPaise)}
          foot="Across every open bill"
        />
        <Kpi
          label="Households owing"
          glyph="◈"
          loading={dues.loading}
          value={count(data?.customersOwing)}
          foot={`Showing the top ${count(rows.length)} by risk`}
        />
        <Kpi
          label="Over 30 days"
          glyph="▲"
          tone="risk"
          loading={dues.loading}
          value={money(data?.overdue30Paise)}
          foot={
            data && data.totalOutstandingPaise > 0
              ? `${percent((Number(data.overdue30Paise) / Number(data.totalOutstandingPaise)) * 100, 0)} of the book`
              : 'Nothing aged yet'
          }
        />
        <Kpi
          label="Over 60 days"
          glyph="⚑"
          tone="risk"
          loading={dues.loading}
          value={money(data?.overdue60Paise)}
          foot="Treat as at-risk revenue"
        />
      </KpiGrid>

      <div style={{ marginTop: 'var(--s-5)' }}>
        <Card
          flush
          title="Chase list"
          subtitle="Risk blends amount owed, age of the oldest bill and how many bills are open. Highest first."
        >
          {dues.error ? (
            <ErrorState error={dues.error} onRetry={dues.reload} />
          ) : dues.loading ? (
            <SkeletonRows rows={8} cols={6} />
          ) : rows.length === 0 ? (
            <Empty
              glyph="✓"
              title="Nobody owes you anything"
              text="Every bill on the book is settled. Generate the next period from the Bills screen when the round is delivered."
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
                    <th>#</th>
                    <th>Household</th>
                    <th>Beat</th>
                    <th className="right">Outstanding</th>
                    <th className="right">Age</th>
                    <th>Risk</th>
                    <th>Next step</th>
                    {canManage ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.customerId}>
                      <td className="num faint">{index + 1}</td>
                      <td>
                        <Link to={`/app/customers/${row.customerId}`}>{row.customerName}</Link>
                        <div className="hint mono">
                          <a href={`tel:${row.phone}`}>{row.phone}</a>
                        </div>
                      </td>
                      <td className="nowrap">{row.routeName}</td>
                      <td className="right num nowrap">
                        <span style={{ color: 'var(--risk-600)', fontWeight: 650 }}>
                          {money(row.outstandingPaise)}
                        </span>
                        <div className="hint">{count(row.openInvoices)} open bill(s)</div>
                      </td>
                      <td className="right num nowrap">
                        {count(row.daysOverdue)}d
                        <div className="hint">oldest due {shortDate(row.oldestDueOn)}</div>
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <StatusBadge value={row.bucket} />
                        <div className="meter" style={{ marginTop: 'var(--s-2)' }}>
                          <span style={{ width: `${Math.max(4, Math.min(100, row.riskScore))}%` }} />
                        </div>
                        <div className="hint num">score {row.riskScore.toFixed(1)}</div>
                      </td>
                      <td style={{ maxWidth: 260 }}>{row.suggestedAction}</td>
                      {canManage ? (
                        <td className="right nowrap">
                          <div className="row" style={{ gap: 'var(--s-2)', justifyContent: 'flex-end' }}>
                            {/* Sandbox gateway alongside manual entry — cash still needs the form. */}
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => setGatewayTarget(row)}
                            >
                              UPI link
                            </button>
                            <button type="button" className="btn btn-sm btn-good" onClick={() => openPay(row)}>
                              Record Payment
                            </button>
                          </div>
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

      <Drawer
        open={Boolean(target)}
        title={target ? `Collect from ${target.customerName}` : 'Collect'}
        subtitle={
          target
            ? `${money(target.outstandingPaise)} across ${count(target.openInvoices)} bill(s). Oldest due ${shortDate(target.oldestDueOn)}.`
            : ''
        }
        onClose={() => setTarget(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setTarget(null)} disabled={busy}>
              Cancel
            </button>
            <SubmitButton busy={busy} form="collect-form" className="btn btn-good">
              Record payment
            </SubmitButton>
          </>
        }
      >
        <form id="collect-form" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={savePayment} noValidate>
          <Field
            label="Amount in ₹"
            htmlFor="collectAmount"
            error={issues.amountPaise}
            hint="Pre-filled with everything they owe — edit it for a part payment"
          >
            <input
              id="collectAmount"
              className="input"
              inputMode="decimal"
              value={payForm.amountPaise}
              onChange={(event) => setPayForm((c) => ({ ...c, amountPaise: event.target.value }))}
              autoComplete="off"
              required
            />
          </Field>

          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Mode" htmlFor="collectMode">
              <select
                id="collectMode"
                className="select"
                value={payForm.mode}
                onChange={(event) => setPayForm((c) => ({ ...c, mode: event.target.value }))}
              >
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank transfer</option>
                <option value="ADJUSTMENT">Adjustment / waiver</option>
              </select>
            </Field>
            <Field label="Paid on" htmlFor="collectPaidOn">
              <input
                id="collectPaidOn"
                className="input"
                type="date"
                value={payForm.paidOn}
                onChange={(event) => setPayForm((c) => ({ ...c, paidOn: event.target.value }))}
                required
              />
            </Field>
          </div>

          <Field label="Reference" htmlFor="collectRef" hint="UPI id or who took the cash">
            <input
              id="collectRef"
              className="input"
              maxLength={60}
              value={payForm.reference}
              onChange={(event) => setPayForm((c) => ({ ...c, reference: event.target.value }))}
            />
          </Field>

          <div className="card" style={{ background: 'var(--surface-sunken)' }}>
            <div className="card-body col" style={{ gap: 'var(--s-2)' }}>
              <span className="section-title">How this is applied</span>
              <span className="hint">
                The payment settles the oldest open bill first and rolls any remainder onto the next one, so
                a single ₹2,000 handover can close three months of small balances in one entry.
              </span>
            </div>
          </div>
        </form>
      </Drawer>

      <PaymentGatewaySimulator
        open={Boolean(gatewayTarget)}
        amountPaise={gatewayTarget?.outstandingPaise || 0}
        customerId={gatewayTarget?.customerId}
        invoiceId={null}
        customerName={gatewayTarget?.customerName}
        onClose={() => setGatewayTarget(null)}
        onSuccess={() => dues.reload()}
      />
    </>
  );
}
