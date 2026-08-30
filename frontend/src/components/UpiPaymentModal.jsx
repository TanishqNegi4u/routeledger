import { useState } from 'react';
import { money } from '../lib/format.js';

/**
 * Dedicated UPI QR and Instant Payment Simulator for Customers.
 * Generates test UPI references and simulates realistic bank gateway success.
 */
export default function UpiPaymentModal({
  amountPaise,
  vendorName,
  productName,
  customerName,
  onSuccess,
  onClose,
}) {
  const [busy, setBusy] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('QR'); // 'QR' | 'UPI_ID'
  const [upiIdInput, setUpiIdInput] = useState('customer@okhdfcbank');

  const handleSimulateSuccess = () => {
    setBusy(true);
    setTimeout(() => {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let tail = '';
      for (let i = 0; i < 8; i += 1) {
        tail += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      const ref = `UPI-ADV-${tail}`;
      setBusy(false);
      onSuccess(ref);
    }, 600);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, textAlign: 'center' }}
      >
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 'var(--s-3)' }}>
          <div className="badge badge-brand">⚡ Instant UPI Checkout</div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onClose}
            style={{ fontSize: '1.2rem', padding: '0 var(--s-2)' }}
          >
            ✕
          </button>
        </div>

        <h2 style={{ fontSize: '1.25rem', margin: '0 0 var(--s-1)' }}>Advance Payment to {vendorName}</h2>
        <span className="hint">{productName} for {customerName}</span>

        {/* Amount Box */}
        <div
          style={{
            background: 'var(--surface-muted)',
            borderRadius: 'var(--r-md)',
            padding: 'var(--s-3)',
            margin: 'var(--s-4) 0',
            border: '1px solid var(--border)',
          }}
        >
          <span className="hint" style={{ fontSize: '0.8125rem' }}>Total Amount Payable</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--good-600)' }}>
            {money(amountPaise)}
          </div>
        </div>

        {/* Method Toggle */}
        <div className="row" style={{ gap: 'var(--s-2)', justifyContent: 'center', marginBottom: 'var(--s-4)' }}>
          <button
            type="button"
            className={`btn btn-sm ${selectedMethod === 'QR' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedMethod('QR')}
          >
            📲 Scan UPI QR Code
          </button>
          <button
            type="button"
            className={`btn btn-sm ${selectedMethod === 'UPI_ID' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedMethod('UPI_ID')}
          >
            💳 Enter UPI ID
          </button>
        </div>

        {selectedMethod === 'QR' ? (
          <div
            style={{
              padding: 'var(--s-4)',
              background: '#fff',
              borderRadius: 'var(--r-md)',
              border: '2px dashed var(--border)',
              display: 'inline-block',
              margin: '0 auto var(--s-3)',
            }}
          >
            {/* Real SVG QR code mockup */}
            <svg width="180" height="180" viewBox="0 0 100 100" style={{ display: 'block' }}>
              <rect width="100" height="100" fill="#ffffff" />
              {/* Corner squares */}
              <rect x="10" y="10" width="25" height="25" fill="#0f172a" />
              <rect x="15" y="15" width="15" height="15" fill="#ffffff" />
              <rect x="18" y="18" width="9" height="9" fill="#0f172a" />

              <rect x="65" y="10" width="25" height="25" fill="#0f172a" />
              <rect x="70" y="15" width="15" height="15" fill="#ffffff" />
              <rect x="73" y="18" width="9" height="9" fill="#0f172a" />

              <rect x="10" y="65" width="25" height="25" fill="#0f172a" />
              <rect x="15" y="70" width="15" height="15" fill="#ffffff" />
              <rect x="18" y="73" width="9" height="9" fill="#0f172a" />

              {/* Data dots */}
              <rect x="42" y="15" width="5" height="15" fill="#0f172a" />
              <rect x="52" y="10" width="8" height="5" fill="#0f172a" />
              <rect x="45" y="40" width="15" height="15" fill="#0f172a" />
              <rect x="20" y="45" width="10" height="8" fill="#0f172a" />
              <rect x="70" y="45" width="15" height="8" fill="#0f172a" />
              <rect x="42" y="65" width="8" height="20" fill="#0f172a" />
              <rect x="55" y="75" width="18" height="10" fill="#0f172a" />
              <rect x="80" y="70" width="8" height="15" fill="#0f172a" />
            </svg>
            <span style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginTop: 6 }}>
              UPI ID: {vendorName.toLowerCase().replace(/\s+/g, '')}@upi
            </span>
          </div>
        ) : (
          <div style={{ padding: 'var(--s-3) 0', textAlign: 'left' }}>
            <label className="hint" style={{ display: 'block', marginBottom: 'var(--s-1)' }}>
              Your Virtual Payment Address (VPA)
            </label>
            <input
              type="text"
              className="input"
              value={upiIdInput}
              onChange={(e) => setUpiIdInput(e.target.value)}
              placeholder="e.g. mobile@upi"
            />
          </div>
        )}

        <div style={{ marginTop: 'var(--s-3)' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            style={{
              width: '100%',
              padding: 'var(--s-3)',
              fontSize: '1rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, var(--brand-600), var(--good-600))',
              border: 'none',
            }}
            onClick={handleSimulateSuccess}
          >
            {busy ? 'Verifying with Bank…' : '⚡ Simulate Instant Payment Success'}
          </button>
        </div>

        <p className="hint" style={{ fontSize: '0.75rem', marginTop: 'var(--s-3)' }}>
          🔒 Test Mode: No real funds debited. Completing this records the advance receipt and sends the subscription to <b>{vendorName}</b> for Owner Approval.
        </p>
      </div>
    </div>
  );
}
