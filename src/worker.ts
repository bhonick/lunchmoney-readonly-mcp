import { createMcpHandler } from "agents/mcp/server";
import {
    createOAuthWorker,
    type BaseEnv,
    type AppEnv,
    type GoogleUserInfo,
    type ResolveUserResult,
    type McpApiHandler,
} from "@bm1549/remote-mcp-cloudflare";
import {
    createCategorizeServer,
    createReadonlyServer,
} from "@akutishevsky/lunchmoney-mcp/server";
import {
    runWithCategorizeConfig,
    runWithReadonlyConfig,
} from "@akutishevsky/lunchmoney-mcp/config";
import packageJson from "../package.json" with { type: "json" };

interface WorkerEnv extends BaseEnv {
    REGISTER_LIMITER: RateLimit;
    LUNCHMONEY_API_TOKEN: string;
    ACCESS_MODE?: string;
}

interface UserProps extends Record<string, unknown> {
    sub: string;
    email: string;
}

type WorkerAccessMode = "readonly" | "categorize";

function resolveAccessMode(raw: string | undefined): WorkerAccessMode {
    const normalized = (raw ?? "").trim().toLowerCase();
    if (!normalized || normalized === "readonly") return "readonly";
    if (normalized === "categorize") return "categorize";
    throw new Error(
        `Unsupported ACCESS_MODE "${raw}". Use "categorize" or omit it for strict read-only mode.`,
    );
}

/**
 * Per-request MCP server factory.
 *
 * The default deployment is strictly read-only. A separately configured
 * sibling Worker may opt into ACCESS_MODE=categorize, which exposes one
 * narrowly scoped mutation tool and binds an API policy that permits only
 * category-only PUTs to individual transactions.
 */
const lunchMoneySource = {
    serve(path: string): McpApiHandler {
        return {
            async fetch(
                request: Request,
                env: never,
                ctx: ExecutionContext,
            ): Promise<Response> {
                const workerEnv = env as unknown as WorkerEnv;

                const props = ctx.props as UserProps | undefined;
                if (!props?.sub) {
                    throw new Error("Missing user identity in MCP auth context");
                }

                if (!workerEnv.LUNCHMONEY_API_TOKEN) {
                    throw new Error("Lunch Money server secret is not configured");
                }

                const accessMode = resolveAccessMode(workerEnv.ACCESS_MODE);
                const handler = createMcpHandler(
                    () =>
                        accessMode === "categorize"
                            ? createCategorizeServer(packageJson.version)
                            : createReadonlyServer(packageJson.version),
                    { route: path },
                );

                if (accessMode === "categorize") {
                    return runWithCategorizeConfig(
                        workerEnv.LUNCHMONEY_API_TOKEN,
                        () => handler(request, env, ctx),
                    );
                }

                return runWithReadonlyConfig(workerEnv.LUNCHMONEY_API_TOKEN, () =>
                    handler(request, env, ctx),
                );
            },
        };
    },
};

export default createOAuthWorker(lunchMoneySource, {
    userIdSource: "sub",
    resolveUser: (
        userinfo: GoogleUserInfo,
        env: AppEnv,
        _request: Request,
        _oauthReqInfo?: unknown,
    ): Promise<ResolveUserResult> => {
        if (!userinfo.email_verified || !userinfo.email || !userinfo.sub) {
            return Promise.resolve({ reject: "Email not verified by Google" });
        }
        const email = userinfo.email.toLowerCase();
        const sub = userinfo.sub;

        const allowedRaw = ((env.ALLOWED_EMAILS as string | undefined) ?? "").trim();
        if (!allowedRaw) {
            return Promise.resolve({
                reject: "Server access allowlist is not configured",
            });
        }
        const allowed = allowedRaw
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        if (!allowed.includes(email)) {
            return Promise.resolve({
                reject: "This Google account is not authorized",
            });
        }

        return Promise.resolve({ userId: sub, props: { sub, email } });
    },
    registerPolicy: {
        requirePkce: true,
        allowedRedirectSchemes: ["https", "http-localhost"],
        rejectIpHosts: true,
        maxRedirectUris: 5,
    },
});
