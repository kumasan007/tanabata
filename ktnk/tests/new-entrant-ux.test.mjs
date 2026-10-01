import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const master = { primaryCompanies: ["A"], secondariesByPrimary: { A: ["B"] } };
const record = { id: "11111111-1111-4111-8111-111111111111", entry_date: "2026-10-01", primary_company: "A", secondary_company: "B", person_names: "person", nationality_status: "japanese_only", notes: "note", person_count: 1, updated_at: "2026-10-01T01:00:00Z" };
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
function load(file, dependencies = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  runInNewContext(outputText, { exports, Error, Intl, crypto: { randomUUID: () => record.id }, window: { scrollTo() {}, addEventListener() {}, removeEventListener() {} }, require: name => dependencies[name] ?? require(name) });
  return exports;
}
function hookRenderer() {
  const state = [], effects = []; let cursor = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn, deps) { const i = cursor++; if (!state[i] || deps.some((value, j) => value !== state[i][j])) { state[i] = deps; effects.push(fn); } },
  };
  return { hooks, render(fn) { cursor = 0; const tree = fn(); effects.splice(0).forEach(effect => effect()); return tree; } };
}
function screen(apiFetch) {
  const renderer = hookRenderer();
  const { NewEntrantForm } = load("components/new-entrant-form.tsx", {
    react: renderer.hooks, "lucide-react": {}, "@/lib/api-client": { apiFetch },
    "@/lib/utils": { parseLocalDate: value => new Date(`${value}T00:00:00`), isWorkingDate: () => true, workingDateOptions: () => [] },
    "@/lib/entrant-form-model": load("lib/entrant-form-model.ts"),
    "@/components/entrant-fields": { EntrantFields: "fields" },
    "@/components/ui/mutation-notice": { MutationNotice: "notice" },
    "@/components/schedule-form-fields": { InputBackButton: "back", InputSelectionSummary: "summary" },
  });
  return { render: () => renderer.render(() => NewEntrantForm({ today: "2026-10-01", initialDate: "2026-10-01", initialCompany: "A", initialMaster: master })) };
}
function nodes(tree) {
  if (tree == null || typeof tree === "boolean") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== "object") return [tree];
  return [tree, ...nodes(tree.props?.children)];
}
const find = (tree, type) => nodes(tree).find(node => node?.type === type);
const text = tree => nodes(tree).filter(value => typeof value === "string").join("");
const button = (tree, label) => nodes(tree).find(node => node?.type === "button" && text(node) === label);
const fill = app => find(app.render(), "fields").props.onChange({ companyChoice: "B", personName: "person", nationalityStatus: "japanese_only", notes: "note" });
const submit = app => find(app.render(), "form").props.onSubmit({ preventDefault() {} });

test("one-person continuation retains context, clears personal fields, and edits with the saved version", async () => {
  const requests = [];
  const app = screen(async (url, options) => { requests.push(JSON.parse(options.body)); return response(options.method === "PATCH" ? { record: { ...record, updated_at: "2026-10-01T02:00:00Z" } } : { records: [record] }); });
  fill(app); await submit(app);
  assert.equal(find(app.render(), "fields"), undefined);
  button(app.render(), "内容を編集").props.onClick();
  await submit(app);
  assert.equal(requests[1].expectedUpdatedAt, record.updated_at);
  button(app.render(), "同じ所属会社の次の人を登録").props.onClick();
  const draft = find(app.render(), "fields").props.draft;
  assert.equal(draft.companyChoice, "B");
  for (const field of ["personName", "nationalityStatus", "notes"]) assert.equal(draft[field], "");
  assert.equal(find(app.render(), "summary").props.company, "A");
});

test("double sends are blocked and a timeout retry reuses the person ID", async () => {
  const requests = []; let finish;
  const app = screen(async (url, options) => { requests.push(JSON.parse(options.body)); if (requests.length === 1) return new Promise((resolve, reject) => { finish = () => reject(new Error("timeout")); }); return response({ records: [record] }); });
  fill(app);
  const pending = submit(app); await submit(app);
  assert.equal(requests.length, 1);
  assert.equal(find(app.render(), "fieldset").props.disabled, true);
  finish(); await pending; await submit(app);
  assert.equal(requests[0].people[0].id, requests[1].people[0].id);
  assert.equal(requests.length, 2);
});

test("conflict keeps unsaved input until explicit reload adopts the latest company and version", async () => {
  const latest = { ...record, secondary_company: "C", person_names: "latest", updated_at: "2026-10-01T03:00:00Z" };
  let updates = 0;
  const app = screen(async (url, options = {}) => {
    if (options.method === "POST") return response({ records: [record] });
    if (options.method === "PATCH") { updates++; return updates === 1 ? response({ error: "changed" }, 409) : response({ record: latest }); }
    if (url === "/api/companies") return response({ ...master, secondariesByPrimary: { A: ["C"] } });
    return response({ record: latest });
  });
  fill(app); await submit(app); button(app.render(), "内容を編集").props.onClick();
  find(app.render(), "fields").props.onChange({ personName: "unsaved" }); await submit(app);
  assert.equal(find(app.render(), "fields").props.draft.personName, "unsaved");
  await find(app.render(), "notice").props.onReload();
  // Reload callback starts the async operation; let its reads finish.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(find(app.render(), "fields").props.draft.personName, "latest");
  assert.equal(find(app.render(), "fields").props.draft.companyChoice, "C");
});

test("inline secondary registration keeps the latest counts and blocks duplicate registration", async () => {
  let rows = [{ secondaryCompany: "B", workerCount: 2 }];
  let finish; let requests = 0; const busy = [];
  const { CompanyPeopleFields } = load("components/company-people-fields.tsx", {
    react: { useId: () => "people" }, "@/components/add-secondary-company": { AddSecondaryCompany: "add-company" },
  });
  const renderer = hookRenderer();
  const { AddSecondaryCompany } = load("components/add-secondary-company.tsx", {
    react: { ...renderer.hooks, useId: () => "company" },
    "@/lib/api-client": { apiFetch: async () => { requests++; return new Promise(resolve => { finish = () => resolve(response({ secondaryCompany: "C" })); }); } },
    "@/components/ui/input-action": { InputAction: "input-action" },
    "@/components/ui/mutation-notice": { MutationNotice: "notice" },
  });
  const render = () => {
    const parent = CompanyPeopleFields({ primaryCompany: "A", primaryCount: 5, subcompanies: rows, previousCounts: new Map(), onPrimaryCountChange() {}, onSubcompaniesChange: value => { rows = value; }, onSecondaryCompanyBusyChange: value => busy.push(value) });
    return renderer.render(() => AddSecondaryCompany(find(parent, "add-company").props));
  };
  button(render(), "一覧にない二次会社を追加").props.onClick();
  find(render(), "input-action").props.onChange({ target: { value: "C" } });
  const action = find(render(), "input-action").props.onAction;
  action(); action();
  assert.equal(requests, 1);
  rows = [{ secondaryCompany: "B", workerCount: 8 }]; render();
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(rows[0].workerCount, 8);
  assert.equal(rows[1].secondaryCompany, "C");
  assert.equal(rows[1].workerCount, null);
  assert.deepEqual(busy, [true, false]);
});
