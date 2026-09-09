import { prisma } from "@/lib/db/prisma";
import { queryRahkaran } from "@/lib/db/rahkaran";
import type { BusinessEntityDef } from "./types";

/**
 * Runs the entity's sourceSql and replaces its EntityRecord snapshot with
 * the result. Upserts are sequential (one row at a time) — fine at the
 * scale a single company's open receivables/LCs/etc. actually reach; batch
 * it only if a specific entity's volume proves this too slow.
 *
 * Rows no longer returned by sourceSql (paid off, closed, whatever the
 * entity's own WHERE clause excludes now) are dropped by comparing
 * lastSeenAt against this sync's start time — not by collecting an id list,
 * so this scales regardless of entity size instead of risking a giant
 * NOT IN parameter list.
 */
export async function syncEntity<T extends Record<string, unknown>>(
  def: BusinessEntityDef<T>,
): Promise<number> {
  const startedAt = new Date();
  const rows = await queryRahkaran<T>(def.sourceSql);

  for (const row of rows) {
    const externalId = String(row[def.idField]);
    await prisma.entityRecord.upsert({
      where: { entityKey_externalId: { entityKey: def.key, externalId } },
      create: { entityKey: def.key, externalId, data: JSON.stringify(row) },
      update: { data: JSON.stringify(row) },
    });
  }

  await prisma.entityRecord.deleteMany({
    where: { entityKey: def.key, lastSeenAt: { lt: startedAt } },
  });

  return rows.length;
}

/** Reads the current materialized snapshot for one entity. Does not sync — call syncEntity() first if freshness matters. */
export async function loadEntityRecords<T = Record<string, unknown>>(
  entityKey: string,
): Promise<T[]> {
  const rows = await prisma.entityRecord.findMany({ where: { entityKey } });
  return rows.map((row) => JSON.parse(row.data) as T);
}
