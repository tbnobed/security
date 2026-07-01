import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(resolve(process.cwd(), "lib/db/package.json"));
const { Client } = require("pg");

const SECRET = process.env.CLERK_SECRET_KEY;
const DB_URL = process.env.DATABASE_URL;

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@studiogms.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "StudioAdmin!2026";

if (!SECRET?.startsWith("sk_")) {
  console.error("Missing/invalid CLERK_SECRET_KEY");
  process.exit(1);
}
if (!DB_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

async function findExistingUser() {
  const url = new URL("https://api.clerk.com/v1/users");
  url.searchParams.set("email_address", ADMIN_EMAIL);
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  if (!resp.ok) return null;
  const list = await resp.json();
  return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

async function createUser() {
  const resp = await fetch("https://api.clerk.com/v1/users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email_address: [ADMIN_EMAIL],
      password: ADMIN_PASSWORD,
      first_name: "Studio",
      last_name: "Admin",
      skip_password_checks: true,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error("Clerk create failed:", JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return data;
}

async function main() {
  let user = await findExistingUser();
  if (user) {
    console.log("Admin already exists in Clerk:", user.id);
    // Ensure the password is set to the known value
    const upd = await fetch(`https://api.clerk.com/v1/users/${user.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: ADMIN_PASSWORD, skip_password_checks: true }),
    });
    if (!upd.ok) {
      console.error("Password reset failed:", JSON.stringify(await upd.json(), null, 2));
    } else {
      console.log("Password reset to known value.");
    }
  } else {
    user = await createUser();
    console.log("Created Clerk admin user:", user.id);
  }

  const clerkId = user.id;
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  await client.query(
    `INSERT INTO app_users (clerk_id, display_name, email, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (clerk_id) DO UPDATE
       SET role = 'admin', display_name = EXCLUDED.display_name, email = EXCLUDED.email`,
    [clerkId, "Studio Admin", ADMIN_EMAIL],
  );
  await client.end();

  console.log("\n=== Main admin account ready ===");
  console.log("Email:   ", ADMIN_EMAIL);
  console.log("Password:", ADMIN_PASSWORD);
  console.log("Clerk ID:", clerkId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
