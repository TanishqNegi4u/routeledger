import { useEffect, useRef } from 'react';

/**
 * Shared presentational primitives. These are thin on purpose - they wrap the class names defined in
 * global.css so screens stay declarative and every table, badge and empty state looks the same.
 */

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="row spread wrap" style={{ gap: 'var(--s-4)', marginBottom: 'var(--s-5)' }}>
      <div>
        <h1 style={{ font: 'var(--t-h1)', letterSpacing: 'var(--track-tight)' }}>{title}</h1>
        {subtitle ? (
          <p className="muted" style={{ marginTop: 'var(--s-1)', maxWidth: 'var(--prose-max)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {children ? <div className="row wrap">{children}</div> : null}
    </header>
  );
}

export function Card({ title, subtitle, actions, flush, children, style }) {
  return (
    <section className="card" style={style}>
      {title || actions ? (
        <div className="card-head">
          <div>
            <h2 className="card-title">{title}</h2>
            {subtitle ? <div className="card-sub">{subtitle}</div> : null}
          </div>
          {actions ? <div className="row wrap">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? 'card-body card-flush' : 'card-body'}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, error, htmlFor, children }) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="error-text">{error}</span> : null}
      {!error && hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Skeleton({ width = '100%', height = 12, radius }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: radius || 'var(--r-xs)' }}
      aria-hidden="true"
    />
  );
}

export function SkeletonRows({ rows = 5, cols = 4 }) {
  return (
    <div className="col" style={{ gap: 'var(--s-4)', padding: 'var(--s-5)' }} aria-hidden="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="row" key={rowIndex} style={{ gap: 'var(--s-4)' }}>
          {Array.from({ length: cols }).map((__, colIndex) => (
            <Skeleton key={colIndex} width={colIndex === 0 ? '26%' : `${Math.max(10, 60 / cols)}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonKpi() {
  return (
    <div className="card" style={{ padding: 'var(--s-5)' }} aria-hidden="true">
      <Skeleton width="40%" height={12} />
      <div style={{ marginTop: 'var(--s-3)' }}>
        <Skeleton width="70%" height={28} />
      </div>
      <div style={{ marginTop: 'var(--s-2)' }}>
        <Skeleton width="50%" height={10} />
      </div>
    </div>
  );
}

export function SkeletonCard({ rows = 4, cols = 4, title = true }) {
  return (
    <div className="card" aria-hidden="true">
      {title ? (
        <div className="card-head">
          <Skeleton width="30%" height={16} />
        </div>
      ) : null}
      <SkeletonRows rows={rows} cols={cols} />
    </div>
  );
}

export function Empty({ glyph = '◦', title, text, children }) {
  return (
    <div className="empty">
      <div className="empty-glyph" aria-hidden="true">
        {glyph}
      </div>
      <div className="empty-title">{title}</div>
      {text ? <div className="empty-text">{text}</div> : null}
      {children ? <div className="row" style={{ marginTop: 'var(--s-2)' }}>{children}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty">
      <div
        className="empty-glyph"
        style={{ background: 'var(--risk-50)', color: 'var(--risk-600)' }}
        aria-hidden="true"
      >
        !
      </div>
      <div className="empty-title">That did not load</div>
      <div className="empty-text">{error?.message || 'Unexpected failure.'}</div>
      {onRetry ? (
        <button type="button" className="btn btn-sm" onClick={onRetry} style={{ marginTop: 'var(--s-2)' }}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

const TONE_BY_STATUS = {
  // Green: DELIVERED, PAID, COMPLETED, ACTIVE, CURRENT
  DELIVERED: 'badge-good',
  COMPLETED: 'badge-good',
  PAID: 'badge-good',
  ACTIVE: 'badge-good',
  CURRENT: 'badge-good',

  // Amber: PENDING, PARTIAL, DUE_SOON, IN_PROGRESS, PLANNED
  PENDING: 'badge-warn',
  PARTIAL: 'badge-warn',
  DUE_SOON: 'badge-warn',
  IN_PROGRESS: 'badge-info',
  PLANNED: 'badge-brand',

  // Red: ABSENT, UNPAID, OVERDUE, AT_RISK, FAILED
  ABSENT: 'badge-risk',
  UNPAID: 'badge-risk',
  OVERDUE_30: 'badge-risk',
  OVERDUE_60: 'badge-risk',
  AT_RISK: 'badge-risk',
  FAILED: 'badge-risk',

  // Muted/Gray: SKIPPED, VOID, INACTIVE, DRAFT, CANCELLED
  SKIPPED: 'badge-plain',
  VOID: 'badge-plain',
  INACTIVE: 'badge-plain',
  DRAFT: 'badge-plain',
  CANCELLED: 'badge-plain',
};

/** One badge for every enum the API returns, styled with consistent color mapping. */
export function StatusBadge({ value, children }) {
  if (!value && !children) return null;
  const key = String(value || '').toUpperCase();
  const tone = TONE_BY_STATUS[key] ?? 'badge-plain';
  return <span className={`badge ${tone}`}>{children || humanise(key)}</span>;
}

export function humanise(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Side sheet used for every create/edit form. Closes on Escape and on backdrop click. */
export function Drawer({ open, title, subtitle, onClose, footer, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="backdrop" onClick={onClose} role="presentation" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <div>
            <h2 className="card-title">{title}</h2>
            {subtitle ? <div className="card-sub">{subtitle}</div> : null}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </aside>
    </>
  );
}

/** Submit button that shows its own progress, with snappy micro-interaction states. */
export function SubmitButton({ busy, success = false, children, className = 'btn btn-primary', ...rest }) {
  return (
    <button
      type="submit"
      className={`${className} ${success ? 'btn-good' : ''}`}
      disabled={busy || success}
      style={{
        transition: 'background var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out)',
        ...(rest.style || {}),
      }}
      {...rest}
    >
      {busy ? (
        <span className="spinner" aria-hidden="true" />
      ) : success ? (
        <span aria-hidden="true" style={{ fontWeight: 700 }}>✓</span>
      ) : null}
      {busy ? 'Working…' : success ? 'Saved' : children}
    </button>
  );
}

export function Pager({ page, size, totalElements, totalPages, onPage, busy }) {
  const current = Number(page || 0);
  const pages = Number(totalPages || 0);
  const first = totalElements === 0 ? 0 : current * Number(size || 0) + 1;
  const last = Math.min(totalElements, (current + 1) * Number(size || 0));
  return (
    <div className="pager">
      <span className="hint num">
        {totalElements === 0 ? 'Nothing to show' : `${first}–${last} of ${totalElements}`}
      </span>
      <div className="row" style={{ gap: 'var(--s-2)' }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onPage(current - 1)}
          disabled={busy || current <= 0}
        >
          ← Previous
        </button>
        <span className="hint num">
          {pages === 0 ? '0 / 0' : `${current + 1} / ${pages}`}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onPage(current + 1)}
          disabled={busy || current + 1 >= pages}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/** Confirmation for the few destructive actions in the app. */
export function Confirm({ open, title, text, confirmLabel = 'Confirm', tone = 'btn-danger', onCancel, onConfirm, busy }) {
  if (!open) return null;
  return (
    <>
      <div className="backdrop" onClick={onCancel} role="presentation" />
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          zIndex: 'var(--z-drawer)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(420px, calc(100vw - 2rem))',
          boxShadow: 'var(--sh-lg)',
        }}
      >
        <div className="card-body col">
          <h2 className="card-title">{title}</h2>
          <p className="muted" style={{ font: 'var(--t-small)' }}>{text}</p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s-2)' }}>
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={`btn ${tone}`} onClick={onConfirm} disabled={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** KPI tile. `tone` tints the value, `foot` carries the comparison line under it, `badge` shows context tag. */
export function Kpi({ label, value, foot, tone, loading, glyph, badge }) {
  const colour =
    tone === 'good'
      ? 'var(--good-600)'
      : tone === 'warn'
        ? 'var(--warn-600)'
        : tone === 'risk'
          ? 'var(--risk-600)'
          : 'var(--text)';
  return (
    <div className="card" style={{ padding: 'var(--s-4) var(--s-5)' }}>
      <div className="row spread">
        <span className="section-title">{label}</span>
        {glyph ? (
          <span aria-hidden="true" className="faint" style={{ fontSize: '0.95rem' }}>
            {glyph}
          </span>
        ) : null}
      </div>
      {loading ? (
        <div style={{ marginTop: 'var(--s-3)' }}>
          <Skeleton width="60%" height={26} />
        </div>
      ) : (
        <div className="row wrap" style={{ gap: 'var(--s-2)', alignItems: 'baseline', marginTop: 'var(--s-2)' }}>
          <div
            className="num"
            style={{
              fontSize: '1.6rem',
              fontWeight: 700,
              letterSpacing: 'var(--track-tight)',
              color: colour,
            }}
          >
            {value}
          </div>
          {badge ? <span className="nowrap">{badge}</span> : null}
        </div>
      )}
      {foot ? (
        <div className="hint" style={{ marginTop: 'var(--s-1)' }}>
          {foot}
        </div>
      ) : null}
    </div>
  );
}

/** Fixed-width grid of KPI tiles that collapses cleanly on a phone. */
export function KpiGrid({ children }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 'var(--s-4)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
      }}
    >
      {children}
    </div>
  );
}

/** Focuses its child input once, on mount - used by search boxes and drawer forms. */
export function AutoFocus({ children }) {
  const holder = useRef(null);
  useEffect(() => {
    const input = holder.current?.querySelector('input, select, textarea');
    if (input) input.focus();
  }, []);
  return <div ref={holder}>{children}</div>;
}
