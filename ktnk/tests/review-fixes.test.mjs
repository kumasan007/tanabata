import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
function load(path, dependencies) {
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, {
    exports, process, Request, Response, URL, Date, Error,
    require: name => dependencies[name] ?? nodeRequire(name),
  });
  return exports;
}
const next = { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } };

test("login failures still throttle when Supabase returns errors without throwing", async () => {
  let readable = false;
  const query = {
    select() { return query; }, eq() { return query; }, gte() { return query; },
    insert: async () => ({ error: { code: "42P01" } }),
    then(resolve) { return Promise.resolve({ count: 0, error: readable ? null : { code: "42P01" } }).then(resolve); },
  };
  const auth = load("lib/login-rate-limit.ts", {
    "@/lib/supabase": { createAdminServerClient: () => ({ from: () => query }) },
  });
  const request = new Request("https://example.com", { headers: { "x-forwarded-for": "192.0.2.22" } });
  for (let i = 0; i < 5; i++) {
    const { allowed, key } = await auth.loginAllowed(request);
    assert.equal(allowed, true);
    await auth.recordLoginFailure(key);
  }
  assert.equal((await auth.loginAllowed(request)).allowed, false);
  readable = true;
  assert.equal((await auth.loginAllowed(request)).allowed, false);
});

test("every public entrant, completion and secondary-company mutation stops at its rate limit", async () => {
  for (const [path, methods] of [
    ["app/api/new-entrants/route.ts", ["POST", "PATCH", "DELETE"]],
    ["app/api/work-completions/route.ts", ["POST", "DELETE"]],
    ["app/api/companies/secondary/route.ts", ["POST"]],
  ]) {
    const calls = [];
    const route = load(path, {
      "next/server": next, "@/lib/utils": {}, "@/lib/companies": {}, "@/lib/calendar-dates": {},
      "@/lib/new-entrants": {}, "@/lib/work-completions": {}, "@/lib/data-cache": {},
      "@/lib/supabase": { createServerClient() { throw new Error("Unexpected DB access"); } },
      "@/lib/public-mutation-limit": {
        publicMutationAllowed: async (_request, scope) => { calls.push(scope); return false; },
        mutationLimitResponse: () => ({ status: 429 }),
      },
    });
    for (const method of methods) {
      assert.equal((await route[method](new Request("https://example.com"))).status, 429);
    }
    assert.equal(calls.length, methods.length);
  }
});

test("report edits reject an old revision and return the latest report", async () => {
  const current = { reported_at: "2026-10-01T08:00:00Z", revision: 2, notes: "other editor" };
  let payload;
  const { POST } = load("app/api/work-completions/route.ts", {
    "next/server": next, "@/lib/utils": { parseLocalDate: value => new Date(value) },
    "@/lib/companies": { getCompanyMaster: async () => ({ primaryCompanies: ["A"] }) },
    "@/lib/work-completions": { getScheduledCompletionCompanies: async () => new Set(["A"]), getWorkCompletions: async () => [current] },
    "@/lib/data-cache": { invalidateWorkCompletionData() {} },
    "@/lib/supabase": { createServerClient: () => ({ rpc: async (name, args) => {
      assert.equal(name, "save_work_completion_atomically");
      payload = args;
      return { data: null, error: null };
    } }) },
    "@/lib/public-mutation-limit": { publicMutationAllowed: async () => true },
  });
  const response = await POST({ json: async () => ({ date: "2026-10-01", primaryCompany: "A", notes: "stale", expectedReportedAt: current.reported_at, expectedRevision: 1 }) });
  assert.equal(response.status, 409);
  assert.equal(response.body.report, current);
  assert.equal(payload.p_expected_revision, 1);
  assert.equal(payload.p_expected_reported_at, current.reported_at);
});

test("completion reads include reports beyond the first database page", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ primary_company: `company-${index}`, notes: "note" }));
  const pages = [];
  const query = {
    select() { return query; }, gte() { return query; }, lte() { return query; }, order() { return query; },
    range: async (from, to) => { pages.push(from); return { data: rows.slice(from, to + 1), error: null }; },
  };
  const { getWorkCompletions } = load("lib/work-completions.ts", {
    "@/lib/supabase": { createServerClient: () => ({ from: () => query }) },
    "next/cache": { unstable_cache: callback => callback },
    "@/lib/data-cache": { DATA_CACHE_TAGS: {} },
    "@/lib/read-all-rows": load("lib/read-all-rows.ts", {}),
  });
  const reports = await getWorkCompletions("2026-10-01", "2026-10-31", null, true);
  assert.equal(reports.length, 1001);
  assert.equal(reports[1000].primary_company, "company-1000");
  assert.equal(reports[1000].notes, "");
  assert.deepEqual(pages, [0, 1000]);
});
