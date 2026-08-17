import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import {
    createReadonlyServer,
    READ_ONLY_TOOL_NAMES,
} from "../build/server.js";
import { runWithReadonlyConfig } from "../build/config.js";
import { api } from "../build/api.js";

describe("read-only Lunch Money server", () => {
    let client;

    before(async () => {
        const server = createReadonlyServer("test");
        const [clientTransport, serverTransport] =
            InMemoryTransport.createLinkedPair();
        client = new Client({ name: "readonly-test", version: "0" });
        await Promise.all([
            client.connect(clientTransport),
            server.connect(serverTransport),
        ]);
    });

    after(async () => {
        await client.close();
    });

    it("exposes exactly the positive allowlist", async () => {
        const { tools } = await client.listTools();
        assert.deepEqual(
            tools.map((tool) => tool.name).sort(),
            [...READ_ONLY_TOOL_NAMES].sort(),
        );
    });

    it("marks every exposed tool read-only and non-destructive", async () => {
        const { tools } = await client.listTools();
        for (const tool of tools) {
            assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
            assert.equal(tool.annotations?.destructiveHint, false, tool.name);
            assert.equal(tool.annotations?.openWorldHint, false, tool.name);
        }
    });

    it("does not expose representative mutation tools", async () => {
        const { tools } = await client.listTools();
        const names = new Set(tools.map((tool) => tool.name));
        for (const blocked of [
            "create_transactions",
            "update_transaction",
            "delete_transactions_bulk",
            "trigger_plaid_fetch",
            "refresh_synced_crypto",
            "upsert_budget",
        ]) {
            assert.equal(names.has(blocked), false, blocked);
        }
    });

    it("blocks outbound write methods before fetch", async () => {
        await assert.rejects(
            () =>
                runWithReadonlyConfig("TEST-TOKEN-NOT-USED", () =>
                    api.post("/transactions", { amount: "1" }),
                ),
            /blocked an outbound POST request/,
        );
    });
});
