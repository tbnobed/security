import { eq, and, isNull, sql } from "drizzle-orm";
import {
  db,
  clientCompaniesTable,
  clientEmployeesTable,
  preregistrationsTable,
  usersTable,
} from "@workspace/db";
import type { AppUser, ClientCompany } from "@workspace/db";
import { logger } from "./logger";

// Find or create a company by name (case-insensitive). Returns the canonical row.
export async function getOrCreateCompanyByName(rawName: string): Promise<ClientCompany> {
  const name = rawName.trim();
  const [existing] = await db
    .select()
    .from(clientCompaniesTable)
    .where(eq(sql`lower(${clientCompaniesTable.name})`, name.toLowerCase()));
  if (existing) return existing;

  // Concurrent creates race on the lower(name) unique index; on conflict re-select.
  const inserted = await db
    .insert(clientCompaniesTable)
    .values({ name })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) return inserted[0];

  const [row] = await db
    .select()
    .from(clientCompaniesTable)
    .where(eq(sql`lower(${clientCompaniesTable.name})`, name.toLowerCase()));
  if (!row) throw new Error(`Failed to upsert client company "${name}"`);
  return row;
}

// Lazy migration for legacy client accounts created before company scoping:
// creates/links the company from the account's companyName and re-points the
// rows that account owns (roster entries + pre-registrations) at the company.
// Returns the company, or null when the account has no companyName to heal from.
export async function ensureClientCompany(user: AppUser): Promise<ClientCompany | null> {
  if (user.clientCompanyId != null) {
    const [company] = await db
      .select()
      .from(clientCompaniesTable)
      .where(eq(clientCompaniesTable.id, user.clientCompanyId));
    if (company) return company;
    // Dangling reference (shouldn't happen) — fall through and re-heal.
  }

  if (!user.companyName?.trim()) return null;

  const company = await getOrCreateCompanyByName(user.companyName);

  await db
    .update(usersTable)
    .set({ clientCompanyId: company.id, companyName: company.name })
    .where(eq(usersTable.clerkId, user.clerkId));

  // Backfill pre-registrations this login created (no unique constraints — bulk).
  await db
    .update(preregistrationsTable)
    .set({ clientCompanyId: company.id })
    .where(
      and(
        eq(preregistrationsTable.clientUserId, user.clerkId),
        isNull(preregistrationsTable.clientCompanyId),
      ),
    );

  // Backfill roster entries. The (client_company_id, lower(name)) unique index
  // can conflict if two legacy accounts of the same company had the same
  // employee name — fall back to row-by-row and skip conflicting duplicates.
  try {
    await db
      .update(clientEmployeesTable)
      .set({ clientCompanyId: company.id })
      .where(
        and(
          eq(clientEmployeesTable.clientUserId, user.clerkId),
          isNull(clientEmployeesTable.clientCompanyId),
        ),
      );
  } catch {
    const rows = await db
      .select({ id: clientEmployeesTable.id, name: clientEmployeesTable.name })
      .from(clientEmployeesTable)
      .where(
        and(
          eq(clientEmployeesTable.clientUserId, user.clerkId),
          isNull(clientEmployeesTable.clientCompanyId),
        ),
      );
    for (const row of rows) {
      try {
        await db
          .update(clientEmployeesTable)
          .set({ clientCompanyId: company.id })
          .where(eq(clientEmployeesTable.id, row.id));
      } catch {
        logger.warn(
          { employeeId: row.id, employeeName: row.name, companyId: company.id },
          "Skipped roster backfill for duplicate employee name within company",
        );
      }
    }
  }

  return company;
}
