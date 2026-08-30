import { useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useAsync } from '../lib/useAsync.js';
import { Card, Empty, ErrorState, PageHeader, SkeletonRows, StatusBadge } from '../components/ui.jsx';
import { longDate, money } from '../lib/format.js';

/**
 * Owner-Exclusive Approval Dashboard.
 * 
 * Only customers who have completed their advance payment arrive in this queue.
 * Once the Owner approves, the subscription becomes ACTIVE and flows downstream
 * to the Manager's kitchen schedule and the Agent's 2-Opt sequenced morning run.
 */
export default function Approvals() {
  const toast = useToast();
  const [actionBusyId, setActionBusyId] = useState(null);

  const pending = useAsync(() => api.subscriptions.pendingApprovals(), []);

  const handleApprove = async (sub) => {
    setActionBusyId(sub.id);
    try {
      await api.subscriptions.approve(sub.id);
      toast.success(
        `Approved ${sub.customerName}`,
        `Service activated. Dispatched to Manager & Agent delivery runs starting ${sub.startOn}.`,
      );
      pending.reload();
    } catch (error) {
      toast.fromError(error, 'Could not approve subscription');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleReject = async (sub) => {
    setActionBusyId(sub.id);
    try {
      await api.subscriptions.reject(sub.id);
      toast.info(`Rejected request from ${sub.customerName}`, 'Advance payment queued for refund.');
      pending.reload();
    } catch (error) {
      toast.fromError(error, 'Could not reject subscription');
    } finally {
      setActionBusyId(null);
    }
  };

  const list = pending.data?.pendingSubscriptions || [];
  const totalPendingPaise = list.reduce((sum, item) => sum + Number(item.advancePaidPaise || 0), 0);

  return (
    <>
      <PageHeader
        title="Advance Service Approvals"
        subtitle="Owner authorization queue. Advance payments are verified before services are dispatched to kitchen managers and delivery agents."
      >
        <div className="row" style={{ gap: 'var(--s-3)' }}>
          <div className="badge badge-brand" style={{ padding: 'var(--s-2) var(--s-3)' }}>
            <b>{list.length}</b> Pending Approvals
          </div>
          {totalPendingPaise > 0 ? (
            <div className="badge badge-good" style={{ padding: 'var(--s-2) var(--s-3)' }}>
              Advance Collected: <b>{money(totalPendingPaise)}</b>
            </div>
          ) : null}
        </div>
      </PageHeader>

      {pending.error ? <ErrorState error={pending.error} onRetry={pending.reload} /> : null}

      {!pending.error && pending.loading ? (
        <Card flush>
          <SkeletonRows rows={4} cols={5} />
        </Card>
      ) : null}

      {!pending.error && !pending.loading && list.length === 0 ? (
        <Empty
          glyph="✓"
          title="All advance subscriptions are approved"
          text="No pending customer requests. When a new customer subscribes and pays upfront through the portal, their request will land here for your approval."
        />
      ) : null}

      {!pending.error && !pending.loading && list.length > 0 ? (
        <Card flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Meal / Product</th>
                  <th>Quantity</th>
                  <th>Schedule</th>
                  <th>Advance Paid</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Owner Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <b>{sub.customerName}</b>
                      <span className="hint" style={{ display: 'block' }}>
                        Customer ID #{sub.customerId}
                      </span>
                    </td>
                    <td>
                      <b>{sub.productName}</b>
                      <span className="hint" style={{ display: 'block' }}>
                        {money(sub.unitPricePaise)} per {sub.unitLabel}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-plain">
                        {sub.quantity} {sub.unitLabel}
                      </span>
                    </td>
                    <td>
                      <b>{sub.weekdayLabel}</b>
                      <span className="hint" style={{ display: 'block' }}>
                        From {longDate(sub.startOn)}
                      </span>
                    </td>
                    <td>
                      <b style={{ color: 'var(--good-600)' }}>
                        {money(sub.advancePaidPaise || sub.perDeliveryPaise * 30)}
                      </b>
                      <span className="hint" style={{ display: 'block' }}>
                        UPI Verified
                      </span>
                    </td>
                    <td>
                      <StatusBadge value={sub.approvalStatus || 'PENDING_APPROVAL'}>
                        Pending Approval
                      </StatusBadge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--s-2)' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ color: 'var(--risk-600)' }}
                          disabled={actionBusyId === sub.id}
                          onClick={() => handleReject(sub)}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={actionBusyId === sub.id}
                          onClick={() => handleApprove(sub)}
                        >
                          {actionBusyId === sub.id ? 'Approving…' : '✓ Approve Service'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}
