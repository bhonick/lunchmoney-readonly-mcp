import { createMcpHandler } from "agents/mcp/server";
import {
    createOAuthWorker,
    type BaseEnv,
    type AppEnv,
    type GoogleUserInfo,
    type ResolveUserResult,
    type McpApiHandler,
} from "@bm1549/remote-mcp-cloudflare";
import { createReadonlyServer } from "@akutishevsky/lunchmoney-mcp/server";
import { runWithReadonlyConfig } from "@akutishevsky/lunchmoney-mcp/config";
import packageJson from "../package.json" with { type: "json" };

interface WorkerEnv extends BaseEnv {
    REGISTER_LIMITER: RateLimit;
    LUNCHMONEY_API_TOKEN: string;
}

interface UserProps extends Record<string, unknown> {
    sub: string;
    email: string;
}

/**
 * Per-request MCP server factory.
 *
 * Replaces the former `LunchMoneyMCP` Durable Object. Because one stateless
 * isolate serves one allowlisted user, the Lunch Money token is supplied from
 * an encrypted Worker secret and is bound with a hard read-only API policy for
 * the duration of this request.
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

                // Read directly off the ExecutionContext the OAuth provider
                // populated — not from inside the factory, and not via any
                // `agents` auth-context helper. This has to happen out here,
                // before `handler(...)` is called, so the whole call
                // (including whatever tool dispatch that one request
                // triggers) can run inside a single `runWithConfig` scope.
                const props = ctx.props as UserProps | undefined;
                if (!props?.sub) {
                    throw new Error("Missing user identity in MCP auth context");
                }

                if (!workerEnv.LUNCHMONEY_API_TOKEN) {
                    throw new Error("Lunch Money server secret is not configured");
                }

                const handler = createMcpHandler(
                    () => createReadonlyServer(packageJson.version),
                    { route: path },
                );

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

        // This single-user Worker fails closed unless an allowlist is set.
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
