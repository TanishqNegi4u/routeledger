import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentGatewaySimulator, { FORCED_FAILURE_PAISE } from '../components/PaymentGatewaySimulator.jsx';
import { api } from '../lib/api.js';

/**
 * The simulator's whole point is that the gateway is fake but the write is real, so these tests
 * care about exactly two things: that the "Test mode" label is impossible to miss, and that
 * `api.payments.record` is called on an authorised charge and *not* called on a declined one.
 *
 * The artificial bank delay is 800–1500ms of real time, hence the generous waitFor timeouts.
 */

const AUTHORISE_TIMEOUT = 4000;

function renderGateway(props = {}) {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <PaymentGatewaySimulator
      open
      amountPaise={45000}
      customerId={7}
      invoiceId={31}
      customerName="Kulkarni household"
      onClose={onClose}
      onSuccess={onSuccess}
      {...props}
    />,
  );
  return { ...view, onSuccess, onClose };
}

describe('components/PaymentGatewaySimulator.jsx', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('labels itself as test mode and shows the amount payable', () => {
    renderGateway();

    expect(screen.getByText(/test mode/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pay\s*₹\s?450/i })).toBeInTheDocument();
    expect(screen.getByText(/Kulkarni household/)).toBeInTheDocument();
    expect(screen.getByText(/no card or UPI details leave this browser/i)).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    renderGateway({ open: false });

    expect(screen.queryByText(/test mode/i)).not.toBeInTheDocument();
  });

  it('refuses to authorise a malformed UPI handle and never touches the ledger', async () => {
    const user = userEvent.setup();
    const record = vi.spyOn(api.payments, 'record');
    renderGateway();

    await user.type(screen.getByLabelText(/upi id/i), 'not-a-handle');
    await user.click(screen.getByRole('button', { name: /^pay/i }));

    expect(await screen.findByText(/name@bank/i)).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
  });

  it('persists the payment through the real endpoint once authorised', async () => {
    const user = userEvent.setup();
    const record = vi.spyOn(api.payments, 'record').mockResolvedValue({
      payment: { id: 900 },
      remainingOutstandingPaise: 0,
      settledInvoiceIds: [31],
      possibleDuplicate: false,
    });
    const { onSuccess } = renderGateway();

    await user.type(screen.getByLabelText(/upi id/i), 'kulkarni@okaxis');
    await user.click(screen.getByRole('button', { name: /^pay/i }));

    await waitFor(() => expect(record).toHaveBeenCalledTimes(1), { timeout: AUTHORISE_TIMEOUT });

    const body = record.mock.calls[0][0];
    expect(body).toMatchObject({ customerId: 7, invoiceId: 31, amountPaise: 45000, mode: 'UPI' });
    // Synthetic reference, so demo rows are identifiable in the payments table afterwards.
    expect(body.reference).toMatch(/^TEST-UPI-[A-Z0-9]{8}$/);

    expect(await screen.findByText(/fully settled/i)).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('books a card charge against the bank mode, since PaymentMode has no CARD', async () => {
    const user = userEvent.setup();
    const record = vi.spyOn(api.payments, 'record').mockResolvedValue({
      payment: { id: 901 },
      remainingOutstandingPaise: 5000,
      settledInvoiceIds: [],
      possibleDuplicate: false,
    });
    renderGateway();

    await user.click(screen.getByRole('button', { name: /^card$/i }));
    await user.type(screen.getByLabelText(/card number/i), '4111111111111111');
    await user.type(screen.getByLabelText(/expiry/i), '1230');
    await user.type(screen.getByLabelText(/cvv/i), '123');
    await user.click(screen.getByRole('button', { name: /^pay/i }));

    await waitFor(() => expect(record).toHaveBeenCalledTimes(1), { timeout: AUTHORISE_TIMEOUT });
    expect(record.mock.calls[0][0].mode).toBe('BANK');
    expect(record.mock.calls[0][0].reference).toMatch(/^TEST-CARD-/);
    expect(await screen.findByText(/₹\s?50 still open/i)).toBeInTheDocument();
  });

  it('declines the ₹1 test amount and writes nothing to the ledger', async () => {
    const user = userEvent.setup();
    const record = vi.spyOn(api.payments, 'record');
    const { onSuccess } = renderGateway({ amountPaise: FORCED_FAILURE_PAISE });

    await user.type(screen.getByLabelText(/upi id/i), 'kulkarni@okaxis');
    await user.click(screen.getByRole('button', { name: /^pay/i }));

    expect(await screen.findByText(/payment declined/i, {}, { timeout: AUTHORISE_TIMEOUT })).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    // The failure path has to be recoverable, not a dead end.
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('says the ledger failed, not the bank, when the write is rejected', async () => {
    const user = userEvent.setup();
    vi.spyOn(api.payments, 'record').mockRejectedValue({ status: 409, message: 'Bill already settled.' });
    const { onSuccess } = renderGateway();

    await user.type(screen.getByLabelText(/upi id/i), 'kulkarni@okaxis');
    await user.click(screen.getByRole('button', { name: /^pay/i }));

    expect(
      await screen.findByText(/could not save that payment/i, {}, { timeout: AUTHORISE_TIMEOUT }),
    ).toBeInTheDocument();
    expect(screen.getByText(/bill already settled/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
