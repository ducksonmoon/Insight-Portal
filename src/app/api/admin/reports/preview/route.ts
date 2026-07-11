import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { executeDefinitionPreview } from "@/lib/reports/engine";
import {
  normalizeDefinition,
  reportDefinitionInputSchema,
} from "@/types/report";

const bodySchema = z.object({
  definition: reportDefinitionInputSchema,
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
  maxRows: z.number().int().positive().max(500).optional().default(100),
  timeoutSec: z.number().int().positive().max(60).optional().default(15),
  datasetId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
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

    const result = await executeDefinitionPreview(
      definition,
      parsed.data.parameters,
      {
        maxRows: parsed.data.maxRows,
        timeoutSec: parsed.data.timeoutSec,
        userId: session?.user?.id,
        datasetId: parsed.data.datasetId,
      },
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا در پیش‌نمایش";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
