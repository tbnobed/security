import { createRequire } from "node:module";
import { resolve } from "node:path";
const requireDb = createRequire(resolve(process.cwd(), "lib/db/package.json"));
const { Client } = requireDb("pg");
const requireScripts = createRequire(resolve(process.cwd(), "scripts/package.json"));
const bcrypt = requireScripts("bcryptjs");

const DB_URL = process.env.DATABASE_URL;

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@studiogms.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "StudioAdmin!2026";
const BCRYPT_ROUNDS = 12;

if (!DB_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

function randomId() {
  return "usr_" + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const existing = await client.query(
    `SELECT clerk_id FROM app_users WHERE lower(email) = lower($1) LIMIT 1`,
    [ADMIN_EMAIL],
  );

  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE app_users
         SET role = 'admin', display_name = $2, password_hash = $3
       WHERE clerk_id = $1`,
      [existing.rows[0].clerk_id, "Studio Admin", passwordHash],
    );
    console.log("Updated existing admin:", existing.rows[0].clerk_id);
  } else {
    const id = randomId();
    await client.query(
      `INSERT INTO app_users (clerk_id, display_name, email, role, password_hash)
       VALUES ($1, $2, $3, 'admin', $4)`,
      [id, "Studio Admin", ADMIN_EMAIL, passwordHash],
    );
    console.log("Created admin:", id);
  }

  await client.end();

  console.log("\n=== Main admin account ready ===");
  console.log("Email:   ", ADMIN_EMAIL);
  console.log("Password:", ADMIN_PASSWORD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
