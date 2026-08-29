import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * Toasts. Deliberately tiny: an array of messages, auto-dismissed, with a hard cap so a burst of
 * failures cannot bury the screen. Errors stay twice as long as confirmations because people need
 * time to read what went wrong.
 */

const ToastContext = createContext(null);
const MAX_VISIBLE = 4;

let sequence = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone, title, text, ttl) => {
      sequence += 1;
      const id = sequence;
      const life = ttl ?? (tone === 'error' ? 7000 : 3600);
      setToasts((current) => [...current, { id, tone, title, text }].slice(-MAX_VISIBLE));
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), life),
      );
      return id;
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      success: (title, text) => push('good', title, text),
      error: (title, text) => push('error', title, text),
      info: (title, text) => push('info', title, text),
      /** Accepts the normalised error object from api.js directly. */
      fromError: (error, fallback = 'Something went wrong') =>
        push('error', fallback, error?.message || 'Unexpected failure.'),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <div className="grow">
              <div className="toast-title">{toast.title}</div>
              {toast.text ? <div className="toast-text">{toast.text}</div> : null}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }
  return context;
}
