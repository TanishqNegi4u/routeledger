import { useState, useMemo } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useAsync } from '../lib/useAsync.js';
import { Card, Empty, ErrorState, Field, PageHeader, SkeletonRows, StatusBadge, SubmitButton } from '../components/ui.jsx';
import PaymentGatewaySimulator from '../components/PaymentGatewaySimulator.jsx';
import { longDate, money, shortDate, todayIso } from '../lib/format.js';

export default function CustomerPortal() {
  const toast = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [skippingTomorrow, setSkippingTomorrow] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [paymentModalState, setPaymentModalState] = useState(null);

  // Forms
  const [pauseForm, setPauseForm] = useState({
    startOn: '',
    endOn: '',
    reason: 'Vacation / Out of town',
  });

  const [subForm, setSubForm] = useState({
    customerName: '',
    phone: '',
    address: '',
    landmark: '',
    routeId: '',
    productId: '',
    quantity: 1,
    frequency: 'DAILY',
    weekdayMask: 127,
    startOn: todayIso(),
    advanceDays: 30,
  });

  // Load Customers for selection or demo
  const customersList = useAsync(() => api.customers.page({ page: 0, size: 20 }), []);
  const products = useAsync(() => api.products.active(), []);
  const routes = useAsync(() => api.routes.list(true), []);

  const activeCustomer = useMemo(() => {
    const list = customersList.data?.content || [];
    if (!list.length) return null;
    if (!selectedCustomerId) return list[0];
    return list.find((c) => c.id === selectedCustomerId) || list[0];
  }, [customersList.data, selectedCustomerId]);

  const customerId = activeCustomer?.id;

  // Load customer data
  const subscriptions = useAsync(
    () => (customerId ? api.subscriptions.forCustomer(customerId) : Promise.resolve([])),
    [customerId],
    { skip: !customerId },
  );

  const pauses = useAsync(
    () => (customerId ? api.pauses.forCustomer(customerId) : Promise.resolve([])),
    [customerId],
    { skip: !customerId },
  );

  const tomorrowIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const isTomorrowSkipped = useMemo(() => {
    const list = pauses.data || [];
    return list.some((p) => p.startOn <= tomorrowIso && p.endOn >= tomorrowIso);
  }, [pauses.data, tomorrowIso]);

  // 1-Tap Quick Skip Tomorrow
  const handleQuickSkipTomorrow = async () => {
    if (!customerId) return;
    setSkippingTomorrow(true);
    try {
      await api.pauses.quickSkipTomorrow(customerId, '1-Tap Customer Portal Skip');
      toast.success(
        'Tomorrow’s delivery is skipped!',
        'No money will be deducted. The meal value has been credited forward to your advance balance.',
      );
      pauses.reload();
      customersList.reload();
    } catch (error) {
      toast.fromError(error, 'Could not skip tomorrow');
    } finally {
      setSkippingTomorrow(false);
    }
  };

  // Vacation Pause
  const handleSavePause = async (e) => {
    e.preventDefault();
    if (!customerId || !pauseForm.startOn || !pauseForm.endOn) return;
    try {
      await api.pauses.create({
        customerId,
        subscriptionId: null,
        startOn: pauseForm.startOn,
        endOn: pauseForm.endOn,
        reason: pauseForm.reason,
      });
      toast.success('Vacation pause scheduled!', 'Your deliveries are paused for these dates.');
      setShowPauseModal(false);
      pauses.reload();
    } catch (error) {
      toast.fromError(error, 'Could not save pause');
    }
  };

  // Start Advance Subscription Flow
  const handleStartAdvanceSubscribe = (e) => {
    e.preventDefault();
    const prod = products.data?.find((p) => p.id === Number(subForm.productId));
    if (!prod) {
      toast.warn('Please select a meal plan or product.');
      return;
    }
    const totalPaise = prod.pricePaise * subForm.quantity * subForm.advanceDays;

    setPaymentModalState({
      amountPaise: totalPaise,
      productName: prod.name,
      customerName: subForm.customerName || activeCustomer?.name,
      phone: subForm.phone || activeCustomer?.phone,
    });
  };

  // Complete Payment and Create Subscription
  const handlePaymentSuccess = async (reference) => {
    try {
      await api.subscriptions.advanceSubscribe({
        customerName: subForm.customerName || activeCustomer?.name || 'Customer',
        phone: subForm.phone || activeCustomer?.phone || '9822011111',
        address: subForm.address || activeCustomer?.address || 'Doorstep Address',
        landmark: subForm.landmark || activeCustomer?.landmark,
        routeId: Number(subForm.routeId || routes.data?.[0]?.id || 1),
        productId: Number(subForm.productId),
        quantity: Number(subForm.quantity),
        frequency: subForm.frequency,
        weekdayMask: Number(subForm.weekdayMask),
        startOn: subForm.startOn,
        advanceAmountPaise: paymentModalState.amountPaise,
        paymentReference: reference,
      });

      toast.success(
        'Advance Payment Verified!',
        'Your subscription request has been sent to the Kitchen Owner for activation approval.',
      );
      setPaymentModalState(null);
      setShowSubscribeModal(false);
      subscriptions.reload();
      customersList.reload();
    } catch (error) {
      toast.fromError(error, 'Could not complete subscription');
    }
  };

  const subsList = subscriptions.data || [];
  const pausesList = pauses.data || [];

  return (
    <>
      <PageHeader
        title="Customer Self-Service Portal"
        subtitle="Manage your daily meal deliveries, skip tomorrow with one tap, or subscribe to advance meal plans."
      >
        <div className="row" style={{ gap: 'var(--s-2)', alignItems: 'center' }}>
          <span className="hint">Switch Household:</span>
          <select
            className="input"
            style={{ width: 'auto', padding: 'var(--s-1) var(--s-3)' }}
            value={activeCustomer?.id || ''}
            onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
          >
            {(customersList.data?.content || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.phone})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setSubForm((prev) => ({
                ...prev,
                customerName: activeCustomer?.name || '',
                phone: activeCustomer?.phone || '',
                address: activeCustomer?.address || '',
                routeId: activeCustomer?.routeId || (routes.data?.[0]?.id ?? ''),
                productId: products.data?.[0]?.id ?? '',
              }));
              setShowSubscribeModal(true);
            }}
          >
            + Subscribe to Meal Plan
          </button>
        </div>
      </PageHeader>

      {/* Quick Skip Tomorrow & Advance Credit Banner */}
      <Card>
        <div className="row spread wrap" style={{ gap: 'var(--s-4)', alignItems: 'center' }}>
          <div>
            <span className="badge badge-brand" style={{ marginBottom: 'var(--s-1)' }}>
              ⚡ 1-Tap Delivery Control
            </span>
            <h3 style={{ margin: 'var(--s-1) 0' }}>
              {isTomorrowSkipped ? 'Tomorrow’s delivery is SKIPPED' : 'Need to skip tomorrow’s delivery?'}
            </h3>
            <p className="hint" style={{ margin: 0 }}>
              {isTomorrowSkipped
                ? 'Your skip is active for tomorrow. The meal value is preserved and adjusted forward.'
                : 'Tap to notify the kitchen and driver immediately. Money is never deducted and adjusted to your balance.'}
            </p>
          </div>

          <div className="row" style={{ gap: 'var(--s-2)' }}>
            {!isTomorrowSkipped ? (
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
                disabled={skippingTomorrow || !customerId}
                onClick={handleQuickSkipTomorrow}
              >
                {skippingTomorrow ? 'Updating…' : '🚫 Skip Tomorrow’s Delivery'}
              </button>
            ) : (
              <div className="badge badge-good" style={{ padding: 'var(--s-2) var(--s-3)' }}>
                ✓ Tomorrow Skipped (Credit Saved)
              </div>
            )}
            <button type="button" className="btn btn-sm" onClick={() => setShowPauseModal(true)}>
              🏖️ Plan Vacation Dates
            </button>
          </div>
        </div>
      </Card>

      {/* Active Subscriptions & Delivery Plans */}
      <div style={{ marginTop: 'var(--s-5)' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: 'var(--s-3)' }}>Your Active Meal Plans</h2>
        {subscriptions.loading ? (
          <Card flush>
            <SkeletonRows rows={2} cols={4} />
          </Card>
        ) : null}

        {!subscriptions.loading && subsList.length === 0 ? (
          <Empty
            glyph="🍱"
            title="No active meal subscription"
            text="You have not subscribed to a meal plan yet. Choose a daily lunch or dinner box and start your service with upfront payment."
          >
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowSubscribeModal(true)}
            >
              Subscribe Now
            </button>
          </Empty>
        ) : null}

        {!subscriptions.loading && subsList.length > 0 ? (
          <div className="grid-2" style={{ gap: 'var(--s-4)' }}>
            {subsList.map((sub) => (
              <Card key={sub.id}>
                <div className="row spread" style={{ marginBottom: 'var(--s-2)' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{sub.productName}</h3>
                    <span className="hint">
                      {sub.quantity} {sub.unitLabel} · {sub.weekdayLabel}
                    </span>
                  </div>
                  <StatusBadge value={sub.approvalStatus || 'APPROVED'}>
                    {sub.approvalStatus === 'PENDING_APPROVAL' ? 'Awaiting Owner Approval' : 'Active'}
                  </StatusBadge>
                </div>

                <div
                  style={{
                    padding: 'var(--s-3)',
                    background: 'var(--surface-muted)',
                    borderRadius: 'var(--r-sm)',
                    margin: 'var(--s-3) 0',
                  }}
                >
                  <div className="row spread">
                    <span className="hint">Cost per delivery:</span>
                    <b>{money(sub.perDeliveryPaise)}</b>
                  </div>
                  <div className="row spread" style={{ marginTop: 'var(--s-1)' }}>
                    <span className="hint">Schedule:</span>
                    <span>{sub.weekdayLabel}</span>
                  </div>
                  <div className="row spread" style={{ marginTop: 'var(--s-1)' }}>
                    <span className="hint">Start date:</span>
                    <span>{longDate(sub.startOn)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </div>

      {/* Vacation / Pause Windows */}
      <div style={{ marginTop: 'var(--s-6)' }}>
        <div className="row spread" style={{ marginBottom: 'var(--s-3)' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Scheduled Vacation Pauses</h2>
          <button type="button" className="btn btn-sm" onClick={() => setShowPauseModal(true)}>
            + Add Vacation Window
          </button>
        </div>

        {pausesList.length === 0 ? (
          <div className="card" style={{ padding: 'var(--s-4)', color: 'var(--text-muted)' }}>
            No upcoming vacation pauses. Deliveries will arrive normally every scheduled morning.
          </div>
        ) : (
          <div className="card flush">
            <table className="table">
              <thead>
                <tr>
                  <th>Window</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pausesList.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>
                        {shortDate(p.startOn)} – {shortDate(p.endOn)}
                      </b>
                    </td>
                    <td>{p.days} days</td>
                    <td>{p.reason || 'Vacation'}</td>
                    <td>
                      <span className={`badge ${p.activeNow ? 'badge-risk' : 'badge-plain'}`}>
                        {p.activeNow ? 'Paused Today' : 'Upcoming'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vacation Modal */}
      {showPauseModal ? (
        <div className="modal-backdrop" onClick={() => setShowPauseModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3>Plan Vacation / Skip Delivery</h3>
            <p className="hint">
              Select the dates you will be away. Deliveries will stop automatically, and money will not be deducted.
            </p>
            <form onSubmit={handleSavePause}>
              <Field label="Start date" id="pause-start">
                <input
                  type="date"
                  className="input"
                  required
                  value={pauseForm.startOn}
                  onChange={(e) => setPauseForm((f) => ({ ...f, startOn: e.target.value }))}
                />
              </Field>
              <Field label="End date (inclusive)" id="pause-end">
                <input
                  type="date"
                  className="input"
                  required
                  value={pauseForm.endOn}
                  onChange={(e) => setPauseForm((f) => ({ ...f, endOn: e.target.value }))}
                />
              </Field>
              <Field label="Reason" id="pause-reason">
                <input
                  type="text"
                  className="input"
                  value={pauseForm.reason}
                  onChange={(e) => setPauseForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. Traveling to hometown"
                />
              </Field>
              <div className="row spread" style={{ marginTop: 'var(--s-4)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowPauseModal(false)}>
                  Cancel
                </button>
                <SubmitButton>Save Pause</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Advance Subscribe Modal */}
      {showSubscribeModal ? (
        <div className="modal-backdrop" onClick={() => setShowSubscribeModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Subscribe with Advance Payment</h3>
            <p className="hint">
              Choose your meal plan, quantity, and advance duration. Payment is verified upfront and sent to the Owner for service approval.
            </p>

            <form onSubmit={handleStartAdvanceSubscribe}>
              <Field label="Your Name" id="sub-name">
                <input
                  type="text"
                  className="input"
                  required
                  value={subForm.customerName}
                  onChange={(e) => setSubForm((f) => ({ ...f, customerName: e.target.value }))}
                />
              </Field>

              <Field label="Phone Number" id="sub-phone">
                <input
                  type="tel"
                  className="input"
                  required
                  value={subForm.phone}
                  onChange={(e) => setSubForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </Field>

              <Field label="Delivery Address" id="sub-addr">
                <input
                  type="text"
                  className="input"
                  required
                  value={subForm.address}
                  onChange={(e) => setSubForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Flat / Floor, Building Name"
                />
              </Field>

              <div className="row" style={{ gap: 'var(--s-3)' }}>
                <Field label="Meal / Product" id="sub-prod">
                  <select
                    className="input"
                    required
                    value={subForm.productId}
                    onChange={(e) => setSubForm((f) => ({ ...f, productId: e.target.value }))}
                  >
                    {(products.data || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({money(p.pricePaise)}/{p.unitLabel})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Daily Quantity" id="sub-qty">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    className="input"
                    value={subForm.quantity}
                    onChange={(e) => setSubForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                  />
                </Field>
              </div>

              <div className="row" style={{ gap: 'var(--s-3)' }}>
                <Field label="Advance Duration" id="sub-days">
                  <select
                    className="input"
                    value={subForm.advanceDays}
                    onChange={(e) => setSubForm((f) => ({ ...f, advanceDays: Number(e.target.value) }))}
                  >
                    <option value={15}>15 Days Advance</option>
                    <option value={30}>30 Days (1 Month) Advance</option>
                    <option value={60}>60 Days (2 Months) Advance</option>
                  </select>
                </Field>

                <Field label="Start Date" id="sub-start">
                  <input
                    type="date"
                    className="input"
                    required
                    value={subForm.startOn}
                    onChange={(e) => setSubForm((f) => ({ ...f, startOn: e.target.value }))}
                  />
                </Field>
              </div>

              <div className="row spread" style={{ marginTop: 'var(--s-4)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowSubscribeModal(false)}>
                  Cancel
                </button>
                <SubmitButton>Proceed to Advance Payment →</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Payment Gateway / UPI Simulator Modal */}
      {paymentModalState ? (
        <PaymentGatewaySimulator
          amountPaise={paymentModalState.amountPaise}
          customerName={paymentModalState.customerName}
          invoiceId={null}
          onSuccess={handlePaymentSuccess}
          onCancel={() => setPaymentModalState(null)}
        />
      ) : null}
    </>
  );
}
