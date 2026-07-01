const SECRET = process.env.CLERK_SECRET_KEY;
const H = { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

async function get(path) {
  const r = await fetch(`https://api.clerk.com/v1${path}`, { headers: H });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

for (const p of [
  "/instance",
  "/instance/restrictions",
  "/instance/organization_settings",
  "/beta_features/sign_in",
  "/auth_config",
]) {
  const { status, body } = await get(p);
  console.log(`\n=== GET ${p} -> ${status} ===`);
  console.log(typeof body === "string" ? body.slice(0, 800) : JSON.stringify(body, null, 2).slice(0, 1500));
}
