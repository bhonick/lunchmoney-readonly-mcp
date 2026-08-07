import { describe, it, expect } from "vitest";
import { runWithConfig, getConfig } from "@akutishevsky/lunchmoney-mcp/config";

describe("per-request token isolation", () => {
    it("keeps concurrent tenants' tokens separate", async () => {
        const observed: Array<[string, string]> = [];

        const tenant = (token: string, delayMs: number) =>
            runWithConfig(token, async () => {
                await new Promise((r) => setTimeout(r, delayMs));
                observed.push([token, getConfig().lunchmoneyApiToken]);
            });

        await Promise.all([tenant("tok-a", 20), tenant("tok-b", 5)]);

        for (const [expected, actual] of observed) {
            expect(actual).toBe(expected);
        }
        expect(observed).toHaveLength(2);
    });

    it("does not leak a token to an unscoped reader", () => {
        runWithConfig("scoped-only", () => {
            expect(getConfig().lunchmoneyApiToken).toBe("scoped-only");
        });
        // Outside the scope there is no process-wide fallback in the Worker,
        // because worker.ts never calls initializeConfig.
        expect(() => getConfig()).toThrow(/Configuration not initialized/);
    });
});
