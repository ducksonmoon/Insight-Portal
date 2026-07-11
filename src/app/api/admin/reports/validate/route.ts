import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveSqlText } from "@/lib/reports/sql-loader";
import { validateReportDefinition } from "@/lib/reports/validate";
import {
  normalizeDefinition,
  reportDefinitionInputSchema,
} from "@/types/report";

const bodySchema = z.object({
  definition: reportDefinitionInputSchema,
  sqlText: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ورودی نامعتبر", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const definition = normalizeDefinition(parsed.data.definition);
    const sqlText =
      parsed.data.sqlText ??
      (definition.sqlSource.mode === "inline"
        ? definition.sqlSource.text ?? ""
        : resolveSqlText(definition));

    const result = validateReportDefinition(definition, sqlText);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
