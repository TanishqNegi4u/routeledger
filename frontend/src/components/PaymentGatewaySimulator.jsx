import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api.js';
import { Field } from './ui.jsx';
import { money, todayIso } from '../lib/format.js';
import styles from './PaymentGatewaySimulator.module.css';

/**
 * A sandbox checkout screen — the gateway UI is fake, the payment it books is real.
 *
 * Modelled on how Razorpay and Stripe ship an official test mode: the hosted page, the bank
 * round-trip and the transaction reference are all simulated locally, but on success this calls
 * the same `POST /api/payments` the manual cash form calls, so the ledger, the invoice balance
 * and the customer's outstanding all move exactly as they would in production. Nothing here
 * talks to a payment processor, and the "Test mode" badge stays visible the whole way through.
 *
 * Cash at the door still needs the manual form — this is the alternate path, not a replacement.
 */

/** Any amount is accepted except this one, which always declines — the failure path needs a demo. */
export const FORCED_FAILURE_PAISE = 100;

const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 1500;

/** PaymentMode has no CARD member; a card settles through the bank, so that is where it books. */
const METHODS = [
  { key: 'UPI', label: 'UPI', mode: 'UPI', prefix: 'UPI' },
  { key: 'CARD', label: 'Card', mode: 'BANK', prefix: 'CARD' },
];

const STEPS = ['Contacting issuing bank', 'Verifying credentials', 'Authorising debit'];

/** Obviously-synthetic reference, so a real payment is never confused with a demo one in the DB. */
function testReference(prefix) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < 8; i += 1) {
    tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `TEST-${prefix}-${tail}`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Groups a card number into 4s as it is typed, and caps it at 16 digits. */
function formatCardNumber(raw) {
  const digits = String(raw).replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiry(raw) {
  const digits = String(raw).replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/**
 * @param open           Mount the checkout.
 * @param amountPaise    What the gateway will charge. Pass `FORCED_FAILURE_PAISE` to force a decline.
 * @param customerId     Required — the payment books against this household.
 * @param invoiceId      Optional. Null lets the backend settle the oldest open bills first.
 * @param customerName   Shown on the checkout so the agent can confirm the right doorstep.
 * @param onClose        Called on cancel, on dismiss after a decline, and after a booked success.
 * @param onSuccess      Called with the PaymentReceipt once the payment is persisted.
 */
export default function PaymentGatewaySimulator({
  open,
  amountPaise = 0,
  customerId,
  invoiceId = null,
  customerName,
  onClose,
  onSuccess,
}) {
  const [method, setMethod] = useState('UPI');
  const [phase, setPhase] = useState('form');
  const [stepIndex, setStepIndex] = useState(-1);
  const [vpa, setVpa] = useState('');
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '' });
  const [issue, setIssue] = useState(null);
  const [outcome, setOutcome] = useState(null);
  // A checkout that unmounts mid-flight must not keep driving state or book the payment.
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Fresh checkout every time it opens — a declined attempt should not leave its error behind.
  useEffect(() => {
    if (!open) return;
    setMethod('UPI');
    setPhase('form');
    setStepIndex(-1);
    setVpa('');
    setCard({ number: '', expiry: '', cvv: '' });
    setIssue(null);
    setOutcome(null);
  }, [open]);

  const busy = phase === 'processing';

  // Escape closes the sheet, but never mid-authorisation — that would orphan the write.
  useEffect(() => {
    if (!open || busy) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const active = useMemo(() => METHODS.find((m) => m.key === method) || METHODS[0], [method]);

  const validate = () => {
    if (method === 'UPI') {
      // Deliberately loose: `name@bank`. A real gateway resolves the handle; this one cannot.
      if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(vpa.trim())) {
        return 'Enter a UPI ID in the form name@bank.';
      }
      return null;
    }
    if (card.number.replace(/\D/g, '').length !== 16) return 'Enter all 16 digits of the card.';
    if (!/^\d{2}\/\d{2}$/.test(card.expiry)) return 'Enter the expiry as MM/YY.';
    if (!/^\d{3}$/.test(card.cvv)) return 'Enter the 3-digit CVV.';
    return null;
  };

  const pay = async (event) => {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setIssue(problem);
      return;
    }
    setIssue(null);
    setPhase('processing');

    // Walk the fake bank round-trip so the wait reads as progress rather than a hang.
    const total = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
    const perStep = total / STEPS.length;
    for (let i = 0; i < STEPS.length; i += 1) {
      if (!alive.current) return;
      setStepIndex(i);
      await delay(perStep);
    }
    if (!alive.current) return;
    setStepIndex(STEPS.length);

    if (amountPaise === FORCED_FAILURE_PAISE) {
      setOutcome({
        reference: testReference(active.prefix),
        reason:
          'The bank declined this authorisation (simulated). Nothing was charged and no payment was recorded — collect in cash instead, or retry with a different amount.',
      });
      setPhase('failed');
      return;
    }

    // Authorised. From here the write is real: same endpoint as the manual cash form.
    const reference = testReference(active.prefix);
    try {
      const receipt = await api.payments.record({
        customerId,
        invoiceId,
        amountPaise,
        mode: active.mode,
        paidOn: todayIso(),
        reference,
      });
      if (!alive.current) return;
      setOutcome({ reference, receipt });
      setPhase('success');
      onSuccess?.(receipt);
    } catch (error) {
      if (!alive.current) return;
      // The gateway said yes and the ledger said no — say so plainly rather than blaming the bank.
      setOutcome({
        reference,
        reason:
          error?.message ||
          'The gateway authorised this payment but RouteLedger could not save it. Record it manually so the ledger stays correct.',
        bookingFailed: true,
      });
      setPhase('failed');
    }
  };

  function renderForm() {
    return (
      <form onSubmit={pay} noValidate>
        <div className={styles.body}>
          <div className={styles.tabs} role="group" aria-label="Payment method">
            {METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                className={styles.tab}
                aria-pressed={m.key === method}
                onClick={() => {
                  setMethod(m.key);
                  setIssue(null);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {method === 'UPI' ? (
            <div className={styles.fields}>
              <Field label="UPI ID" htmlFor="pgs-vpa" error={issue} hint="Any handle works here — nothing is resolved.">
                <input
                  id="pgs-vpa"
                  className="input"
                  autoComplete="off"
                  placeholder="name@bank"
                  value={vpa}
                  onChange={(event) => setVpa(event.target.value)}
                />
              </Field>
            </div>
          ) : (
            <div className={styles.fields}>
              <Field label="Card number" htmlFor="pgs-card" error={issue}>
                <input
                  id="pgs-card"
                  className="input"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="4111 1111 1111 1111"
                  value={card.number}
                  onChange={(event) =>
                    setCard((prev) => ({ ...prev, number: formatCardNumber(event.target.value) }))
                  }
                />
              </Field>
              <div className={styles.pair}>
                <Field label="Expiry" htmlFor="pgs-exp">
                  <input
                    id="pgs-exp"
                    className="input"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="MM/YY"
                    value={card.expiry}
                    onChange={(event) =>
                      setCard((prev) => ({ ...prev, expiry: formatExpiry(event.target.value) }))
                    }
                  />
                </Field>
                <Field label="CVV" htmlFor="pgs-cvv">
                  <input
                    id="pgs-cvv"
                    className="input"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="123"
                    value={card.cvv}
                    onChange={(event) =>
                      setCard((prev) => ({
                        ...prev,
                        cvv: event.target.value.replace(/\D/g, '').slice(0, 3),
                      }))
                    }
                  />
                </Field>
              </div>
            </div>
          )}
        </div>

        <div className={styles.foot}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`btn btn-primary ${styles.pay}`}>
            Pay {money(amountPaise)}
          </button>
        </div>
        <div className={styles.secure}>
          Simulated gateway · no card or UPI details leave this browser
          {amountPaise === FORCED_FAILURE_PAISE ? ' · this amount always declines' : ''}
        </div>
      </form>
    );
  }

  function renderProcessing() {
    return (
      <div className={styles.stage}>
        <div className={styles.ring} aria-hidden="true" />
        <div>
          <div className={styles.stageTitle}>Authorising…</div>
          <div className={styles.stageText}>
            Do not close this window. Simulated bank round-trip in progress.
          </div>
        </div>
        <div className={styles.steps} role="status" aria-live="polite">
          {STEPS.map((label, index) => (
            <div
              key={label}
              className={`${styles.step} ${index < stepIndex ? styles.stepDone : ''}`}
            >
              <span className={styles.stepMark} aria-hidden="true">
                {index < stepIndex ? '✓' : ''}
              </span>
              {label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderSuccess() {
    const remaining = outcome?.receipt?.remainingOutstandingPaise ?? 0;
    return (
      <>
        <div className={styles.stage}>
          <div className={`${styles.glyph} ${styles.glyphGood}`} aria-hidden="true">
            ✓
          </div>
          <div>
            <div className={styles.stageTitle}>{money(amountPaise)} received</div>
            <div className={styles.stageText}>
              {remaining > 0
                ? `Recorded in the ledger. ${money(remaining)} still open for this household.`
                : 'Recorded in the ledger. This household is fully settled.'}
            </div>
          </div>
          <div className={styles.txn}>{outcome?.reference}</div>
          {outcome?.receipt?.possibleDuplicate ? (
            <div className="badge badge-warn">
              A similar payment was recorded moments ago — check before collecting again.
            </div>
          ) : null}
        </div>
        <div className={styles.foot}>
          <button type="button" className={`btn btn-primary ${styles.pay}`} onClick={onClose}>
            Done
          </button>
        </div>
      </>
    );
  }

  function renderFailed() {
    return (
      <>
        <div className={styles.stage}>
          <div className={`${styles.glyph} ${styles.glyphBad}`} aria-hidden="true">
            ✕
          </div>
          <div>
            <div className={styles.stageTitle}>
              {outcome?.bookingFailed ? 'Could not save that payment' : 'Payment declined'}
            </div>
            <div className={styles.stageText}>{outcome?.reason}</div>
          </div>
          <div className={styles.txn}>{outcome?.reference}</div>
        </div>
        <div className={styles.foot}>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={`btn btn-primary ${styles.pay}`}
            onClick={() => {
              setOutcome(null);
              setStepIndex(-1);
              setPhase('form');
            }}
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  if (!open) return null;

  return createPortal(
    <>
      <div
        className={styles.backdrop}
        onClick={busy ? undefined : onClose}
        role="presentation"
      />
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Sandbox payment checkout, test mode"
      >
        <div className={styles.head}>
          <span className={styles.mark} aria-hidden="true">
            RL
          </span>
          <span className={styles.brand}>
            <span className={styles.brandName}>RouteLedger Pay</span>
            <span className={styles.brandNote}>Sandbox checkout · no processor involved</span>
          </span>
          <span className={styles.testBadge}>Test mode</span>
        </div>

        <div className={styles.amount}>
          <div className={styles.amountValue}>{money(amountPaise)}</div>
          <div className={styles.amountWho}>
            {customerName ? `Payable by ${customerName}` : 'Payable to your business'}
            {invoiceId ? ` · Bill #${invoiceId}` : ''}
          </div>
        </div>

        {phase === 'form' ? renderForm() : null}
        {phase === 'processing' ? renderProcessing() : null}
        {phase === 'success' ? renderSuccess() : null}
        {phase === 'failed' ? renderFailed() : null}
      </div>
    </>,
    document.body,
  );
}

