import { useEffect, useState } from 'react';
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
import { count, money, shortDate, todayIso } from '../lib/format.js';
import styles from './Dashboard.module.css';

/**
 * Billing. A bill is never typed: it is assembled from stops that were actually marked delivered,
 * which is the whole reason this product exists. Generating twice is safe — an existing unpaid bill
 * for the same period is recalculated rather than duplicated.
 */

const STATUSES = [
  { value: '', label: 'Every bill' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIAL', label: 'Part paid' },
  { value: 'PAID', label: 'Settled' },
  { value: 'VOID', label: 'Cancelled' },
];

function firstOfThisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastMonthWindow() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}

function plusDays(iso, days) {
  const parts = String(iso).split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function Invoices() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [form, setForm] = useState(() => ({
    periodStart: firstOfThisMonth(),
    periodEnd: todayIso(),
    dueOn: plusDays(todayIso(), 7),
  }));

  const list = useAsync(
    () => api.invoices.page({ status: status || undefined, page, size: 12 }),
    [status, page],
  );

  useEffect(() => {
    setPage(0);
  }, [status]);

  const usePreset = () => {
    const window = lastMonthWindow();
    setForm({ periodStart: window.start, periodEnd: window.end, dueOn: plusDays(window.end, 7) });
  };

  const generate = async (event) => {
    event.preventDefault();
    if (form.periodEnd < form.periodStart) {
      toast.error('Check the period', 'The end date cannot come before the start date.');
      return;
    }
    setBusy(true);
    setOutcome(null);
    try {
      const result = await api.invoices.generate({
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        customerIds: null,
        dueOn: form.dueOn || null,
      });
      setOutcome(result);
      toast.success(
        `${count(result.created + result.updated)} bills ready`,
        `${money(result.totalBilledPaise)} billed · ${count(result.skipped)} households had nothing to bill.`,
      );
      list.reload();
    } catch (error) {
      toast.fromError(error, 'Could not generate bills');
    } finally {
      setBusy(false);
    }
  };

  const totals = list.data?.content || [];
  const openPaise = totals.reduce((sum, invoice) => sum + Number(invoice.outstandingPaise || 0), 0);
  const billedPaise = totals.reduce((sum, invoice) => sum + Number(invoice.totalPaise || 0), 0);
  const overdue = totals.filter((invoice) => invoice.daysOverdue > 0).length;

  return (
    <>
      <PageHeader
        title="Bills"
        subtitle="Built from delivered stops, not from the standing order — an absent day is never charged, and that is what stops the monthly argument."
      >
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          Generate bills
        </button>
      </PageHeader>

      <KpiGrid>
        <Kpi
          label="Bills on this page"
          glyph="◫"
          loading={list.loading}
          value={count(list.data?.totalElements)}
          foot={`${count(totals.length)} shown, 12 to a page`}
        />
        <Kpi
          label="Billed on this page"
          glyph="₹"
          loading={list.loading}
          value={money(billedPaise)}
          foot="Sum of the visible bills"
        />
        <Kpi
          label="Still open"
          glyph="◔"
          tone={openPaise > 0 ? 'warn' : 'good'}
          loading={list.loading}
          value={money(openPaise)}
          foot={openPaise > 0 ? 'Chase these from Collections' : 'Everything visible is settled'}
        />
        <Kpi
          label="Past due"
          glyph="▲"
          tone={overdue > 0 ? 'risk' : 'good'}
          loading={list.loading}
          value={count(overdue)}
          foot="Bills past their due date"
        />
      </KpiGrid>

      <div style={{ marginTop: 'var(--s-5)' }}>
        <Card
          flush
          title="Ledger"
          subtitle="Newest period first. Open a bill to see the line items it was built from."
          actions={
            <select
              className="select"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by status"
              style={{ width: 'auto' }}
            >
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          }
        >
          {list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : list.loading ? (
            <SkeletonRows rows={7} cols={6} />
          ) : totals.length === 0 ? (
            <Empty
              glyph="₹"
              title={status ? 'No bills with that status' : 'No bills yet'}
              text={
                status
                  ? 'Clear the filter to see the whole ledger.'
                  : 'Generate the period once the round has been delivered — every marked stop becomes a line item.'
              }
            >
              {status ? (
                <button type="button" className="btn btn-sm" onClick={() => setStatus('')}>
                  Clear filter
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
                  Generate bills
                </button>
              )}
            </Empty>
          ) : (
            <>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Bill</th>
                      <th>Household</th>
                      <th>Period</th>
                      <th className="right">Total</th>
                      <th className="right">Paid</th>
                      <th className="right">Open</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.map((invoice) => (
                      <tr key={invoice.id} className={invoice.status === 'VOID' ? 'row-dim' : ''}>
                        <td className="nowrap">
                          <Link to={`/app/invoices/${invoice.id}`}>#{invoice.id}</Link>
                          <div className="hint">issued {shortDate(invoice.issuedOn)}</div>
                        </td>
                        <td>
                          <Link to={`/app/customers/${invoice.customerId}`}>{invoice.customerName}</Link>
                          <div className="hint mono">{invoice.phone}</div>
                        </td>
                        <td className="nowrap">
                          {shortDate(invoice.periodStart)} – {shortDate(invoice.periodEnd)}
                          <div className="hint">
                            due {shortDate(invoice.dueOn)}
                            {invoice.daysOverdue > 0 ? (
                              <span style={{ color: 'var(--risk-600)' }}>
                                {' '}
                                · {count(invoice.daysOverdue)}d late
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="right num nowrap">
                          {money(invoice.totalPaise)}
                          {invoice.adjustmentPaise !== 0 ? (
                            <div className="hint">adj {money(invoice.adjustmentPaise)}</div>
                          ) : null}
                        </td>
                        <td className="right num nowrap">{money(invoice.paidPaise)}</td>
                        <td className="right num nowrap">
                          {invoice.outstandingPaise > 0 ? (
                            <span style={{ color: 'var(--risk-600)', fontWeight: 650 }}>
                              {money(invoice.outstandingPaise)}
                            </span>
                          ) : (
                            <span className="faint">—</span>
                          )}
                        </td>
                        <td>
                          <StatusBadge value={invoice.status} />
                        </td>
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
      </div>

      <Drawer
        open={open}
        title="Generate bills"
        subtitle="Every active household with a delivered stop in the window gets one bill. Running it again recalculates unpaid bills instead of duplicating them."
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
              Close
            </button>
            <SubmitButton busy={busy} form="generate-invoices">
              Build the ledger
            </SubmitButton>
          </>
        }
      >
        <form id="generate-invoices" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={generate}>
          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Period from" htmlFor="periodStart">
              <input
                id="periodStart"
                className="input"
                type="date"
                value={form.periodStart}
                onChange={(event) => setForm((c) => ({ ...c, periodStart: event.target.value }))}
                required
              />
            </Field>
            <Field label="Period to" htmlFor="periodEnd">
              <input
                id="periodEnd"
                className="input"
                type="date"
                value={form.periodEnd}
                onChange={(event) => setForm((c) => ({ ...c, periodEnd: event.target.value }))}
                required
              />
            </Field>
          </div>

          <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={usePreset}>
            Use last full month
          </button>

          <Field
            label="Payment due on"
            htmlFor="dueOn"
            hint="Drives the overdue buckets on the Collections screen"
          >
            <input
              id="dueOn"
              className="input"
              type="date"
              value={form.dueOn}
              onChange={(event) => setForm((c) => ({ ...c, dueOn: event.target.value }))}
            />
          </Field>

          <div className="card" style={{ background: 'var(--surface-sunken)' }}>
            <div className="card-body col" style={{ gap: 'var(--s-2)' }}>
              <span className="section-title">What this does</span>
              <span className="hint">
                Reads every stop marked delivered between those dates, groups the line items per household
                and per product, applies the price recorded on the stop, and writes one bill. Absent and
                skipped stops contribute nothing. Paused windows never produced a stop in the first place.
              </span>
            </div>
          </div>

          {outcome ? (
            <div className="card" style={{ background: 'var(--surface-sunken)' }}>
              <div className="card-body col" style={{ gap: 'var(--s-2)' }}>
                <span className="section-title">Last run</span>
                <span className="num" style={{ fontWeight: 650 }}>
                  {count(outcome.created)} created · {count(outcome.updated)} recalculated ·{' '}
                  {count(outcome.skipped)} skipped
                </span>
                <span className="hint">
                  {money(outcome.totalBilledPaise)} billed for {shortDate(outcome.periodStart)} –{' '}
                  {shortDate(outcome.periodEnd)}
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
