import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db/prisma";
import { syncAllRahkaranUsers } from "@/lib/auth/sync-users";

const bodySchema = z.object({
  setPassword: z
    .object({
      username: z.string().min(1),
      password: z.string().min(6),
      isAdmin: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Sync Rahkaran users into app DB.
 * Requires authenticated admin session.
 * Optional extra guard: x-admin-secret must match ADMIN_SYNC_SECRET when that env is set.
 */
export async function POST(request: Request) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const configuredSecret = process.env.ADMIN_SYNC_SECRET?.trim();
  if (configuredSecret) {
    const secret = request.headers.get("x-admin-secret");
    if (secret !== configuredSecret) {
      return NextResponse.json(
        { error: "Invalid admin sync secret" },
        { status: 401 },
      );
    }
  }

  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    }

    const result = await syncAllRahkaranUsers();

    if (parsed.data.setPassword) {
      const hash = await bcrypt.hash(parsed.data.setPassword.password, 10);
      await prisma.user.upsert({
        where: { username: parsed.data.setPassword.username },
        create: {
          username: parsed.data.setPassword.username,
          displayName: parsed.data.setPassword.username,
          passwordHash: hash,
          isAdmin: Boolean(parsed.data.setPassword.isAdmin),
          isActive: true,
        },
        update: {
          passwordHash: hash,
          ...(parsed.data.setPassword.isAdmin !== undefined
            ? { isAdmin: parsed.data.setPassword.isAdmin }
            : {}),
          isActive: true,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      ...result,
      requestedBy: session?.user?.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطای ناشناخته";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
