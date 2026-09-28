type ApiOptions = RequestInit & { dedupe?: boolean; timeoutMs?: number };

type SharedRequest = { promise: Promise<Response>; controller: AbortController; users: number; settled: boolean };
const inFlight = new Map<string, SharedRequest>();
let memoryDeviceId = "";

function getDeviceId() {
  if (memoryDeviceId) return memoryDeviceId;
  try {
    memoryDeviceId = window.localStorage.getItem("ktnk-device-id") ?? "";
    if (!memoryDeviceId) {
      memoryDeviceId = crypto.randomUUID();
      window.localStorage.setItem("ktnk-device-id", memoryDeviceId);
    }
  } catch {
    // Storage may be unavailable in private or restricted browser modes.
    memoryDeviceId = crypto.randomUUID();
  }
  return memoryDeviceId;
}

export function apiFetch(input: string, options: ApiOptions = {}) {
  const { dedupe = true, signal, timeoutMs, ...init } = options;
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && typeof window !== "undefined") {
    headers.set("x-ktnk-device", getDeviceId());
  }
  const requestInit = { ...init, headers };
  if (!dedupe || method !== "GET") return fetchWithTimeout(input, requestInit, signal, timeoutMs ?? (method === "GET" ? 60_000 : 20_000), method === "GET");
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  const sortedHeaders = [...headers.entries()].sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([input, { ...init, method: "GET", headers: sortedHeaders }, timeoutMs ?? 60_000]);
  let shared = inFlight.get(key);
  if (!shared) {
    const controller = new AbortController();
    const entry: SharedRequest = {
      controller, users: 0, settled: false,
      promise: fetchWithTimeout(input, requestInit, controller.signal, timeoutMs ?? 60_000, true).finally(() => {
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

async function fetchWithTimeout(input: string, init: RequestInit, signal: AbortSignal | null | undefined, timeoutMs: number, readBody = false) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = globalThis.setTimeout(() => controller.abort(new DOMException(readBody ? "通信に時間がかかっています。接続を確認して再読み込みしてください。" : "通信がタイムアウトしました。入力内容を確認して、もう一度送信してください。", "TimeoutError")), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    // Keep the deadline active until the JSON body has arrived, not only the headers.
    if (readBody) await response.clone().arrayBuffer();
    return response;
  } catch (error) {
    throw controller.signal.aborted ? controller.signal.reason : error;
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function apiJson<T>(input: string, options?: ApiOptions): Promise<T> {
  const response = await apiFetch(input, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? "通信に失敗しました。時間をおいて再度お試しください。");
  return body as T;
}

