import { McpServer } from "@modelcontextprotocol/server";
import { registerUserTools } from "./tools/user.js";
import { registerCategoryTools } from "./tools/categories.js";
import { registerTagTools } from "./tools/tags.js";
import { registerTransactionTools } from "./tools/transactions.js";
import { registerRecurringItemsTools } from "./tools/recurring-items.js";
import { registerBudgetTools } from "./tools/budgets.js";
import { registerManualAccountTools } from "./tools/manual-accounts.js";
import { registerPlaidAccountTools } from "./tools/plaid-accounts.js";
import { registerCryptoTools } from "./tools/crypto.js";
import { registerBalanceHistoryTools } from "./tools/balance-history.js";
import { registerPrompts } from "./prompts.js";

export const READ_ONLY_TOOL_NAMES = [
    "get_user",
    "get_all_categories",
    "get_single_category",
    "get_all_tags",
    "get_single_tag",
    "get_transactions",
    "get_single_transaction",
    "get_transaction_attachment_url",
    "get_recurring_items",
    "get_single_recurring_item",
    "get_budget_summary",
    "get_budget_settings",
    "get_all_manual_accounts",
    "get_single_manual_account",
    "get_all_plaid_accounts",
    "get_single_plaid_account",
    "get_supported_cryptocurrencies",
    "get_all_manual_crypto",
    "get_single_manual_crypto",
    "get_all_synced_crypto",
    "get_single_synced_crypto",
    "get_synced_crypto_balance",
    "get_balance_history",
    "get_account_balance_history",
    "get_crypto_synced_balance_history",
] as const;

const READ_ONLY_TOOL_SET = new Set<string>(READ_ONLY_TOOL_NAMES);

function registerAllToolModules(server: McpServer): void {
    registerUserTools(server);
    registerCategoryTools(server);
    registerTagTools(server);
    registerTransactionTools(server);
    registerRecurringItemsTools(server);
    registerBudgetTools(server);
    registerManualAccountTools(server);
    registerPlaidAccountTools(server);
    registerCryptoTools(server);
    registerBalanceHistoryTools(server);
}

/**
 * Build a configured `McpServer` with all LunchMoney tools and prompts registered.
 *
 * Before any tool is invoked, config from `./config` must be established:
 * `initializeConfig(token)` for single-tenant callers (stdio, one-user CLI),
 * or `runWithConfig(token, fn)` for multi-tenant hosts. The returned server is
 * wired up but inert — actual API calls go through that config, which throws
 * `"Configuration not initialized. Call initializeConfig() or runWithConfig()
 * first."` on the first tool invocation if neither has been established.
 *
 * @param version - Version string surfaced to MCP clients as `serverInfo.version`.
 */
export function createServer(version: string): McpServer {
    const server = new McpServer({
        name: "lunchmoney-mcp",
        version,
    });

    registerAllToolModules(server);
    registerPrompts(server);

    return server;
}

/**
 * Build a server whose protocol surface is structurally read-only.
 *
 * Tool registration is filtered through a positive allowlist. Mutating tools
 * are never added to the MCP server, and every exposed tool is annotated as
 * read-only/non-destructive. Prompts from the full server are intentionally
 * omitted because several describe mutation workflows.
 */
export function createReadonlyServer(version: string): McpServer {
    const server = new McpServer({
        name: "lunchmoney-readonly",
        version,
    });
    const registerTool = server.registerTool.bind(server);
    const registrationView = new Proxy(server, {
        get(target, property, receiver) {
            if (property !== "registerTool") {
                return Reflect.get(target, property, receiver);
            }
            return (name: string, definition: Record<string, unknown>, handler: unknown) => {
                if (!READ_ONLY_TOOL_SET.has(name)) return undefined;
                const annotations = {
                    ...((definition.annotations as Record<string, unknown> | undefined) ?? {}),
                    readOnlyHint: true,
                    destructiveHint: false,
                    openWorldHint: false,
                };
                return (registerTool as (...args: unknown[]) => unknown)(
                    name,
                    { ...definition, annotations },
                    handler,
                );
            };
        },
    }) as McpServer;

    registerAllToolModules(registrationView);
    return server;
}
