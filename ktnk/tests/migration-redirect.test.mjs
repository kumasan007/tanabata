import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy.ts";

test("migration redirects pages, blocks old APIs and never forwards submissions", () => {
  const previous = process.env.KTNK_REDIRECT_URL;
  const destination = `https://crewstack.jp/w/86c8c529-c7da-45a9-a67f-531982b405a8/#access=${"a".repeat(64)}`;
  const request = (path, method = "GET") => new NextRequest(`https://old.example${path}`, { method });
  try {
    delete process.env.KTNK_REDIRECT_URL;
    assert.equal(proxy(request("/schedule")).headers.get("x-middleware-next"), "1");
    process.env.KTNK_REDIRECT_URL = destination;
    for (const path of ["/", "/schedule?company=old", "/admin", "/calendar", "/new-entrants"]) {
      const response = proxy(request(path));
      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), destination);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    for (const [path, method] of [["/api", "GET"], ["/api/schedules", "GET"], ["/api/schedules", "POST"], ["/schedule", "POST"], ["/api/schedules", "DELETE"]]) {
      const response = proxy(request(path, method));
      assert.equal(response.status, 410);
      assert.equal(response.headers.get("location"), null);
    }
    process.env.KTNK_REDIRECT_URL = "https://example.com/";
    assert.equal(proxy(request("/")).status, 503);
  } finally {
    if (previous === undefined) delete process.env.KTNK_REDIRECT_URL;
    else process.env.KTNK_REDIRECT_URL = previous;
  }
});
