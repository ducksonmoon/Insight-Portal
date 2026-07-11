import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const { id: reportSlug } = await params;
  const fav = await prisma.reportFavorite.findUnique({
    where: {
      userId_reportSlug: {
        userId: session.user.id,
        reportSlug,
      },
    },
  });

  return NextResponse.json({ ok: true, favorite: Boolean(fav) });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const { id: reportSlug } = await params;
  await prisma.reportFavorite.upsert({
    where: {
      userId_reportSlug: {
        userId: session.user.id,
        reportSlug,
      },
    },
    create: { userId: session.user.id, reportSlug },
    update: {},
  });

  return NextResponse.json({ ok: true, favorite: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غیرمجاز" }, { status: 401 });
  }

  const { id: reportSlug } = await params;
  await prisma.reportFavorite.deleteMany({
    where: { userId: session.user.id, reportSlug },
  });

  return NextResponse.json({ ok: true, favorite: false });
}
