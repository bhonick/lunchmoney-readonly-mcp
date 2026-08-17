import { AsyncLocalStorage } from "node:async_hooks";

interface Config {
    lunchmoneyApiToken: string;
    baseUrl: string;
    readOnly: boolean;
}

const BASE_URL = "https://api.lunchmoney.dev/v2";

/**
 * Request-scoped config. Preferred over the process-wide fallback so that a
 * single process can serve multiple tenants concurrently without racing.
 */
const configStorage = new AsyncLocalStorage<Config>();

/** Process-wide fallback for single-tenant callers (stdio, CLI). */
let fallbackConfig: Config | null = null;

function buildConfig(lunchmoneyApiToken: string, readOnly = false): Config {
    if (!lunchmoneyApiToken) {
        throw new Error(
            "LunchMoney API token is required. Pass it to initializeConfig() or runWithConfig().",
        );
    }
    return { lunchmoneyApiToken, baseUrl: BASE_URL, readOnly };
}

/**
 * Run `fn` with `lunchmoneyApiToken` bound to the current async context.
 *
 * Multi-tenant hosts (a stateless Worker serving many users from one isolate)
 * MUST use this rather than `initializeConfig`: the token is visible only to
 * `fn` and everything it awaits, so concurrent requests cannot read each
 * other's credentials.
 *
 * @param lunchmoneyApiToken - Personal API token from
 *   https://my.lunchmoney.app/developers.
 * @param fn - Work to run under that token.
 * @throws If `lunchmoneyApiToken` is empty.
 */
const runWithConfig = <T>(lunchmoneyApiToken: string, fn: () => T): T =>
    configStorage.run(buildConfig(lunchmoneyApiToken), fn);

/**
 * Run `fn` with a request-scoped token and a hard read-only API policy.
 * Any attempted HTTP method other than GET is rejected before a request can
 * reach Lunch Money. Remote read-only hosts should use this in addition to
 * exposing only the read-only MCP tool factory.
 */
const runWithReadonlyConfig = <T>(
    lunchmoneyApiToken: string,
    fn: () => T,
): T => configStorage.run(buildConfig(lunchmoneyApiToken, true), fn);

/**
 * Set the process-wide LunchMoney API token.
 *
 * Intended for single-tenant deployments (stdio, one-user CLI). Multi-tenant
 * hosts must use {@link runWithConfig} instead — a process-wide token is
 * shared by every concurrent request in the process.
 *
 * @param lunchmoneyApiToken - Personal API token.
 * @throws If `lunchmoneyApiToken` is empty.
 */
const initializeConfig = (lunchmoneyApiToken: string): Config => {
    fallbackConfig = buildConfig(lunchmoneyApiToken);
    return fallbackConfig;
};

/**
 * The active config: the async-scoped one when inside {@link runWithConfig},
 * otherwise the process-wide one from {@link initializeConfig}.
 *
 * If the async context is ever lost — a continuation whose async resource
 * was created before {@link runWithConfig} ran, e.g. a module-level promise,
 * an event listener registered at connect time, or a callback scheduled
 * outside the bound scope — this silently returns the process-wide fallback
 * rather than throwing. Multi-tenant hosts must therefore never call
 * {@link initializeConfig}: its mere presence turns a lost context into a
 * cross-tenant token leak instead of a loud failure.
 *
 * @throws If neither has been established.
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
    type Config,
    initializeConfig,
    runWithConfig,
    runWithReadonlyConfig,
    getConfig,
};
