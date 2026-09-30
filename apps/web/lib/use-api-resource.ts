"use client";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./api";

/** Abort obsolete requests so a previous repository/filter cannot replace current data. */
export function useApiResource<T>(path: string | null, { pollMs = 0, delayMs = 0 }: { pollMs?: number; delayMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(Boolean(path));
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    const abort = new AbortController(); let pending = false;
    setData(null); setError(""); setLoading(Boolean(path));
    if (!path) return () => abort.abort();
    const fetchData = async () => {
      if (pending) return; pending = true;
      try {
        const result = await apiRequest<T>(path, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(60000)]) });
        if (!abort.signal.aborted) { setData(result); setError(""); }
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load data"); }
      finally { pending = false; if (!abort.signal.aborted) setLoading(false); }
    };
    const start = setTimeout(() => void fetchData(), delayMs);
    const poll = pollMs ? setInterval(() => void fetchData(), pollMs) : undefined;
    return () => { abort.abort(); clearTimeout(start); clearInterval(poll); };
  }, [path, version, pollMs, delayMs]);
  return { data, error, loading, reload };
}
