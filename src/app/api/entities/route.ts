import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { allEntities } from "@/lib/entities/registry";

/** Entities and their declared fields — what the Entity Rule Builder's field/operator pickers are populated from. */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  return NextResponse.json({
    ok: true,
    entities: allEntities.map((entity) => ({
      key: entity.key,
      labelFa: entity.labelFa,
      module: entity.module,
      fields: entity.fields,
    })),
  });
}
