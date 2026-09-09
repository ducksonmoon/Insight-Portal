/**
 * Notification Center — Phase 2 of
 * docs/architecture/management-intelligence-platform.md.
 *
 * Deliberately small: one function that fans a batch of events out to every
 * active admin as a Notification row, and the read/list helpers the API
 * routes and bell UI need. Sources other than the rule engine (schedule
 * failures, later phases) can call notifyAdmins() the same way — nothing
 * here is rule-specific.
 */
import { prisma } from "@/lib/db/prisma";

export type NotificationSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface CreateNotificationInput {
  severity: NotificationSeverity;
  title: string;
  body: string;
  sourceType: string;
  sourceId?: string;
  linkHref?: string;
}

/** Fans each input out to every active admin. Cheap and rare enough (rule runs, not page views) that one row per recipient is the simplest correct model. */
export async function notifyAdmins(inputs: CreateNotificationInput[]): Promise<void> {
  if (!inputs.length) return;

  const admins = await prisma.user.findMany({
    where: { isAdmin: true, isActive: true },
    select: { id: true },
  });
  if (!admins.length) return;

  await prisma.notification.createMany({
    data: admins.flatMap((admin) =>
      inputs.map((input) => ({
        userId: admin.id,
        severity: input.severity,
        title: input.title,
        body: input.body,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        linkHref: input.linkHref ?? null,
      })),
    ),
  });
}
