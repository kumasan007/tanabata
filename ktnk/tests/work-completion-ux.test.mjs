import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const report = { work_date: "2026-09-16", primary_company: "A", reported_at: "2026-09-16T08:00:00.000Z", notes: "" };
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

// Drive the component's hooks and events with API responses; no live reports are written.
function form(apiFetch) {
  const state = [];
  const effects = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return state[index] ??= { current: initial };
    },
    useEffect(fn, dependencies) {
      const index = cursor++;
      const previous = state[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        previous?.cleanup?.();
        state[index] = { dependencies };
        effects.push(() => { state[index].cleanup = fn(); });
      }
    },
  };
  const { outputText } = ts.transpileModule(readFileSync(new URL("../components/work-completion-form.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  const dependencies = {
    react: hooks,
    "@/lib/api-client": { apiFetch },
    "@/lib/completion-time": { completionTime: value => value },
    "@/components/loading-indicator": { LoadingIndicator: "loading-indicator" },
    "lucide-react": { CheckCircle2: "check-icon" },
  };
  runInNewContext(outputText, { exports, AbortController, URLSearchParams, Error, require: name => dependencies[name] ?? require(name) });
  return {
    render(props = {}) {
      cursor = 0;
      const tree = exports.WorkCompletionForm({ primaryCompany: "A", automaticDate: true, ...props });
      effects.splice(0).forEach(effect => effect());
      return tree;
    },
    unmount() { state.forEach(value => value?.cleanup?.()); },
  };
}
function nodes(tree) {
  if (tree == null || typeof tree === "boolean") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== "object") return [tree];
  return [tree, ...nodes(tree.props?.children)];
}
const text = tree => nodes(tree).filter(value => typeof value === "string" || typeof value === "number").join("");
const button = (tree, label) => nodes(tree).find(node => node?.type === "button" && text(node) === label);
const flush = () => new Promise(resolve => setImmediate(resolve));

test("new submission shows completion, hides inputs and prevents duplicate sends", async () => {
  let sends = 0;
  let finish;
  const screen = form(async (url, options) => {
    if (!options.method) return response({ reports: [] });
    sends++;
    return new Promise(resolve => { finish = () => resolve(response({ report })); });
  });
  screen.render(); await flush();
  const submit = button(screen.render(), "作業終了を報告する");
  submit.props.onClick(); submit.props.onClick();
  assert.equal(sends, 1);
  assert.match(text(screen.render()), /送信中/);
  finish(); await flush();
  const tree = screen.render();
  assert.match(text(tree), /作業終了を報告しました/);
  assert.doesNotMatch(text(tree), /すでに|再度報告/);
  assert.equal(nodes(tree).some(node => node?.type === "textarea"), false);
  assert.ok(button(tree, "備考を変更"));
  assert.ok(button(tree, "報告を取り消す"));
});

test("existing report supports notes editing and cancellation", async () => {
  const calls = [];
  const screen = form(async (url, options) => {
    if (!options.method) return response({ reports: [report] });
    calls.push({ method: options.method, body: JSON.parse(options.body) });
    return response({ report: options.method === "DELETE" ? null : { ...report, notes: "連絡事項" } });
  });
  screen.render(); await flush();
  let tree = screen.render();
  assert.match(text(tree), /作業終了は報告済みです/);
  button(tree, "備考を変更").props.onClick();
  tree = screen.render();
  assert.equal(button(tree, "備考の変更を保存").props.disabled, true);
  nodes(tree).find(node => node?.type === "textarea").props.onChange({ target: { value: "連絡事項" } });
  button(screen.render(), "備考の変更を保存").props.onClick(); await flush();
  assert.match(text(screen.render()), /備考の変更を保存しました/);
  assert.equal(calls[0].body.expectedReportedAt, report.reported_at);
  button(screen.render(), "報告を取り消す").props.onClick(); await flush();
  tree = screen.render();
  assert.match(text(tree), /取り消しました/);
  assert.ok(button(tree, "作業終了を報告する"));
  assert.equal(calls[1].body.date, report.work_date);
  assert.equal(calls[1].body.automaticDate, false);
});

test("load failure can retry and conflict adopts latest report and notes", async () => {
  let reads = 0;
  const latest = { ...report, notes: "別端末の備考" };
  const screen = form(async (url, options) => {
    if (!options.method) return ++reads === 1 ? response({ error: "接続できません" }, 500) : response({ reports: [] });
    return response({ report: latest }, 409);
  });
  screen.render(); await flush();
  button(screen.render(), "もう一度確認する").props.onClick();
  screen.render(); await flush();
  button(screen.render(), "作業終了を報告する").props.onClick(); await flush();
  let tree = screen.render();
  assert.match(text(tree), /最新の内容を確認/);
  assert.match(text(tree), /別端末の備考/);
  button(tree, "備考を変更").props.onClick(); tree = screen.render();
  assert.equal(nodes(tree).find(node => node?.type === "textarea").props.value, latest.notes);
});

test("late response after company change cannot replace the new company's status", async () => {
  let finish;
  const screen = form(async (url, options) => {
    if (!options.method) return response({ reports: [] });
    return new Promise(resolve => { finish = () => resolve(response({ report })); });
  });
  screen.render(); await flush();
  button(screen.render(), "作業終了を報告する").props.onClick();
  screen.render({ primaryCompany: "B" }); await flush();
  finish(); await flush();
  const tree = screen.render({ primaryCompany: "B" });
  assert.doesNotMatch(text(tree), /報告しました/);
  assert.ok(button(tree, "作業終了を報告する"));
  screen.unmount();
});
