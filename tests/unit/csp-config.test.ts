import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const configUrl = pathToFileURL(fileURLToPath(new URL("../../next.config.ts", import.meta.url))).href;

function loadHeaderRules(nodeEnv: "development" | "production" | "test"): HeaderRule[] {
  const runner = `
    const { default: config } = await import(${JSON.stringify(configUrl)});
    if (typeof config.headers !== "function") throw new Error("next.config.ts must expose headers()");
    process.stdout.write(JSON.stringify(await config.headers()));
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", runner], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: nodeEnv },
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`Could not load next.config.ts for NODE_ENV=${nodeEnv}: ${result.stderr || result.stdout}`);
  }

  return JSON.parse(result.stdout) as HeaderRule[];
}

function readCsp(nodeEnv: "development" | "production" | "test") {
  const values = loadHeaderRules(nodeEnv).flatMap((rule) =>
    rule.headers
      .filter((header) => header.key.toLowerCase() === "content-security-policy")
      .map((header) => header.value),
  );
  expect(values, `${nodeEnv} must emit exactly one CSP header`).toHaveLength(1);

  const entries = values[0]!
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(/\s+/));
  const names = entries.map(([name]) => name);
  expect(new Set(names).size, `${nodeEnv} must not repeat a CSP directive`).toBe(names.length);

  return {
    raw: values[0]!,
    directives: new Map(entries.map(([name, ...sources]) => [name!, sources])),
  };
}

describe("Next.js Content-Security-Policy", () => {
  it("allows React development diagnostics without duplicating script-src", () => {
    const { raw, directives } = readCsp("development");

    expect(directives.get("script-src")).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
    expect(raw).not.toContain("*");
  });

  it("keeps unsafe-eval out of production and preserves isolation directives", () => {
    const { raw, directives } = readCsp("production");

    expect(directives.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(raw).not.toContain("'unsafe-eval'");
    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'self'"]);
    expect(directives.get("form-action")).toEqual(["'self'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("does not treat the test environment as development", () => {
    const { directives } = readCsp("test");

    expect(directives.get("script-src")).not.toContain("'unsafe-eval'");
  });
});
