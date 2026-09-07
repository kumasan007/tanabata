import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);

test("会社追加APIは既存一次会社への空追加・重複・不正型を拒否する", async () => {
  const inserted = [];
  const client = { from() {
    let orderQuery = false;
    const query = {
      select(value) { orderQuery = value === "sort_order"; return query; },
      order() { return query; }, limit() { return query; }, eq() { return query; },
      maybeSingle: async () => ({ data: { sort_order: 1 }, error: null }),
      then(resolve) { return Promise.resolve({ data: orderQuery ? [] : [{ secondary_company: "B" }], error: null }).then(resolve); },
      insert: async rows => { inserted.push(...rows); return { error: null }; },
    }; return query;
  } };
  const { POST } = loadModule("app/api/admin/company-master/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/lib/supabase": { assertAdminFromRequest: () => true, createServerClient: () => client },
  });
  for (const [body, expected] of [
    [{ primaryCompany: "A", secondaryCompanies: [] }, 409],
    [{ primaryCompany: "A", secondaryCompanies: [" "] }, 409],
    [{ primaryCompany: "A", secondaryCompanies: ["B"] }, 409],
    [{ primaryCompany: 123 }, 400],
    [{ primaryCompany: "A", secondaryCompanies: [123] }, 400],
  ]) assert.equal((await POST({ json: async () => body })).status, expected);
  assert.equal(inserted.length, 0);
  assert.equal((await POST({ json: async () => ({ primaryCompany: "A", secondaryCompanies: ["B", "C", "C"] }) })).status, 200);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].secondary_company, "C");
});

// Use the installed TypeScript compiler so these tests need no additional runner.
function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    URL,
    require: (name) => dependencies[name] ?? nodeRequire(name),
  }, { filename: path });
  return exports;
}

function previousRoute(previous, calls, today = null, todayCalls = []) {
  return loadModule("app/api/schedules/previous/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/lib/utils": { ...loadModule("lib/utils.ts"), todayInTokyoString: () => "2026-09-06" },
    "@/lib/schedule-service": {
      getPreviousScheduleForCopy: async (...args) => { calls.push(args); return previous; },
      getWorkScheduleOnDate: async (...args) => { todayCalls.push(args); return today; },
    },
  }).GET;
}

test("前回取得APIは不正な日付・未選択会社・不正区分でDBを呼ばない", async () => {
  const calls = [];
  const get = previousRoute(null, calls);
  for (const query of ["", "primaryCompany=A&status=work&workDate=2026-02-30", "primaryCompany=A&status=invalid&workDate=2026-09-07"]) {
    assert.equal((await get({url: `http://localhost/api/schedules/previous?${query}`})).status, 400);
  }
  assert.equal(calls.length, 0);
});

test("前回取得APIは作業区分に合う実数と内容だけを返す", async () => {
  const calls = [];
  const get = previousRoute({
    work_date: "2026-09-01", primary_count: 4, next_primary_count: 7,
    work_area: "10階", next_work_area: "12階", work_content: "配管", next_work_content: "搬入",
    subcompanies: [
      { kind: "current", secondary_company: "B", worker_count: 2 },
      { kind: "next_visit", secondary_company: "C", worker_count: 3 },
    ],
  }, calls);
  for (const status of ["work", "no_work"]) {
    const response = await get({url: `http://localhost/api/schedules/previous?primaryCompany=A&status=${status}&workDate=2026-09-07`});
    assert.equal(response.status, 200);
    assert.equal(response.body.previous.primaryCount, status === "work" ? 4 : 7);
    assert.equal(response.body.previous.workArea, status === "work" ? "10階" : "12階");
    assert.equal(response.body.previous.workContent, status === "work" ? "配管" : "搬入");
    assert.equal(response.body.previous.subcompanies.length, 1);
    assert.equal(response.body.previous.subcompanies[0].workerCount, status === "work" ? 2 : 3);
  }
  assert.deepEqual(calls, [["A", "work", "2026-09-07"], ["A", "no_work", "2026-09-07"]]);
});

test("前回がない場合は空の結果を返す", async () => {
  const response = await previousRoute(null, [])({url: "http://localhost/api/schedules/previous?primaryCompany=A&status=work&workDate=2026-09-07"});
  assert.equal(response.status, 200);
  assert.equal(response.body.previous, null);
});

test("未来日の本日コピーは前回と区別し、日本時間の本日を指定して取得する", async () => {
  const base = { primary_count: 2, work_area: "本日エリア", work_content: "本日作業", subcompanies: [] };
  const todayCalls = [];
  const get = previousRoute({ ...base, work_date: "2026-09-07", primary_count: 9 }, [], { ...base, work_date: "2026-09-06" }, todayCalls);
  const response = await get({url: "http://localhost/api/schedules/previous?primaryCompany=A&status=work&workDate=2026-09-08&includeToday=1"});
  assert.equal(response.status, 200);
  assert.equal(response.body.previous.primaryCount, 9);
  assert.equal(response.body.today.primaryCount, 2);
  assert.equal(response.body.today.workDate, "2026-09-06");
  assert.deepEqual(todayCalls, [["A", "2026-09-06"]]);
});

test("本日データがなくても別日の前回データで代用しない", async () => {
  const get = previousRoute({ work_date: "2026-09-05", primary_count: 4, subcompanies: [] }, []);
  const response = await get({url: "http://localhost/api/schedules/previous?primaryCompany=A&status=work&workDate=2026-09-08&includeToday=1"});
  assert.equal(response.status, 200);
  assert.equal(response.body.previous.primaryCount, 4);
  assert.equal(response.body.today, null);
});

test("本日以前・作業なし・本日コピー未要求では余分な本日照会を行わない", async () => {
  const todayCalls = [];
  const get = previousRoute(null, [], null, todayCalls);
  for (const query of [
    "status=work&workDate=2026-09-06&includeToday=1",
    "status=work&workDate=2026-09-05&includeToday=1",
    "status=no_work&workDate=2026-09-08&includeToday=1",
    "status=work&workDate=2026-09-08",
  ]) {
    assert.equal((await get({url: `http://localhost/api/schedules/previous?primaryCompany=A&${query}`})).status, 200);
  }
  assert.equal(todayCalls.length, 0);
});

function copySourceRoute(source, calls, fail = false, future = null, futureCalls = []) {
  return loadModule("app/api/schedules/copy-source/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/lib/utils": { ...loadModule("lib/utils.ts"), todayInTokyoString: () => "2026-09-06" },
    "@/lib/schedule-service": {
      getPreviousScheduleForCopy: async (...args) => {
        calls.push(args);
        if (fail) throw new Error("Database unavailable");
        return source;
      },
      getNextScheduleForCopy: async (...args) => {
        futureCalls.push(args);
        return future;
      },
    },
  }).GET;
}

test("会社選択後のコピー元は本日までの作業ありを検索し、実際の内容を返す", async () => {
  for (const workDate of ["2026-09-06", "2026-09-01"]) {
    const calls = [];
    const get = copySourceRoute({
      work_date: workDate, primary_count: 3, work_area: "2階", work_content: "配管",
      subcompanies: [
        { kind: "current", secondary_company: "B", worker_count: 2 },
        { kind: "next_visit", secondary_company: "C", worker_count: 9 },
      ],
    }, calls);
    const response = await get({ url: "http://localhost/api/schedules/copy-source?primaryCompany=A" });
    assert.equal(response.status, 200);
    assert.equal(response.body.today, "2026-09-06");
    assert.equal(response.body.source.workDate, workDate);
    assert.equal(response.body.source.primaryCount, 3);
    assert.equal(response.body.source.workArea, "2階");
    assert.equal(response.body.source.workContent, "配管");
    assert.equal(response.body.source.subcompanies.length, 1);
    assert.equal(response.body.source.subcompanies[0].secondaryCompany, "B");
    assert.equal(response.body.source.subcompanies[0].workerCount, 2);
    assert.deepEqual(calls, [["A", "work", "2026-09-07"]]);
  }
});

test("コピー元取得は会社未選択でDBを呼ばない", async () => {
  const calls = [];
  const get = copySourceRoute(null, calls);
  for (const query of ["", "?primaryCompany=%20"]) {
    assert.equal((await get({ url: `http://localhost/api/schedules/copy-source${query}` })).status, 400);
  }
  assert.equal(calls.length, 0);
});

test("今日以前の作業がない場合は最も近い未来の予定を返す", async () => {
  const previousCalls = [];
  const futureCalls = [];
  const get = copySourceRoute(null, previousCalls, false, {
    work_date: "2026-09-10", primary_count: 5, work_area: "3階", work_content: "搬入",
    subcompanies: [{ kind: "current", secondary_company: "B", worker_count: 2 }],
  }, futureCalls);
  const response = await get({ url: "http://localhost/api/schedules/copy-source?primaryCompany=A" });
  assert.equal(response.status, 200);
  assert.equal(response.body.source.workDate, "2026-09-10");
  assert.equal(response.body.source.primaryCount, 5);
  assert.deepEqual(previousCalls, [["A", "work", "2026-09-07"]]);
  assert.deepEqual(futureCalls, [["A", "work", "2026-09-07"]]);
});

test("今日以前の作業がある場合は未来の予定を検索しない", async () => {
  const futureCalls = [];
  const get = copySourceRoute({
    work_date: "2026-09-05", primary_count: 3, subcompanies: [],
  }, [], false, null, futureCalls);
  const response = await get({ url: "http://localhost/api/schedules/copy-source?primaryCompany=A" });
  assert.equal(response.status, 200);
  assert.equal(response.body.source.workDate, "2026-09-05");
  assert.equal(futureCalls.length, 0);
});

test("コピー元がない場合と取得失敗を区別する", async () => {
  const request = { url: "http://localhost/api/schedules/copy-source?primaryCompany=A" };
  const missing = await copySourceRoute(null, [])(request);
  assert.equal(missing.status, 200);
  assert.equal(missing.body.source, null);
  const failed = await copySourceRoute(null, [], true)(request);
  assert.equal(failed.status, 500);
  assert.equal(failed.body.error, "前回の作業を取得できませんでした。");
});

const utils = loadModule("lib/utils.ts");
const { scheduleSubmitSchema } = loadModule("lib/validation.ts");

function submission(patch = {}) {
  return {
    startDate: "2026-09-07",
    endDate: "2026-09-07",
    status: "work",
    primaryCompany: "テスト一次会社",
    primaryCount: 1,
    workArea: "10階",
    workContent: "配管作業",
    currentSubcompanies: [],
    nextVisitDate: null,
    nextPrimaryCount: null,
    nextSubcompanies: [],
    ...patch,
  };
}

function serviceWithDatabase(previous = null) {
  const mutations = [];
  let previousReads = 0;
  const client = {
    from(table) {
      let previousQuery = false;
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        lt() { previousQuery = true; return query; },
        async maybeSingle() {
          if (previousQuery) previousReads += 1;
          return { data: previousQuery ? previous : { id: "existing-id" }, error: null };
        },
        delete() { mutations.push({ table, operation: "delete" }); return query; },
        upsert(data) { mutations.push({ table, operation: "upsert", data }); return query; },
        async insert(data) { mutations.push({ table, operation: "insert", data }); return { error: null }; },
        async single() { return { data: { id: "existing-id" }, error: null }; },
        then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
      };
      return query;
    },
  };
  const { saveScheduleSubmission } = loadModule("lib/schedule-service.ts", {
    "@/lib/supabase": { createServerClient: () => client },
    "@/lib/utils": utils,
  });
  return { saveScheduleSubmission, mutations, previousReads: () => previousReads };
}

test("作業なしは人数と来場予定を入力せず保存できる", async () => {
  const input = scheduleSubmitSchema.parse(submission({ status: "no_work", primaryCount: null }));
  const service = serviceWithDatabase();
  await service.saveScheduleSubmission(input);
  const saved = service.mutations.find((mutation) => mutation.operation === "upsert").data;
  assert.equal(saved.next_primary_count, null);
  assert.equal(saved.next_visit_date, null);
  assert.equal(service.mutations.some((mutation) => mutation.operation === "insert"), false);
});

test("作業なしは0人と人数未定の二次会社を受け付ける", async () => {
  const input = scheduleSubmitSchema.parse(submission({
    status: "no_work",
    nextPrimaryCount: 0,
    nextSubcompanies: [{ secondaryCompany: "テスト二次会社", workerCount: null }],
  }));
  const service = serviceWithDatabase();
  await service.saveScheduleSubmission(input);
  const rows = service.mutations.find((mutation) => mutation.operation === "insert").data;
  assert.equal(rows[0].worker_count, null);
  assert.equal(rows[0].kind, "next_visit");
});

test("表示していない予定区分の二次会社入力と前回参照を無視する", async () => {
  for (const status of ["work", "no_work"]) {
    const inactiveField = status === "work" ? "nextSubcompanies" : "currentSubcompanies";
    const input = scheduleSubmitSchema.parse(submission({
      status,
      [inactiveField]: [{ secondaryCompany: "", workerCount: 1, usePreviousWorkerCount: true }],
    }));
    const service = serviceWithDatabase();
    await service.saveScheduleSubmission(input);
    assert.equal(service.previousReads(), 0);
  }
});

test("作業ありでは人数未入力・全社0人・会社名のない人数を拒否する", () => {
  for (const patch of [
    { primaryCount: null },
    { primaryCount: 0 },
    { currentSubcompanies: [{ secondaryCompany: "", workerCount: 2 }] },
    { currentSubcompanies: [{ secondaryCompany: "テスト二次会社", workerCount: null }] },
  ]) {
    assert.equal(scheduleSubmitSchema.safeParse(submission(patch)).success, false);
  }
});

test("前回の人数・エリア・内容・二次会社がない場合、既存データに書き込まない", async () => {
  for (const patch of [
    { usePreviousPrimaryCount: true },
    { workArea: "前回と同じ" },
    { workContent: "前回と同じ" },
    { currentSubcompanies: [{ secondaryCompany: "テスト二次会社", workerCount: null, usePreviousWorkerCount: true }] },
    { status: "no_work", usePreviousNextPrimaryCount: true },
  ]) {
    const service = serviceWithDatabase();
    const input = scheduleSubmitSchema.parse(submission(patch));
    await assert.rejects(service.saveScheduleSubmission(input), /前回/);
    assert.equal(service.mutations.length, 0);
  }
});

test("一次0人でも二次会社の前回人数を解決して保存できる", async () => {
  const input = scheduleSubmitSchema.parse(submission({
    primaryCount: 0,
    currentSubcompanies: [{ secondaryCompany: "テスト二次会社", workerCount: null, usePreviousWorkerCount: true }],
  }));
  const service = serviceWithDatabase({
    primary_count: 0,
    schedule_subcompanies: [{ secondary_company: "テスト二次会社", worker_count: 3, kind: "current", sort_order: 0 }],
  });
  await service.saveScheduleSubmission(input);
  const rows = service.mutations.find((mutation) => mutation.operation === "insert").data;
  assert.equal(rows[0].worker_count, 3);
});

test("前回参照後も全社0人なら、既存データを変更せず拒否する", async () => {
  const input = scheduleSubmitSchema.parse(submission({ primaryCount: null, usePreviousPrimaryCount: true }));
  const service = serviceWithDatabase({ primary_count: 0, schedule_subcompanies: [] });
  await assert.rejects(service.saveScheduleSubmission(input), /1人以上/);
  assert.equal(service.mutations.length, 0);
});

test("前回二次会社の人数が未定なら、既存データを変更せず拒否する", async () => {
  const input = scheduleSubmitSchema.parse(submission({
    currentSubcompanies: [{ secondaryCompany: "テスト二次会社", workerCount: null, usePreviousWorkerCount: true }],
  }));
  const service = serviceWithDatabase({
    schedule_subcompanies: [{ secondary_company: "テスト二次会社", worker_count: null, kind: "current", sort_order: 0 }],
  });
  await assert.rejects(service.saveScheduleSubmission(input), /前回人数/);
  assert.equal(service.mutations.length, 0);
});


test("通常の作業予定はエリア・内容の未入力や空白だけを拒否する", () => {
  for (const field of ["workArea", "workContent"]) {
    for (const value of ["", " 　\n", undefined]) {
      const result = scheduleSubmitSchema.safeParse(submission({ [field]: value }));
      assert.equal(result.success, false);
      assert.ok(result.error.issues.some((issue) => issue.path[0] === field));
    }
  }
  assert.equal(scheduleSubmitSchema.safeParse(submission()).success, true);
});

test("次回来場予定はエリア・内容が未入力や未定でも保存できる", async () => {
  for (const value of ["", "未定"]) {
    const input = scheduleSubmitSchema.parse(submission({
      status: "no_work",
      workArea: "",
      workContent: "",
      nextVisitDate: "2026-09-10",
      nextWorkArea: value,
      nextWorkContent: value,
    }));
    const service = serviceWithDatabase();
    await service.saveScheduleSubmission(input);
    const saved = service.mutations.find((mutation) => mutation.operation === "upsert").data;
    assert.equal(saved.next_work_area, value || null);
    assert.equal(saved.next_work_content, value || null);
  }
});

test("company deletion requires admin and exactly one target", async () => {
  for (const [authorized, query, status] of [[false, "?primaryCompany=A", 401], [true, "", 400], [true, "?id=1&primaryCompany=A", 400]]) {
    const { DELETE } = loadModule("app/api/admin/company-master/route.ts", {
      "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
      "@/lib/supabase": { assertAdminFromRequest: () => authorized, createServerClient: () => { throw new Error("DB must not be called"); } },
    });
    assert.equal((await DELETE({ url: `http://localhost/api/admin/company-master${query}` })).status, status);
  }
});

test("company deletion scopes a single database operation to the requested company or row", async () => {
  for (const [params, column, value, rows, expected] of [
    ["primaryCompany=A", "primary_company", "A", [{ id: "1" }, { id: "2" }], 200],
    ["id=1", "id", "1", [{ id: "1" }], 200],
    ["primaryCompany=missing", "primary_company", "missing", [], 404],
  ]) {
    const calls = [];
    const { DELETE } = loadModule("app/api/admin/company-master/route.ts", {
      "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
      "@/lib/supabase": {
        assertAdminFromRequest: () => true,
        createServerClient: () => ({ from(table) {
          assert.equal(table, "company_master");
          return { delete() { return { eq(key, target) {
            calls.push([key, target]);
            return { select: async () => ({ data: rows, error: null }) };
          } }; } };
        } }),
      },
    });
    assert.equal((await DELETE({ url: `http://localhost/api/admin/company-master?${params}` })).status, expected);
    assert.deepEqual(calls, [[column, value]]);
  }
});

test("admin schedule mutations reject unauthenticated requests without DB access", async () => {
  const route = loadModule("app/api/admin/schedules/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/lib/supabase": { assertAdminFromRequest: () => false, createServerClient: () => { throw new Error("unexpected DB access"); } },
    "@/lib/schedule-service": { saveScheduleSubmission: () => { throw new Error("unexpected save"); } },
    "@/lib/validation": { scheduleSubmitSchema },
  });
  for (const method of ["PATCH", "DELETE"]) assert.equal((await route[method]({ url: "http://localhost/api/admin/schedules" })).status, 401);
});

test("admin schedule editing pins the date and company to the existing ID and validates input", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const saved = [];
  const calls = [];
  const route = loadModule("app/api/admin/schedules/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
    "@/lib/supabase": { assertAdminFromRequest: () => true, createServerClient: () => ({ from(table) {
      assert.equal(table, "schedule_groups");
      return { select: () => ({ eq: (key, value) => { calls.push([key, value]); return { maybeSingle: async () => ({ data: { id, work_date: "2026-09-07", primary_company: "A" }, error: null }) }; } }) };
    } }) },
    "@/lib/schedule-service": { saveScheduleSubmission: async (input) => saved.push(input) },
    "@/lib/validation": { scheduleSubmitSchema },
  });
  assert.equal((await route.PATCH({ json: async () => ({ ...submission(), id, startDate: "2026-10-01", endDate: "2026-10-31", primaryCompany: "B" }) })).status, 200);
  assert.equal(saved[0].startDate, "2026-09-07");
  assert.equal(saved[0].endDate, "2026-09-07");
  assert.equal(saved[0].primaryCompany, "A");
  assert.deepEqual(calls[0], ["id", id]);
  assert.equal((await route.PATCH({ json: async () => ({ ...submission(), id, workArea: "" }) })).status, 400);
  assert.equal(saved.length, 1);
});

test("admin schedule deletion is limited to one ID and reports missing schedules", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  for (const found of [true, false]) {
    const calls = [];
    const route = loadModule("app/api/admin/schedules/route.ts", {
      "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
      "@/lib/supabase": { assertAdminFromRequest: () => true, createServerClient: () => ({ from(table) {
        assert.equal(table, "schedule_groups");
        return { delete: () => ({ eq: (key, value) => { calls.push([key, value]); return { select: async () => ({ data: found ? [{ id }] : [], error: null }) }; } }) };
      } }) },
      "@/lib/schedule-service": {}, "@/lib/validation": { scheduleSubmitSchema },
    });
    assert.equal((await route.DELETE({ url: `http://localhost/api/admin/schedules?id=${id}` })).status, found ? 200 : 404);
    assert.deepEqual(calls, [["id", id]]);
    assert.equal((await route.DELETE({ url: "http://localhost/api/admin/schedules?id=invalid" })).status, 400);
    assert.equal(calls.length, 1);
  }
});

test("worker secondary registration validates input and only adds under an existing primary", async () => {
  for (const [body, existing, expected, insertedCount] of [
    [{ primaryCompany: "A", secondaryCompany: "  B  " }, [{ secondary_company: null, sort_order: 4, primary_trade_roles: ["role"] }], 200, 1],
    [{ primaryCompany: "A", secondaryCompany: "B" }, [{ secondary_company: "B", sort_order: 4 }], 200, 0],
    [{ primaryCompany: "missing", secondaryCompany: "B" }, [], 404, 0],
    [{ primaryCompany: "A", secondaryCompany: "   " }, [], 400, 0],
    [{ primaryCompany: "A", secondaryCompany: 123 }, [], 400, 0],
    [{ primaryCompany: "A", secondaryCompany: "x".repeat(201) }, [], 400, 0],
  ]) {
    const inserted = [];
    const { POST } = loadModule("app/api/companies/secondary/route.ts", {
      "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
      "@/lib/supabase": { createServerClient: () => ({ from(table) {
        assert.equal(table, "company_master");
        return {
          select: () => ({ eq: (column, value) => {
            assert.equal(column, "primary_company"); assert.equal(value, body.primaryCompany);
            return { order: async () => ({ data: existing, error: null }) };
          } }),
          insert: async (row) => { inserted.push(row); return { error: null }; },
        };
      } }) },
    });
    const response = await POST({ json: async () => body });
    assert.equal(response.status, expected);
    assert.equal(inserted.length, insertedCount);
    if (insertedCount) {
      assert.equal(inserted[0].secondary_company, "B");
      assert.equal(inserted[0].primary_company, "A");
      assert.equal(inserted[0].sort_order, 5);
      assert.deepEqual(inserted[0].primary_trade_roles, ["role"]);
    }
  }
});
