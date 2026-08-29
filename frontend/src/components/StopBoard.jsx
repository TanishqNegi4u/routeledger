import { useState } from 'react';
import { Drawer, Empty, Field, StatusBadge, SubmitButton } from './ui.jsx';
import { clock, count, distance, money, percent } from '../lib/format.js';
import styles from './StopBoard.module.css';

/**
 * The doorstep sheet, shared by the agent's own round and the manager's run detail.
 *
 * Every status button is fired through `onUpdate`, which the caller wires to an optimistic
 * mutation — so a tap paints instantly and rolls back visibly if the request fails.
 */

const SETTLED = new Set(['DELIVERED', 'ABSENT', 'SKIPPED']);

function seqTone(status) {
  if (status === 'DELIVERED') return styles.seqDone;
  if (status === 'ABSENT' || status === 'SKIPPED') return styles.seqOff;
  return '';
}

export default function StopBoard({
  run,
  stops = [],
  onUpdate,
  busyId,
  readOnly = false,
  paymentPrompt = null,
  onDismissPaymentPrompt,
  onRecordPayment,
  onPaymentPromptChange,
}) {
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState({});
  const [saving, setSaving] = useState(false);
  const [justActioned, setJustActioned] = useState(null);

  const handleStatusAction = (stopId, status) => {
    setJustActioned(stopId);
    setTimeout(() => setJustActioned((curr) => (curr === stopId ? null : curr)), 260);
    onUpdate(stopId, { status });
  };

  const openEditor = (stop) => {
    setEditing(stop);
    setNote(stop.note || '');
    const next = {};
    (stop.items || []).forEach((item) => {
      next[item.productId] = String(item.quantity);
    });
    setQuantities(next);
  };

  const closeEditor = () => {
    setEditing(null);
    setSaving(false);
  };

  const saveEditor = async (event) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    const items = (editing.items || []).map((item) => ({
      productId: item.productId,
      quantity: Math.max(0, Number.parseInt(quantities[item.productId], 10) || 0),
    }));
    try {
      await onUpdate(editing.id, { status: editing.status, note: note.trim() || null, items });
      closeEditor();
    } catch {
      setSaving(false);
    }
  };

  const done = Number(run?.completedStops || 0);
  const total = Number(run?.totalStops || 0);
  const ratio = total > 0 ? (done / total) * 100 : 0;

  return (
    <>
      <div className={styles.head}>
        <div className={styles.headStats}>
          <span className={styles.stat}>
            <span className={styles.statValue}>
              {count(done)} / {count(total)}
            </span>
            <span className={styles.statLabel}>Stops done</span>
          </span>
          <span className={styles.stat}>
            <span className={styles.statValue}>{distance(run?.plannedMetres)}</span>
            <span className={styles.statLabel}>Planned</span>
          </span>
          <span className={styles.stat}>
            <span className={styles.statValue} style={{ color: 'var(--good-600)' }}>
              {distance(run?.savedMetres)} · {percent(run?.savedPercent, 0)}
            </span>
            <span className={styles.statLabel}>Saved by sequencing</span>
          </span>
          <span className={styles.stat}>
            <span className={styles.statValue}>{money(run?.plannedValuePaise)}</span>
            <span className={styles.statLabel}>Sheet value</span>
          </span>
        </div>
        <div className={styles.progress}>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, ratio)}%` }} />
          </div>
          <div className="hint" style={{ marginTop: 'var(--s-2)' }}>
            {total === 0
              ? 'Nothing on this sheet'
              : done === total
                ? 'Round complete — nice work'
                : `${count(total - done)} left · ${run?.twoOptSwaps || 0} 2-opt improvements applied`}
          </div>
        </div>
      </div>

      {stops.length === 0 ? (
        <Empty
          glyph="◌"
          title="No stops on this sheet"
          text="Every household on this beat is paused, inactive or has no standing order for today."
        />
      ) : (
        <div className={styles.list}>
          {stops.map((stop) => {
            const settled = SETTLED.has(stop.status);
            const busy = busyId === stop.id;
            return (
              <div
                className={`${styles.stop} ${settled ? styles.stopSettled : ''} ${
                  justActioned === stop.id ? styles.stopActioned : ''
                }`}
                key={stop.id}
              >
                <span className={`${styles.seq} ${seqTone(stop.status)}`}>{stop.seq}</span>
                <div>
                  <div className={styles.name}>{stop.customerName}</div>
                  <div className={styles.meta}>
                    {stop.address}
                    {stop.landmark ? ` · ${stop.landmark}` : ''}
                  </div>
                  <div className={styles.meta}>
                    <a href={`tel:${stop.phone}`} className="mono">
                      {stop.phone}
                    </a>
                    {stop.deliveredAt ? (
                      <span className="faint"> · marked {clock(stop.deliveredAt)}</span>
                    ) : null}
                  </div>
                  {(stop.items || []).length > 0 ? (
                    <div className={styles.items}>
                      {stop.items.map((item) => (
                        <span className={styles.item} key={item.id ?? item.productId}>
                          {item.quantity} × {item.productName}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {stop.note ? <div className={styles.note}>{stop.note}</div> : null}
                </div>
                <div className={styles.side}>
                  <span className={styles.amount}>{money(stop.amountPaise)}</span>
                  <StatusBadge value={stop.status} />
                  {readOnly ? null : (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={`btn btn-sm ${stop.status === 'DELIVERED' ? 'btn-good' : ''}`}
                        disabled={busy}
                        onClick={() => handleStatusAction(stop.id, 'DELIVERED')}
                      >
                        Delivered
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${stop.status === 'ABSENT' ? 'btn-danger' : ''}`}
                        disabled={busy}
                        onClick={() => handleStatusAction(stop.id, 'ABSENT')}
                      >
                        Absent
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${stop.status === 'SKIPPED' ? 'btn-danger' : ''}`}
                        disabled={busy}
                        onClick={() => handleStatusAction(stop.id, 'SKIPPED')}
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={busy}
                        onClick={() => openEditor(stop)}
                      >
                        Edit
                      </button>
                    </div>
                  )}
                  <span className={styles.leg}>
                    {stop.legMetres > 0 ? `${distance(stop.legMetres)} from previous stop` : 'First stop'}
                  </span>
                </div>
                {paymentPrompt && paymentPrompt.stopId === stop.id ? (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      marginTop: 'var(--s-3)',
                      padding: 'var(--s-3) var(--s-4)',
                      background: 'var(--brand-50)',
                      border: '1px solid var(--brand-200)',
                      borderRadius: 'var(--r-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--s-2)',
                    }}
                  >
                    <div className="row spread">
                      <span style={{ fontWeight: 650, fontSize: '0.875rem', color: 'var(--brand-700)' }}>
                        Collected payment from {stop.customerName}?
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0 var(--s-2)', minHeight: '24px', height: '24px' }}
                        onClick={onDismissPaymentPrompt}
                        aria-label="Dismiss payment prompt"
                      >
                        ✕
                      </button>
                    </div>
                    <form
                      onSubmit={onRecordPayment}
                      className="row wrap"
                      style={{ gap: 'var(--s-3)', alignItems: 'flex-end' }}
                    >
                      <div className="field" style={{ minWidth: '120px', flex: '1 1 120px' }}>
                        <span className="label" style={{ fontSize: '0.75rem' }}>Amount (₹)</span>
                        <input
                          type="number"
                          step="any"
                          className="input btn-sm"
                          value={paymentPrompt.amount}
                          onChange={(e) => onPaymentPromptChange({ ...paymentPrompt, amount: e.target.value })}
                          required
                        />
                      </div>
                      <div className="field" style={{ minWidth: '100px', flex: '0 1 100px' }}>
                        <span className="label" style={{ fontSize: '0.75rem' }}>Mode</span>
                        <select
                          className="select btn-sm"
                          value={paymentPrompt.mode}
                          onChange={(e) => onPaymentPromptChange({ ...paymentPrompt, mode: e.target.value })}
                        >
                          <option value="CASH">Cash</option>
                          <option value="UPI">UPI</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="btn btn-good btn-sm"
                        disabled={paymentPrompt.saving}
                        style={{ alignSelf: 'flex-end', minHeight: '34px' }}
                      >
                        {paymentPrompt.saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : null}
                        Record payment
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Drawer
        open={Boolean(editing)}
        title={editing ? editing.customerName : ''}
        subtitle="Correct what actually went in at the gate — the invoice is built from these lines."
        onClose={closeEditor}
        footer={
          <>
            <button type="button" className="btn" onClick={closeEditor} disabled={saving}>
              Cancel
            </button>
            <SubmitButton busy={saving} form="stop-editor">
              Save stop
            </SubmitButton>
          </>
        }
      >
        {editing ? (
          <form id="stop-editor" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={saveEditor}>
            {(editing.items || []).length === 0 ? (
              <p className="hint">
                This stop has no standing lines today, so there is nothing to correct — but you can
                still leave a note for the owner.
              </p>
            ) : (
              (editing.items || []).map((item) => (
                <Field
                  key={item.productId}
                  label={item.productName}
                  htmlFor={`qty-${item.productId}`}
                  hint={`${money(item.unitPricePaise)} each`}
                >
                  <input
                    id={`qty-${item.productId}`}
                    className="input"
                    type="number"
                    min={0}
                    max={99}
                    inputMode="numeric"
                    value={quantities[item.productId] ?? ''}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [item.productId]: event.target.value,
                      }))
                    }
                  />
                </Field>
              ))
            )}
            <Field
              label="Note"
              htmlFor="stop-note"
              hint="Visible to the owner on the run sheet. Max 240 characters."
            >
              <textarea
                id="stop-note"
                className="textarea"
                maxLength={240}
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Gate locked, left with watchman"
              />
            </Field>
            <p className="hint">
              Saving keeps the current status ({editing.status.toLowerCase()}). Use the buttons on the
              row to change it.
            </p>
          </form>
        ) : null}
      </Drawer>
    </>
  );
}
