type ApiOptions = RequestInit & { dedupe?: boolean };

type SharedRequest = { promise: Promise<Response>; controller: AbortController; users: number; settled: boolean };
const inFlight = new Map<string, SharedRequest>();

export function apiFetch(input: string, options: ApiOptions = {}) {
  const { dedupe = true, signal, ...init } = options;
  if (!dedupe || (init.method ?? "GET").toUpperCase() !== "GET") return fetch(input, { ...init, signal });
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  const headers = [...new Headers(init.headers).entries()].sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([input, { ...init, method: "GET", headers }]);
  let shared = inFlight.get(key);
  if (!shared) {
    const controller = new AbortController();
    const entry: SharedRequest = {
      controller, users: 0, settled: false,
      promise: fetch(input, { ...init, signal: controller.signal }).finally(() => {
        entry.settled = true;
        if (inFlight.get(key) === entry) inFlight.delete(key);
      }),
    };
    shared = entry;
    inFlight.set(key, entry);
  }
  const entry = shared;
  entry.users++;
  return new Promise<Response>((resolve, reject) => {
    let finished = false;
    const release = () => {
      if (finished) return false;
      finished = true;
      signal?.removeEventListener("abort", abort);
      entry.users--;
      // A remount in the same turn can reuse the request before it is cancelled.
      queueMicrotask(() => {
        if (!entry.settled && entry.users === 0) {
          if (inFlight.get(key) === entry) inFlight.delete(key);
          entry.controller.abort();
        }
      });
      return true;
    };
    const abort = () => {
      if (release()) reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    entry.promise.then(response => {
      if (release()) resolve(response.clone());
    }, error => { if (release()) reject(error); });
  });
}

export async function apiJson<T>(input: string, options?: ApiOptions): Promise<T> {
  const response = await apiFetch(input, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? "通信に失敗しました。時間をおいて再度お試しください。");
  return body as T;
}

