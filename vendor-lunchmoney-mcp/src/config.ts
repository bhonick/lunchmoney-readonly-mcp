import { AsyncLocalStorage } from "node:async_hooks";

type AccessMode = "full" | "readonly" | "categorize";

interface Config {
    lunchmoneyApiToken: string;
    baseUrl: string;
    accessMode: AccessMode;
}

const BASE_URL = "https://api.lunchmoney.dev/v2";

/**
 * Request-scoped config. Preferred over the process-wide fallback so that a
 * single process can serve multiple tenants concurrently without racing.
 */
const configStorage = new AsyncLocalStorage<Config>();

/** Process-wide fallback for single-tenant callers (stdio, CLI). */
let fallbackConfig: Config | null = null;

function buildConfig(
    lunchmoneyApiToken: string,
    accessMode: AccessMode = "full",
): Config {
    if (!lunchmoneyApiToken) {
        throw new Error(
            "LunchMoney API token is required. Pass it to initializeConfig() or runWithConfig().",
        );
    }
    return { lunchmoneyApiToken, baseUrl: BASE_URL, accessMode };
}

/**
 * Run `fn` with `lunchmoneyApiToken` bound to the current async context.
 *
 * Multi-tenant hosts (a stateless Worker serving many users from one isolate)
 * MUST use this rather than `initializeConfig`: the token is visible only to
 * `fn` and everything it awaits, so concurrent requests cannot read each
 * other's credentials.
 */
const runWithConfig = <T>(lunchmoneyApiToken: string, fn: () => T): T =>
    configStorage.run(buildConfig(lunchmoneyApiToken), fn);

/**
 * Run `fn` with a request-scoped token and a hard read-only API policy.
 * Any attempted HTTP method other than GET is rejected before a request can
 * reach Lunch Money.
 */
const runWithReadonlyConfig = <T>(
    lunchmoneyApiToken: string,
    fn: () => T,
): T => configStorage.run(buildConfig(lunchmoneyApiToken, "readonly"), fn);

/**
 * Run `fn` with a request-scoped token and a category-only mutation policy.
 *
 * GET requests remain available. The only permitted write is a PUT to one
 * numeric transaction resource whose JSON body contains exactly category_id.
 * All other writes are rejected before fetch.
 */
const runWithCategorizeConfig = <T>(
    lunchmoneyApiToken: string,
    fn: () => T,
): T => configStorage.run(buildConfig(lunchmoneyApiToken, "categorize"), fn);

/**
 * Set the process-wide LunchMoney API token.
 *
 * Intended for single-tenant deployments (stdio, one-user CLI). Multi-tenant
 * hosts must use runWithConfig instead.
 */
const initializeConfig = (lunchmoneyApiToken: string): Config => {
    fallbackConfig = buildConfig(lunchmoneyApiToken);
    return fallbackConfig;
};

/**
 * The active config: the async-scoped one when inside runWithConfig,
 * otherwise the process-wide one from initializeConfig.
 */
const getConfig = (): Config => {
    const scoped = configStorage.getStore();
    if (scoped) return scoped;
    if (fallbackConfig) return fallbackConfig;
    throw new Error(
        "Configuration not initialized. Call initializeConfig() or runWithConfig() first.",
    );
};

export {
    type AccessMode,
    type Config,
    initializeConfig,
    runWithConfig,
    runWithReadonlyConfig,
    runWithCategorizeConfig,
    getConfig,
};
