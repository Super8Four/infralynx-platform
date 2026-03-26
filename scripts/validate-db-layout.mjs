import { existsSync, readFileSync } from "node:fs";

const engines = ["postgres", "mssql", "mariadb"];

const packageJsonPath = "packages/db-abstraction/package.json";

if (!existsSync(packageJsonPath)) {
  throw new Error("Missing packages/db-abstraction/package.json");
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

if (packageJson.name !== "@infralynx/db-abstraction") {
  throw new Error("Database abstraction package name is not aligned with the workspace contract.");
}

for (const engine of engines) {
  const path = `migrations/${engine}`;

  if (!existsSync(path)) {
    throw new Error(`Missing migration directory: ${path}`);
  }
}

console.log("Database abstraction layout is valid for postgres, mssql, and mariadb.");
