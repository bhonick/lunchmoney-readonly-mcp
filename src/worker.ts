import { createMcpHandler } from "agents/mcp/server";
import {
    createOAuthWorker,
    signResumeToken,
    type BaseEnv,
    type AppEnv,
    type GoogleUserInfo,
    type ResolveUserResult,
    type McpApiHandler,
} from "@bm1549/remote-mcp-cloudflare";
import { createServer } from "@akutishevsky/lunchmoney-mcp/server";
import { runWithConfig } from "@akutishevsky/lunchmoney-mcp/config";
import packageJson from "../package.json" with { type: "json" };
import { getUserToken } from "./storage.js";
import { setupHandler } from "./handlers/setup.js";

interface WorkerEnv extends BaseEnv {
    USER_TOKENS: KVNamespace;
    REGISTER_LIMITER: RateLimit;
}

interface UserProps extends Record<string, unknown> {
    sub: string;
    email: string;
}

/**
 * Per-request MCP server factory.
 *
 * Replaces the former `LunchMoneyMCP` Durable Object. Because one stateless
 * isolate serves every user, the LunchMoney token is bound with
 * `runWithConfig` for the duration of this request only — never through the
 * module-level `initializeConfig` singleton, which concurrent requests share.
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
                const sub = props?.sub;
                if (!sub) {
                    throw new Error("Missing sub in MCP auth context");
                }

                const stored = await getUserToken(workerEnv.USER_TOKENS, sub);
                if (!stored) {
                    // Shouldn't happen — resolveUser would have redirected
                    // to /setup before we got here. If we did, the KV row
                    // was deleted under an active grant.
                    throw new Error(
                        `No LunchMoney token stored for user ${sub}. Sign in again to re-onboard.`,
                    );
                }

                const handler = createMcpHandler(
                    () => createServer(packageJson.version),
                    { route: path },
                );

                // The scope must cover the whole request, not just server
                // construction — see the correction note above.
                return runWithConfig(stored.token, () =>
                    handler(request, env, ctx),
                );
            },
        };
    },
};

export default createOAuthWorker(lunchMoneySource, {
    userIdSource: "sub",
    resolveUser: async (
        userinfo: GoogleUserInfo,
        env: AppEnv,
        _request: Request,
        oauthReqInfo?: unknown,
    ): Promise<ResolveUserResult> => {
        if (!userinfo.email_verified || !userinfo.email || !userinfo.sub) {
            return { reject: "Email not verified by Google" };
        }
        const email = userinfo.email.toLowerCase();
        const sub = userinfo.sub;

        // Optional beta allowlist. Empty / unset => open signup.
        const allowedRaw = ((env.ALLOWED_EMAILS as string | undefined) ?? "").trim();
        if (allowedRaw) {
            const allowed = allowedRaw
                .split(",")
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean);
            if (!allowed.includes(email)) {
                // Matches the package's default error string for parity. We
                // accept the small information leak here; tightening this is
                // a follow-up.
                return { reject: `Forbidden: ${email} is not authorized` };
            }
        }

        const stored = await getUserToken(
            (env as unknown as WorkerEnv).USER_TOKENS,
            sub,
        );
        if (stored) {
            return { userId: sub, props: { sub, email } };
        }

        // First-time user: bounce to /setup to collect a LunchMoney token.
        const resumeToken = await signResumeToken(env, {
            oauthReqInfo,
            sub,
            email,
        });
        return { redirect: "/setup", resumeToken };
    },
    registerPolicy: {
        requirePkce: true,
        allowedRedirectSchemes: ["https", "http-localhost"],
        rejectIpHosts: true,
        maxRedirectUris: 5,
    },
    routes: {
        "/setup": setupHandler,
        // "/settings": stubbed for v1 — see README. Token rotation requires
        // operator-side KV delete in this release.
    },
});
