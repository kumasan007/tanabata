import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import crypto from "node:crypto";

function load({ admin = false, rpcResult = true } = {}) {
  const calls = [];
  const output = ts.transpileModule(readFileSync(new URL("../lib/public-mutation-limit.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(output, {
    exports, Response, process,
    require(name) {
      if (name === "node:crypto") return crypto;
      if (name === "@/lib/supabase") return {
        assertAdminFromRequest: () => admin,
        createServerClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: rpcResult, error: null }; } }),
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { ...exports, calls };
}

test("管理者ログイン中の予定操作は回数制限DBを呼ばない", async () => {
  const { publicMutationAllowed, calls } = load({ admin: true });
  assert.equal(await publicMutationAllowed(new Request("https://example.com"), "schedule-write"), true);
  assert.equal(calls.length, 0);
});

test("未ログイン操作は共有Wi-Fi向けの高い上限で数える", async () => {
  const { publicMutationAllowed, calls } = load();
  const request = new Request("https://example.com", { headers: { "x-forwarded-for": "192.0.2.1", "x-ktnk-device": "device_1234567890abcdef" } });
  assert.equal(await publicMutationAllowed(request, "schedule-write"), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_device_limit, 300);
  assert.equal(calls[0].args.p_ip_limit, 3000);
  assert.equal(calls[0].args.p_window_seconds, 600);
});
