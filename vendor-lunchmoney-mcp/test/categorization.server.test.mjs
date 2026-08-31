import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import {
    createCategorizeServer,
    CATEGORIZE_TOOL_NAMES,
    READ_ONLY_TOOL_NAMES,
} from "../build/server.js";
import { runWithCategorizeConfig } from "../build/config.js";
import { api } from "../build/api.js";

describe("category-only Lunch Money server", () => {
    let client;

    before(async () => {
        const server = createCategorizeServer("test");
        const [clientTransport, serverTransport] =
            InMemoryTransport.createLinkedPair();
        client = new Client({ name: "categorize-test", version: "0" });
        await Promise.all([
            client.connect(clientTransport),
            server.connect(serverTransport),
        ]);
    });

    after(async () => {
        await client.close();
    });

    it("exposes exactly the category-only positive allowlist", async () => {
        const { tools } = await client.listTools();
        assert.deepEqual(
            tools.map((tool) => tool.name).sort(),
            [...CATEGORIZE_TOOL_NAMES].sort(),
        );
    });

    it("keeps retrieval tools read-only and marks the category mutation non-destructive", async () => {
        const { tools } = await client.listTools();
        const byName = new Map(tools.map((tool) => [tool.name, tool]));

        for (const name of READ_ONLY_TOOL_NAMES) {
            const tool = byName.get(name);
            assert.ok(tool, name);
            assert.equal(tool.annotations?.readOnlyHint, true, name);
            assert.equal(tool.annotations?.destructiveHint, false, name);
            assert.equal(tool.annotations?.openWorldHint, false, name);
        }

        const categorize = byName.get("categorize_transaction");
        assert.ok(categorize);
        assert.equal(categorize.annotations?.readOnlyHint, false);
        assert.equal(categorize.annotations?.destructiveHint, false);
        assert.equal(categorize.annotations?.idempotentHint, true);
        assert.equal(categorize.annotations?.openWorldHint, false);
    });

    it("does not expose broader representative mutation tools", async () => {
        const { tools } = await client.listTools();
        const names = new Set(tools.map((tool) => tool.name));
        for (const blocked of [
            "create_transactions",
            "update_transaction",
            "update_transactions_bulk",
            "delete_transaction",
            "delete_transactions_bulk",
            "split_transaction",
            "attach_file_to_transaction",
            "trigger_plaid_fetch",
            "refresh_synced_crypto",
            "upsert_budget",
        ]) {
            assert.equal(names.has(blocked), false, blocked);
        }
    });

    it("allows only the exact category-only transaction PUT shape", async () => {
        const originalFetch = globalThis.fetch;
        let observed;

        globalThis.fetch = async (url, options) => {
            observed = { url: String(url), options };
            return new Response(JSON.stringify({ id: 123, category_id: 456 }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        };

        try {
            const response = await runWithCategorizeConfig(
                "TEST-TOKEN-NOT-USED",
                () => api.put("/transactions/123", { category_id: 456 }),
            );
            assert.equal(response.status, 200);
            assert.equal(
                observed.url,
                "https://api.lunchmoney.dev/v2/transactions/123",
            );
            assert.equal(observed.options.method, "PUT");
            assert.equal(
                observed.options.body,
                JSON.stringify({ category_id: 456 }),
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("blocks broader writes before fetch", async () => {
        let fetchCalled = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
            fetchCalled = true;
            return new Response("unexpected");
        };

        try {
            await assert.rejects(
                () =>
                    runWithCategorizeConfig("TEST-TOKEN-NOT-USED", () =>
                        api.put("/transactions/123", {
                            category_id: 456,
                            notes: "not allowed",
                        }),
                    ),
                /blocked an outbound PUT request/,
            );

            await assert.rejects(
                () =>
                    runWithCategorizeConfig("TEST-TOKEN-NOT-USED", () =>
                        api.put("/transactions", { category_id: 456 }),
                    ),
                /blocked an outbound PUT request/,
            );

            await assert.rejects(
                () =>
                    runWithCategorizeConfig("TEST-TOKEN-NOT-USED", () =>
                        api.post("/transactions", { amount: "1" }),
                    ),
                /blocked an outbound POST request/,
            );

            assert.equal(fetchCalled, false);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
