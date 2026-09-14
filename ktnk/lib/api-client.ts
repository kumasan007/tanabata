type ApiOptions = RequestInit & { dedupe?: boolean };

const inFlight = new Map<string, Promise<Response>>();

export function apiFetch(input: string, options: ApiOptions = {}) {
  const { dedupe = (options.method == null || options.method === "GET") && !options.signal, ...init } = options;
  if (!dedupe) return fetch(input, init);
  const key = `${init.method ?? "GET"}:${input}`;
  const existing = inFlight.get(key);
  if (existing) return existing.then((response) => response.clone());
  const request = fetch(input, init).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request.then((response) => response.clone());
}

export async function apiJson<T>(input: string, options?: ApiOptions): Promise<T> {
  const response = await apiFetch(input, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? "通信に失敗しました。時間をおいて再度お試しください。");
  return body as T;
}

export function clearApiRequests() {
  inFlight.clear();
}
