import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The one data-fetching hook the app uses.
 *
 * `useAsync(fn, deps)` runs `fn` on mount and whenever `deps` change, tracks loading and the
 * normalised error, ignores results from a request that has already been superseded, and exposes
 * `reload()` plus `patch()` for optimistic updates that need to be rolled back on failure.
 */
export function useAsync(fn, deps = [], options = {}) {
  const { skip = false, initial = null } = options;
  const [data, setData] = useState(initial);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!skip);
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (quiet = false) => {
      const ticket = generation.current + 1;
      generation.current = ticket;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const result = await fn();
        if (!mounted.current || generation.current !== ticket) return undefined;
        setData(result);
        return result;
      } catch (failure) {
        if (!mounted.current || generation.current !== ticket) return undefined;
        setError(failure);
        return undefined;
      } finally {
        if (mounted.current && generation.current === ticket) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    if (skip) {
      setLoading(false);
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, skip]);

  return {
    data,
    error,
    loading,
    setData,
    reload: () => run(false),
    refresh: () => run(true),
  };
}

/**
 * Checks whether an error is due to a network/offline failure rather than a server validation failure.
 */
export function isNetworkError(error) {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return error.status === 0 || !error.status || error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK';
}

/**
 * Optimistic mutation helper: apply `next` immediately, call the server, roll the value back if the
 * call fails (unless shouldRollback returns false). Returns the promise so callers can chain a toast.
 */
export function useOptimistic(setData) {
  return useCallback(
    async (mutate, request, onError, shouldRollback) => {
      let snapshot;
      setData((current) => {
        snapshot = current;
        return mutate(current);
      });
      try {
        return await request();
      } catch (failure) {
        const doRollback =
          typeof shouldRollback === 'function' ? shouldRollback(failure) : shouldRollback !== false;
        if (doRollback) {
          setData(snapshot);
        }
        if (onError) onError(failure, !doRollback);
        throw failure;
      }
    },
    [setData],
  );
}

/**
 * In-memory pending sync queue for offline updates.
 * Retries on the browser's 'online' event and every ~15s while items are queued.
 * Network failures keep items in queue; non-network/validation failures stop retrying and notify.
 */
export function useOfflineQueue(syncAction) {
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const syncActionRef = useRef(syncAction);
  syncActionRef.current = syncAction;
  const isSyncingRef = useRef(false);

  const enqueue = useCallback((item) => {
    setQueue((prev) => {
      const existingIndex = prev.findIndex((q) => q.stopId === item.stopId);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], ...item, timestamp: Date.now() };
        return next;
      }
      return [
        ...prev,
        { ...item, id: item.id || `${item.stopId}-${Date.now()}`, timestamp: Date.now() },
      ];
    });
  }, []);

  const dequeue = useCallback((stopId) => {
    setQueue((prev) => prev.filter((item) => item.stopId !== stopId));
  }, []);

  const processQueue = useCallback(async () => {
    if (isSyncingRef.current || queueRef.current.length === 0) return;
    isSyncingRef.current = true;
    setSyncing(true);

    try {
      const itemsToSync = [...queueRef.current];
      for (const item of itemsToSync) {
        try {
          const result = await syncActionRef.current(item);
          setQueue((prev) => prev.filter((q) => q.stopId !== item.stopId));
          if (item.onSuccess) item.onSuccess(result);
        } catch (err) {
          if (isNetworkError(err)) {
            // Still no connection: keep remaining items in queue and wait for next trigger
            break;
          } else {
            // Real non-network failure (e.g. 409 conflict, run closed): stop retrying this item
            setQueue((prev) => prev.filter((q) => q.stopId !== item.stopId));
            if (item.onError) item.onError(err);
          }
        }
      }
    } finally {
      isSyncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      processQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [processQueue]);

  useEffect(() => {
    if (queue.length === 0) return;
    const timer = window.setInterval(() => {
      processQueue();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [queue.length, processQueue]);

  return {
    queue,
    enqueue,
    dequeue,
    processQueue,
    syncing,
    pendingCount: queue.length,
  };
}

/** Debounces a rapidly changing value - used by the customer search box. */
export function useDebounced(value, delay = 220) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
