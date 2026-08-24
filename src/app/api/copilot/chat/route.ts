import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { askCopilot, type ChatTurn } from "@/lib/copilot/chat";

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const bodySchema = z.object({
  message: z.string().min(1),
  history: z.array(turnSchema).optional().default([]),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "پارامترهای نامعتبر", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const reply = await askCopilot(
      parsed.data.history as ChatTurn[],
      parsed.data.message,
      session.user.id,
    );
    return NextResponse.json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
