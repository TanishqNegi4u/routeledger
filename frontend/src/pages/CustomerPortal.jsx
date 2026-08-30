import { useState, useEffect } from 'react';
import { Link, navigate } from '../lib/router.jsx';
import { useCustomerAuth } from '../lib/customerAuth.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useAsync } from '../lib/useAsync.js';
import { Card, Empty, Field, SkeletonRows, StatusBadge, SubmitButton } from '../components/ui.jsx';
import UpiPaymentModal from '../components/UpiPaymentModal.jsx';
import { longDate, money, todayIso } from '../lib/format.js';

export default function CustomerPortal() {
  const { customer, isAuthenticated, logout } = useCustomerAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('DASHBOARD'); // 'DASHBOARD' | 'MARKETPLACE'
  const [vendorSearch, setVendorSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [skippingSubId, setSkippingSubId] = useState(null);

  // Subscribe Form
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [subForm, setSubForm] = useState({
    customerName: customer?.name || 'Sunil Joshi',
    address: customer?.address || 'Flat 402, Rohan Heights, Kothrud',
    landmark: 'Near Gandhi Bhavan',
    quantity: 1,
    advanceDays: 30,
    startOn: todayIso(),
  });

  const [paymentModalState, setPaymentModalState] = useState(null);

  // Redirect to Customer Login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/customer/login', { replace: true });
    }
  }, [isAuthenticated]);

  const customerPhone = customer?.phone || '9822011111';

  // Fetch Vendors & Customer Dashboard
  const vendors = useAsync(() => api.marketplace.vendors(), []);
  const dashboard = useAsync(
    () => (customerPhone ? api.marketplace.mySubscriptions(customerPhone) : Promise.resolve(null)),
    [customerPhone],
    { skip: !customerPhone }
  );

  // 1-Tap Skip Tomorrow
  const handleQuickSkipTomorrow = async (sub) => {
    setSkippingSubId(sub.id);
    try {
      await api.marketplace.quickSkipTomorrow(customerPhone, sub.id);
      toast.success(
        'Tomorrow’s delivery skipped!',
        `Notified ${sub.vendorName}. No money is deducted; the ₹${sub.perDeliveryPaise / 100} value is preserved in your advance balance.`,
      );
      dashboard.reload();
    } catch (error) {
      toast.fromError(error, 'Could not skip tomorrow');
    } finally {
      setSkippingSubId(null);
    }
  };

  // Open Subscribe Form
  const handleOpenSubscribe = (vendor, product) => {
    setSelectedVendor(vendor);
    setSelectedProduct(product);
    setSubForm((prev) => ({
      ...prev,
      customerName: customer?.name || 'Sunil Joshi',
      address: customer?.address || 'Flat 402, Rohan Heights, Kothrud',
    }));
    setShowSubscribeModal(true);
  };

  // Trigger UPI Payment Modal
  const handleStartPayment = (e) => {
    e.preventDefault();
    if (!selectedVendor || !selectedProduct) return;

    const totalPaise = selectedProduct.pricePaise * subForm.quantity * subForm.advanceDays;

    setPaymentModalState({
      amountPaise: totalPaise,
      vendorName: selectedVendor.name,
      productName: selectedProduct.name,
      customerName: subForm.customerName,
    });
  };

  // On Simulated UPI Payment Success
  const handlePaymentSuccess = async (reference) => {
    try {
      await api.marketplace.subscribe({
        businessId: selectedVendor.id,
        customerName: subForm.customerName,
        phone: customerPhone,
        address: subForm.address,
        landmark: subForm.landmark,
        productId: selectedProduct.id,
        quantity: Number(subForm.quantity),
        frequency: 'DAILY',
        weekdayMask: 127,
        startOn: subForm.startOn,
        advanceDays: Number(subForm.advanceDays),
        advanceAmountPaise: paymentModalState.amountPaise,
        paymentReference: reference,
      });

      toast.success(
        'Advance Payment Verified!',
        `Your subscription request has been sent to ${selectedVendor.name} for Owner Approval. Service will begin once approved.`,
      );

      setPaymentModalState(null);
      setShowSubscribeModal(false);
      setActiveTab('DASHBOARD');
      dashboard.reload();
    } catch (error) {
      toast.fromError(error, 'Could not complete subscription');
    }
  };

  if (!isAuthenticated) return null;

  const filteredVendors = (vendors.data || []).filter((v) => {
    const q = vendorSearch.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      (v.city && v.city.toLowerCase().includes(q)) ||
      v.products.some((p) => p.name.toLowerCase().includes(q))
    );
  });

  const subsList = dashboard.data?.subscriptions || [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-sunken)' }}>
      {/* Consumer Standalone Top Navigation */}
      <header
        style={{
          background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 100%)',
          color: '#fff',
          padding: 'var(--s-3) var(--s-5)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--s-3)',
          }}
        >
          <div className="row" style={{ alignItems: 'center', gap: 'var(--s-3)' }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--r-md)',
                background: 'linear-gradient(135deg, var(--brand-500), var(--good-500))',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: '1.1rem',
              }}
            >
              🍱
            </div>
            <div>
              <strong style={{ fontSize: '1.1rem', letterSpacing: '-0.02em', display: 'block' }}>
                RouteLedger Consumer
              </strong>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Hyperlocal Meal & Subscription Portal</span>
            </div>
          </div>

          <div className="row" style={{ alignItems: 'center', gap: 'var(--s-3)' }}>
            <div className="badge badge-brand" style={{ padding: 'var(--s-2) var(--s-3)' }}>
              👤 {customer?.name} ({customerPhone})
            </div>
            {dashboard.data?.totalAdvanceCreditPaise > 0 ? (
              <div className="badge badge-good" style={{ padding: 'var(--s-2) var(--s-3)' }}>
                Wallet: <b>{money(dashboard.data.totalAdvanceCreditPaise)}</b>
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ color: '#f87171' }}
              onClick={() => {
                logout();
                navigate('/customer/login');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--s-5) var(--s-4)' }}>
        {/* Navigation Tabs */}
        <div className="row" style={{ gap: 'var(--s-3)', marginBottom: 'var(--s-5)' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'DASHBOARD' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('DASHBOARD')}
          >
            🍱 My Subscriptions & Daily Deliveries
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'MARKETPLACE' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('MARKETPLACE')}
          >
            🔍 Explore Local Kitchens & Meal Plans
          </button>
        </div>

        {/* TAB 1: MY SUBSCRIPTIONS */}
        {activeTab === 'DASHBOARD' ? (
          <div>
            {dashboard.loading ? (
              <Card flush>
                <SkeletonRows rows={3} cols={4} />
              </Card>
            ) : null}

            {!dashboard.loading && subsList.length === 0 ? (
              <Empty
                glyph="🍱"
                title="No active meal subscriptions"
                text="You have not subscribed to a meal plan yet. Browse our verified cloud kitchens and subscribe with upfront advance payment."
              >
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setActiveTab('MARKETPLACE')}
                >
                  Browse Cloud Kitchens →
                </button>
              </Empty>
            ) : null}

            {!dashboard.loading && subsList.length > 0 ? (
              <div className="col" style={{ gap: 'var(--s-4)' }}>
                {subsList.map((sub) => (
                  <Card key={sub.id}>
                    <div className="row spread wrap" style={{ gap: 'var(--s-3)', marginBottom: 'var(--s-3)' }}>
                      <div>
                        <div className="row" style={{ gap: 'var(--s-2)', alignItems: 'center' }}>
                          <span className="badge badge-brand">🏪 {sub.vendorName}</span>
                          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{sub.productName}</h2>
                        </div>
                        <span className="hint" style={{ display: 'block', marginTop: 'var(--s-1)' }}>
                          {sub.quantity} {sub.unitLabel} · {sub.weekdayLabel} · From {longDate(sub.startOn)}
                        </span>
                      </div>

                      <div>
                        <StatusBadge value={sub.approvalStatus || 'APPROVED'}>
                          {sub.approvalStatus === 'PENDING_APPROVAL'
                            ? '⏳ Awaiting Owner Approval'
                            : sub.approvalStatus === 'APPROVED'
                            ? '✓ Active & Approved'
                            : sub.approvalStatus}
                        </StatusBadge>
                      </div>
                    </div>

                    <div
                      style={{
                        background: 'var(--surface-muted)',
                        borderRadius: 'var(--r-sm)',
                        padding: 'var(--s-3)',
                        margin: 'var(--s-3) 0',
                      }}
                    >
                      <div className="row spread">
                        <span className="hint">Daily meal price:</span>
                        <b>{money(sub.perDeliveryPaise)}</b>
                      </div>
                      <div className="row spread" style={{ marginTop: 'var(--s-1)' }}>
                        <span className="hint">Advance payment verified:</span>
                        <b style={{ color: 'var(--good-600)' }}>{money(sub.advancePaidPaise)}</b>
                      </div>
                    </div>

                    <div
                      className="row spread wrap"
                      style={{
                        paddingTop: 'var(--s-3)',
                        borderTop: '1px solid var(--border)',
                        alignItems: 'center',
                        gap: 'var(--s-3)',
                      }}
                    >
                      <div>
                        {sub.isTomorrowSkipped ? (
                          <div className="badge badge-risk">
                            🚫 Tomorrow’s delivery is SKIPPED (Meal value saved in wallet)
                          </div>
                        ) : (
                          <span className="hint">
                            Need to skip tomorrow? Tap below. Money is not deducted and credited forward.
                          </span>
                        )}
                      </div>

                      {!sub.isTomorrowSkipped ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          style={{ background: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
                          disabled={skippingSubId === sub.id}
                          onClick={() => handleQuickSkipTomorrow(sub)}
                        >
                          {skippingSubId === sub.id ? 'Skipping…' : '🚫 Skip Tomorrow’s Delivery'}
                        </button>
                      ) : (
                        <span className="badge badge-good">✓ Skip Active for Tomorrow</span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* TAB 2: EXPLORE VENDORS & MEAL PLANS */}
        {activeTab === 'MARKETPLACE' ? (
          <div>
            <div className="row spread wrap" style={{ gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
              <input
                type="search"
                className="input"
                style={{ maxWidth: 360 }}
                placeholder="Search kitchen, city, or dish (e.g. Thali, Milk, Tiffin)…"
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
              />
              <span className="hint">{filteredVendors.length} kitchens & vendors available</span>
            </div>

            {vendors.loading ? (
              <Card flush>
                <SkeletonRows rows={4} cols={3} />
              </Card>
            ) : null}

            {!vendors.loading && filteredVendors.length === 0 ? (
              <Empty
                glyph="🔍"
                title="No matching cloud kitchens found"
                text="Try searching with a different keyword or location."
              />
            ) : null}

            {!vendors.loading && filteredVendors.length > 0 ? (
              <div className="grid-2" style={{ gap: 'var(--s-5)' }}>
                {filteredVendors.map((vendor) => (
                  <Card key={vendor.id}>
                    <div style={{ marginBottom: 'var(--s-3)' }}>
                      <h2 style={{ fontSize: '1.25rem', margin: 0 }}>🏪 {vendor.name}</h2>
                      <span className="hint">
                        📍 {vendor.city || 'Pune'}, {vendor.state || 'Maharashtra'} · 📞 {vendor.phone || 'Verified'}
                      </span>
                    </div>

                    <div className="col" style={{ gap: 'var(--s-3)' }}>
                      {vendor.products.map((prod) => (
                        <div
                          key={prod.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 'var(--s-3)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--r-md)',
                            background: 'var(--surface)',
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: '0.9375rem', display: 'block' }}>{prod.name}</strong>
                            <span className="hint">
                              {money(prod.pricePaise)} per {prod.unitLabel}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleOpenSubscribe(vendor, prod)}
                          >
                            Subscribe & Pay Advance →
                          </button>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Subscribe Form Modal */}
        {showSubscribeModal && selectedVendor && selectedProduct ? (
          <div className="modal-backdrop" onClick={() => setShowSubscribeModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
              <h3>Subscribe to {selectedProduct.name}</h3>
              <p className="hint">
                Vendor: <b>{selectedVendor.name}</b> · Upfront advance payment is required. Once paid, your request is submitted for Owner Approval.
              </p>

              <form onSubmit={handleStartPayment}>
                <Field label="Your Full Name" id="c-name">
                  <input
                    type="text"
                    className="input"
                    required
                    value={subForm.customerName}
                    onChange={(e) => setSubForm((f) => ({ ...f, customerName: e.target.value }))}
                  />
                </Field>

                <Field label="Delivery Doorstep Address" id="c-addr">
                  <input
                    type="text"
                    className="input"
                    required
                    placeholder="Flat No, Floor, Wing, Building Name"
                    value={subForm.address}
                    onChange={(e) => setSubForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </Field>

                <Field label="Landmark (Optional)" id="c-landmark">
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Near Garden / Gate 2"
                    value={subForm.landmark}
                    onChange={(e) => setSubForm((f) => ({ ...f, landmark: e.target.value }))}
                  />
                </Field>

                <div className="row" style={{ gap: 'var(--s-3)' }}>
                  <Field label="Daily Quantity" id="c-qty">
                    <input
                      type="number"
                      min="1"
                      max="50"
                      className="input"
                      value={subForm.quantity}
                      onChange={(e) => setSubForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                    />
                  </Field>

                  <Field label="Advance Term" id="c-term">
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
                    <span className="hint">Rate:</span>
                    <span>
                      {money(selectedProduct.pricePaise)} × {subForm.quantity} {selectedProduct.unitLabel}/day
                    </span>
                  </div>
                  <div className="row spread" style={{ marginTop: 'var(--s-2)' }}>
                    <strong>Total Advance Payable:</strong>
                    <strong style={{ color: 'var(--brand-600)', fontSize: '1.1rem' }}>
                      {money(selectedProduct.pricePaise * subForm.quantity * subForm.advanceDays)}
                    </strong>
                  </div>
                </div>

                <div className="row spread" style={{ marginTop: 'var(--s-4)' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowSubscribeModal(false)}>
                    Cancel
                  </button>
                  <SubmitButton>Pay via UPI QR →</SubmitButton>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {/* UPI QR Payment Modal */}
        {paymentModalState ? (
          <UpiPaymentModal
            amountPaise={paymentModalState.amountPaise}
            vendorName={paymentModalState.vendorName}
            productName={paymentModalState.productName}
            customerName={paymentModalState.customerName}
            onSuccess={handlePaymentSuccess}
            onClose={() => setPaymentModalState(null)}
          />
        ) : null}
      </main>
    </div>
  );
}
