import { spawn } from "node:child_process";
import { accessSync, constants, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "..", "..");
const apiEntry = resolve(workspaceRoot, "apps", "api", "dist", "index.js");
const performanceEntry = resolve(
  workspaceRoot,
  "packages",
  "performance-tests",
  "dist",
  "index.js"
);
const reportsDirectory = resolve(__dirname, "reports");
const runtimeDirectory = resolve(workspaceRoot, "runtime-data");

async function waitForApi(url, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // API not ready yet.
    }

    await delay(500);
  }

  throw new Error(`API did not become ready at ${url}`);
}

function runProcess(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      stdio: "inherit",
      shell: false,
      ...options
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise(undefined);
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function loadScenarios(profile) {
  const module = await import(pathToFileURL(performanceEntry).href);
  return module.getLoadScenarios(profile);
}

async function main() {
  accessSync(apiEntry, constants.F_OK);
  accessSync(performanceEntry, constants.F_OK);

  rmSync(runtimeDirectory, { recursive: true, force: true });
  mkdirSync(runtimeDirectory, { recursive: true });
  mkdirSync(reportsDirectory, { recursive: true });

  const profile = process.argv[2] === "smoke" ? "smoke" : "baseline";
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const scenarios = await loadScenarios(profile);
  const apiPort = 4010;
  const apiProcess = spawn(process.execPath, [apiEntry], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      INFRALYNX_API_PORT: String(apiPort)
    },
    stdio: "inherit",
    shell: false
  });

  try {
    await waitForApi(`http://127.0.0.1:${apiPort}/api/overview`);

    for (const scenario of scenarios) {
      const scenarioPath = join(__dirname, "scenarios", scenario.fileName);
      const reportPath = join(reportsDirectory, `${scenario.id}-${profile}.json`);
      await runProcess(
        npmCommand,
        ["exec", "--", "artillery", "run", "--output", reportPath, scenarioPath],
        {
          shell: process.platform === "win32",
        env: {
          ...process.env,
          INFRALYNX_BASE_URL: `http://127.0.0.1:${apiPort}`
        }
        }
      );
    }
  } finally {
    apiProcess.kill("SIGTERM");
    if (!apiProcess.killed) {
      apiProcess.kill();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
