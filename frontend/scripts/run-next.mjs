import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const command = process.argv[2];

if (command !== "dev" && command !== "start") {
  console.error("Usage: node scripts/run-next.mjs <dev|start> [Next.js options]");
  process.exit(1);
}

const projectDir = fileURLToPath(new URL("../", import.meta.url));

// Next.js chooses its listening port before it normally loads .env files.
// Load them first so PORT in .env.local also controls `next dev`/`next start`.
loadEnvConfig(projectDir, command === "dev");

const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const hostname = command === "dev" ? "127.0.0.1" : "0.0.0.0";
const child = spawn(
  process.execPath,
  [nextCli, command, "--hostname", hostname, ...process.argv.slice(3)],
  { cwd: projectDir, env: process.env, stdio: "inherit" },
);

child.once("error", (error) => {
  console.error(`Could not start Next.js: ${error.message}`);
  process.exitCode = 1;
});

child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
