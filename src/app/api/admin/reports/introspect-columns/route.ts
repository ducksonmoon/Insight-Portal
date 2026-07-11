import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { executeDefinitionPreview } from "@/lib/reports/engine";
import { suggestColumnsFromRows } from "@/lib/reports/validate";
import {
  normalizeDefinition,
  reportDefinitionInputSchema,
} from "@/types/report";

const bodySchema = z.object({
  definition: reportDefinitionInputSchema,
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
  datasetId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    }

    const definition = normalizeDefinition(parsed.data.definition);

    const result = await executeDefinitionPreview(
      definition,
      parsed.data.parameters,
      {
        maxRows: 50,
        timeoutSec: 20,
        datasetId: parsed.data.datasetId,
      },
    );

    const columns = suggestColumnsFromRows(result.rows);
    return NextResponse.json({
      columns,
      sampleRowCount: result.rows.length,
      durationMs: result.durationMs,
      datasetId: parsed.data.datasetId ?? definition.datasets[0]?.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا در تشخیص ستون‌ها";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
