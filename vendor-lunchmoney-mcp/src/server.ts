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
import { registerCategorizationTools } from "./tools/categorization.js";
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

export const CATEGORIZE_TOOL_NAMES = [
    ...READ_ONLY_TOOL_NAMES,
    "categorize_transaction",
] as const;

const READ_ONLY_TOOL_SET = new Set<string>(READ_ONLY_TOOL_NAMES);
const CATEGORIZE_TOOL_SET = new Set<string>(CATEGORIZE_TOOL_NAMES);

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

function createAllowlistedServer(
    version: string,
    serverName: string,
    toolSet: Set<string>,
): McpServer {
    const server = new McpServer({
        name: serverName,
        version,
    });
    const registerTool = server.registerTool.bind(server);

    const registrationView = new Proxy(server, {
        get(target, property, receiver) {
            if (property !== "registerTool") {
                return Reflect.get(target, property, receiver);
            }

            return (
                name: string,
                definition: Record<string, unknown>,
                handler: unknown,
            ) => {
                if (!toolSet.has(name)) return undefined;

                const annotations = {
                    ...((definition.annotations as
                        | Record<string, unknown>
                        | undefined) ?? {}),
                    readOnlyHint: READ_ONLY_TOOL_SET.has(name),
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
    registerCategorizationTools(registrationView);
    return server;
}

/**
 * Build a configured McpServer with all LunchMoney tools and prompts registered.
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
 */
export function createReadonlyServer(version: string): McpServer {
    return createAllowlistedServer(
        version,
        "lunchmoney-readonly",
        READ_ONLY_TOOL_SET,
    );
}

/**
 * Build a server that is read-only except for one narrow transaction-category
 * mutation tool. The API layer must also be bound with runWithCategorizeConfig
 * so that an accidental or future tool cannot widen the write boundary.
 */
export function createCategorizeServer(version: string): McpServer {
    return createAllowlistedServer(
        version,
        "lunchmoney-categorize",
        CATEGORIZE_TOOL_SET,
    );
}
