#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createRequire } from "module";
import { initializeConfig } from "./config.js";
import { createServer } from "./server.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const token = process.env.LUNCHMONEY_API_TOKEN;
if (!token) {
    console.error(
        "Failed to get the LUNCHMONEY_API_TOKEN. Probably it wasn't added during the server configuration.",
    );
    process.exit(1);
}
initializeConfig(token);

const handle = serveStdio(
    () => {
        try {
            return createServer(version);
        } catch (error) {
            console.error("Fatal error creating MCP server:", error);
            process.exit(1);
        }
    },
    {
        onerror: (error) => console.error("Fatal error in main():", error),
    },
);
console.error("Lunchmoney MCP Server running on stdio");

const shutdown = async () => {
    console.error("Shutting down Lunchmoney MCP Server...");
    await handle.close();
    process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
