import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
function load(path, dependencies = {}, globals = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, {
    exports, Buffer, Request, Response, URL, Error, process: { env: {} }, ...globals,
    require: name => dependencies[name] ?? nodeRequire(name),
  });
  return exports;
}
const next = { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, cookies: { set() {} } }) } };

test("malformed admin cookies fail closed while valid sessions remain usable", () => {
  const env = { ADMIN_SESSION_SECRET: "local-test-secret", ADMIN_PASSWORD: "local-test-password" };
  const auth = load("lib/admin-auth.ts", {}, { process: { env } });
  const token = auth.createAdminSessionToken();
  const request = cookie => new Request("https://example.com", { headers: { cookie } });
  assert.equal(auth.verifyAdminSessionToken(token), true);
  assert.equal(auth.getAdminCookieFromRequest(request(`other=1; ktnk_admin=${encodeURIComponent(token)}`)), token);
  assert.equal(auth.getAdminCookieFromRequest(request("ktnk_admin=%E0%A4%A")), null);
  assert.equal(auth.verifyAdminSessionToken(`${token}.extra`), false);
  assert.equal(auth.verifyAdminSessionToken(`${token}.`), false);
  assert.equal(auth.verifyAdminPassword(123), false);
  delete env.ADMIN_SESSION_SECRET;
  assert.equal(auth.verifyAdminSessionToken(token), false);
});

test("invalid login bodies return 400 without attempting password verification", async () => {
  let verified = 0;
  const { POST } = load("app/api/admin/login/route.ts", {
    "next/server": next,
    "@/lib/admin-auth": {
      verifyAdminPassword(password) { verified++; return password === "password"; },
      createAdminSessionToken: () => "session", adminCookieName: () => "ktnk_admin", ADMIN_SESSION_SECONDS: 60,
    },
    "@/lib/login-rate-limit": { loginAllowed: async () => ({ allowed: true, key: "test" }), clearLoginFailures: async () => {}, recordLoginFailure: async () => {} },
  });
  for (const body of [null, [], { password: 123 }, { password: "password", remember: "false" }]) {
    assert.equal((await POST({ json: async () => body })).status, 400);
  }
  assert.equal((await POST({ json: async () => { throw new SyntaxError("Invalid JSON"); } })).status, 400);
  assert.equal(verified, 0);
  assert.equal((await POST({ json: async () => ({ password: "password", remember: false }) })).status, 200);
  assert.equal((await POST({ json: async () => ({ password: "wrong" }) })).status, 401);
});

test("equipment reads reject impossible calendar dates before database access", async () => {
  let reads = 0;
  const { GET } = load("app/api/equipment-board/route.ts", {
    "next/server": next,
    "@/lib/utils": load("lib/utils.ts"),
    "@/lib/supabase": { assertAdminFromRequest: () => false },
    "@/lib/equipment-board": { getEquipmentBoardData: async () => { reads++; return { canEdit: false }; } },
  }, { process: { env: { SUPABASE_URL: "https://example.invalid", SUPABASE_SECRET_KEY: "test" } } });
  for (const date of ["2026-02-29", "2026-02-31", "2026-04-31", "2026-13-01", "invalid", ""]) {
    assert.equal((await GET(new Request(`https://example.com/api/equipment-board?date=${date}`))).status, 400);
  }
  assert.equal(reads, 0);
  assert.equal((await GET(new Request("https://example.com/api/equipment-board?date=2028-02-29"))).status, 200);
  assert.equal(reads, 1);
});

test("calendar entrant totals retain every group beyond the database response limit", async () => {
  const rows = Array.from({ length: 1201 }, (_, index) => ({ entry_date: "2026-11-10", primary_company: `company-${index}`, secondary_company: null, person_count: 2 }));
  const orders = [];
  const pages = [];
  let failSecondPage = false;
  const query = {
    order(column) { orders.push(column); return this; },
    range: async (from, to) => {
      pages.push(from);
      return failSecondPage && from > 0 ? { data: null, error: { message: "interrupted" } } : { data: rows.slice(from, to + 1), error: null };
    },
  };
  const { getCalendarEntrants } = load("lib/calendar-summary.ts", {
    "next/cache": { unstable_cache: fn => fn },
    "@/lib/data-cache": { DATA_CACHE_TAGS: {} },
    "@/lib/read-all-rows": load("lib/read-all-rows.ts"),
    "@/lib/work-completions": {},
    "@/lib/supabase": { createServerClient: () => ({ rpc: () => query }) },
  });
  const result = await getCalendarEntrants("2026-11-01", "2026-11-30", "");
  assert.equal(result.length, 1201);
  assert.equal(result.reduce((sum, row) => sum + row.person_count, 0), 2402);
  assert.deepEqual(pages, [0, 1000]);
  assert.deepEqual(orders, ["entry_date", "primary_company", "secondary_company"]);
  failSecondPage = true;
  await assert.rejects(getCalendarEntrants("2026-11-01", "2026-11-30", ""), /interrupted/);
});
