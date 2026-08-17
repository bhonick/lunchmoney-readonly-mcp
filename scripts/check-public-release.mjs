import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// The vendored MCP is maintained upstream and contains intentional placeholder
// tokens and test fixtures. Scan this project's deployment code and docs here.
const ignoredDirectories = new Set([
    ".git",
    "node_modules",
    ".wrangler",
    "dist",
    "vendor-lunchmoney-mcp",
]);
const ignoredFiles = new Set(["pnpm-lock.yaml", "package-lock.json"]);
const suspiciousPatterns = [
    { name: "Lunch Money API token", pattern: /LUNCHMONEY_API_TOKEN\s*=\s*[^\s#]+/i },
    { name: "Google client secret", pattern: /GOOGLE_CLIENT_SECRET\s*=\s*[^\s#]+/i },
    { name: "OAuth state secret", pattern: /STATE_SECRET\s*=\s*[^\s#]+/i },
    { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

async function filesIn(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (!ignoredDirectories.has(entry.name)) files.push(...await filesIn(fullPath));
        } else if (!ignoredFiles.has(entry.name)) {
            files.push(fullPath);
        }
    }
    return files;
}

const matches = [];
for (const file of await filesIn(root)) {
    let content;
    try {
        content = await readFile(file, "utf8");
    } catch {
        continue;
    }
    for (const { name, pattern } of suspiciousPatterns) {
        if (pattern.test(content)) matches.push(`${relative(root, file)}: possible ${name}`);
    }
}

if (matches.length) {
    console.error("Public-release check failed:\n" + matches.join("\n"));
    process.exit(1);
}

console.log("Public-release check passed: no configured secrets or private keys found.");
