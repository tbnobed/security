// Quick connection test for SOURCE=efusion-sql — run: npm run test-sql
// Reads the same EFUSION_SQL_* env vars as the bridge (loads .env if present).

import { readFileSync } from "node:fs";

try {
  for (const line of readFileSync(new URL(".env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {
  // no .env — rely on exported env vars
}

const server = process.env.EFUSION_SQL_SERVER;
const user = process.env.EFUSION_SQL_USER;
const password = process.env.EFUSION_SQL_PASSWORD;
if (!server || !user || !password) {
  console.error("Set EFUSION_SQL_SERVER, EFUSION_SQL_USER and EFUSION_SQL_PASSWORD (in .env or the environment).");
  process.exit(1);
}

let mssql;
try {
  mssql = (await import("mssql")).default;
} catch {
  console.error("mssql driver not installed — run `npm install` in this folder first.");
  process.exit(1);
}

const port = process.env.EFUSION_SQL_PORT ? Number(process.env.EFUSION_SQL_PORT) : undefined;
const database = process.env.EFUSION_SQL_DATABASE || "AXxess";
console.log(
  `Connecting to ${server}${port ? `:${port}` : `\\${process.env.EFUSION_SQL_INSTANCE || "MAXXESS"}`} db=${database} as ${user} ...`,
);

try {
  const pool = await mssql.connect({
    server,
    ...(port ? { port } : {}),
    database,
    user,
    password,
    options: {
      ...(port ? {} : { instanceName: process.env.EFUSION_SQL_INSTANCE || "MAXXESS" }),
      encrypt: process.env.EFUSION_SQL_ENCRYPT === "true",
      trustServerCertificate: true,
    },
    connectionTimeout: 10_000,
  });

  const occ = await pool
    .request()
    .query("SELECT COUNT(*) AS n FROM CardholderLocation WHERE COALESCE([LastAreaName], '') <> ''");
  const ev = await pool
    .request()
    .query("SELECT COUNT(*) AS n, MAX([EventTime]) AS latest FROM CardholderTransactions_V");

  console.log("Connected OK.");
  console.log(`  Cardholders with a last-known area: ${occ.recordset[0].n}`);
  console.log(`  Door events in the log: ${ev.recordset[0].n} (latest: ${ev.recordset[0].latest ?? "none"})`);
  console.log("The bridge should work — set SOURCE=efusion-sql and start it.");
  await pool.close();
} catch (err) {
  console.error(`FAILED: ${err.message}`);
  console.error(
    "Checklist: TCP/IP enabled + port pinned on the SQL Server (SQL-SETUP.md), firewall allows this machine, login/password correct, SQL Server service restarted after changes.",
  );
  process.exit(1);
}
