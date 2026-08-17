import { test } from "node:test";
import assert from "node:assert/strict";
import { runWithConfig, getConfig } from "../build/config.js";

test("concurrent scopes do not observe each other's tokens", async () => {
    const seen = [];

    const tenant = (token, delayMs) =>
        runWithConfig(token, async () => {
            // Yield so the two tenants interleave inside the same process.
            await new Promise((r) => setTimeout(r, delayMs));
            seen.push([token, getConfig().lunchmoneyApiToken]);
        });

    await Promise.all([tenant("token-a", 20), tenant("token-b", 5)]);

    for (const [expected, actual] of seen) {
        assert.equal(actual, expected, `tenant ${expected} read ${actual}`);
    }
    assert.equal(seen.length, 2);
});

test("getConfig outside any scope falls back to initializeConfig", async () => {
    const { initializeConfig } = await import("../build/config.js");
    initializeConfig("fallback-token");
    assert.equal(getConfig().lunchmoneyApiToken, "fallback-token");
});

test("getConfig with neither scope nor fallback throws", async () => {
    const fresh = await import(`../build/config.js?nocache=${Date.now()}`);
    assert.throws(() => fresh.getConfig(), /Configuration not initialized/);
});
