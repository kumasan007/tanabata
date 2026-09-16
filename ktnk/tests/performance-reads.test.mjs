import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(path, globals = {}, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, {
    exports, Headers, AbortController, DOMException, Error, queueMicrotask, ...globals,
    require: name => dependencies[name],
  });
  return exports;
}

function transport() {
  const requests = [];
  const api = load("lib/api-client.ts", { fetch: (url, init) => new Promise((resolve, reject) => {
    requests.push({ url, init, resolve, reject });
    init.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }) });
  return { ...api, requests };
}

test("shared GET lets one caller cancel without cancelling the other", async () => {
  const { apiFetch, requests } = transport();
  const a = new AbortController();
  const b = new AbortController();
  const first = apiFetch("/api/calendar", { signal: a.signal });
  const second = apiFetch("/api/calendar", { signal: b.signal });
  assert.equal(requests.length, 1);
  a.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(requests[0].init.signal.aborted, false);
  requests[0].resolve(new Response(JSON.stringify({ schedules: [1] })));
  assert.deepEqual(await (await second).json(), { schedules: [1] });
});

test("all cancelled callers stop the network; a same-turn remount reuses it", async () => {
  const { apiFetch, requests } = transport();
  const a = new AbortController();
  const first = apiFetch("/api/calendar", { signal: a.signal });
  a.abort();
  const second = apiFetch("/api/calendar");
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.signal.aborted, false);
  requests[0].resolve(new Response("{}"));
  await second;
  const b = new AbortController();
  const third = apiFetch("/api/calendar", { signal: b.signal });
  b.abort();
  await assert.rejects(third, { name: "AbortError" });
  await Promise.resolve();
  assert.equal(requests[1].init.signal.aborted, true);
});

test("shared responses have independent bodies; mutations and different headers stay separate", async () => {
  const { apiFetch, requests } = transport();
  const a = apiFetch("/api/calendar");
  const b = apiFetch("/api/calendar");
  requests[0].resolve(new Response("{\"count\":3}"));
  const bodies = await Promise.all([a.then(r => r.json()), b.then(r => r.json())]);
  assert.deepEqual(bodies, [{ count: 3 }, { count: 3 }]);
  const separate = [
    apiFetch("/api/calendar", { headers: { Authorization: "a" } }),
    apiFetch("/api/calendar", { headers: { Authorization: "b" } }),
    apiFetch("/api/calendar", { method: "POST" }),
    apiFetch("/api/calendar", { method: "POST" }),
  ];
  assert.equal(requests.length, 5);
  for (const request of requests.slice(1)) request.resolve(new Response("{}"));
  await Promise.all(separate);
});

test("a shared network failure rejects both callers and permits retry", async () => {
  const { apiFetch, requests } = transport();
  const a = apiFetch("/api/calendar");
  const b = apiFetch("/api/calendar");
  requests[0].reject(new Error("offline"));
  await Promise.all([assert.rejects(a, /offline/), assert.rejects(b, /offline/)]);
  const retry = apiFetch("/api/calendar");
  assert.equal(requests.length, 2);
  requests[1].resolve(new Response("{}"));
  await retry;
});

test("pagination preserves rows beyond the response limit and rejects incomplete results", async () => {
  const { readAllRows } = load("lib/read-all-rows.ts");
  const rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const ranges = [];
  const result = await readAllRows({ range(from, to) {
    ranges.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  } });
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
  assert.equal(result.data.length, 1201);
  assert.equal(result.data[1200].id, 1200);
  const failure = await readAllRows({ range(from) {
    return Promise.resolve(from === 0 ? { data: rows.slice(0, 1000), error: null } : { data: null, error: { message: "offline" } });
  } });
  assert.equal(failure.data.length, 0);
  assert.equal(failure.error.message, "offline");
});

test("calendar reads default to one month and reject reversed, invalid or oversized ranges", () => {
  const utils = load("lib/utils.ts");
  const { calendarQueryRange } = load("lib/calendar-dates.ts", {}, {
    "@/lib/utils": { ...utils, todayInTokyoString: () => "2026-09-16" },
  });
  assert.equal(JSON.stringify(calendarQueryRange(null, null)), JSON.stringify({ from: "2026-09-01", to: "2026-09-30" }));
  assert.equal(calendarQueryRange("2026-09-20", "2026-09-01"), null);
  assert.equal(calendarQueryRange("2026-02-30", null), null);
  assert.equal(calendarQueryRange("2025-01-01", "2026-09-16"), null);
  assert.equal(calendarQueryRange("2026-09-16", null).to, "2026-09-30");
});

test("entrant summary uses the DB aggregate and never hides database failures", async () => {
  const summary = [{ entry_date: "2026-09-16", primary_company: "A", secondary_company: "B", person_count: 1201 }];
  let error = null;
  const api = load("lib/calendar-summary.ts", {}, {
    "next/cache": { unstable_cache: fn => fn },
    "@/lib/data-cache": { DATA_CACHE_TAGS: {} },
    "@/lib/work-completions": {}, "@/lib/read-all-rows": {},
    "@/lib/supabase": { createServerClient: () => ({
      rpc: async () => ({ data: error ? null : summary, error }),
      from() { throw new Error("unnecessary individual read"); },
    }) },
  });
  assert.equal(await api.getCalendarEntrants("2026-09-01", "2026-09-30", "A"), summary);
  error = { code: "42501", message: "permission denied" };
  await assert.rejects(api.getCalendarEntrants("2026-09-01", "2026-09-30", "A"), /permission denied/);
});
