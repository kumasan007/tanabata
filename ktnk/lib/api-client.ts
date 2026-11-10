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
  if (!dedupe || method !== "GET") return fetchWithTimeout(input, requestInit, signal, timeoutMs ?? (method === "GET" ? 5_000 : 20_000), method === "GET");
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  const sortedHeaders = [...headers.entries()].sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([input, { ...init, method: "GET", headers: sortedHeaders }, timeoutMs ?? 5_000]);
  let shared = inFlight.get(key);
  if (!shared) {
    const controller = new AbortController();
    const entry: SharedRequest = {
      controller, users: 0, settled: false,
      promise: fetchWithTimeout(input, requestInit, controller.signal, timeoutMs ?? 5_000, true).finally(() => {
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

async function fetchWithTimeout(input: string, init: RequestInit, signal: AbortSignal | null | undefined, timeoutMs: number, isRead = false) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = globalThis.setTimeout(() => controller.abort(new DOMException(isRead ? "通信に時間がかかっています。接続を確認して再読み込みしてください。" : "通信がタイムアウトしました。保存済みの可能性があります。再送信する前に最新の内容を確認してください。", "TimeoutError")), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    // Mutations can also stall after headers arrive. Keep the deadline active
    // through the body without consuming the caller's response or retrying writes.
    await response.clone().arrayBuffer();
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
  const fallback = "通信に失敗しました。時間をおいて再度お試しください。";
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(response.ok ? "通信結果を確認できませんでした。最新の内容を確認してください。" : fallback);
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? body.error : null;
    throw new Error(typeof message === "string" && message.trim() ? message : fallback);
  }
  return body as T;
}

