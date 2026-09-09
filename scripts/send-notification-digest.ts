#!/usr/bin/env npx tsx
/**
 * Emails each admin a digest of their not-yet-emailed notifications (new or
 * reopened rule findings — see src/lib/notifications/service.ts) and marks
 * those rows `emailedAt`, so nothing is repeated in tomorrow's digest.
 *
 * Deliberately separate from `npm run rules:run` and its own cron entry:
 * the rule schedules decide *when* something becomes a finding, this decides
 * *when* a human gets emailed about it — usually a few minutes after the
 * morning rule run, not immediately after every individual rule.
 *
 *   npx tsx scripts/send-notification-digest.ts
 */
import { prisma } from "../src/lib/db/prisma";
import { isSmtpConfigured, sendEmail } from "../src/lib/email/send";

const SEVERITY_LABEL_FA: Record<string, string> = {
  critical: "بحرانی",
  high: "مهم",
  medium: "متوسط",
  low: "کم",
  info: "اطلاعات",
};

async function main() {
  if (!isSmtpConfigured()) {
    console.error("SMTP پیکربندی نشده — از ارسال دیجست صرف‌نظر شد.");
    return;
  }

  const pending = await prisma.notification.findMany({
    where: { emailedAt: null },
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
    include: { user: { select: { email: true, displayName: true, username: true } } },
  });

  if (!pending.length) {
    console.error("اعلان جدیدی برای ارسال وجود ندارد.");
    return;
  }

  const byUser = new Map<string, typeof pending>();
  for (const n of pending) {
    const list = byUser.get(n.userId) ?? [];
    list.push(n);
    byUser.set(n.userId, list);
  }

  let sent = 0;
  let skippedNoEmail = 0;

  for (const [userId, items] of byUser) {
    const email = items[0].user.email;
    if (!email) {
      skippedNoEmail += items.length;
      continue;
    }

    const name = items[0].user.displayName ?? items[0].user.username;
    const lines = items.map(
      (n) => `[${SEVERITY_LABEL_FA[n.severity] ?? n.severity}] ${n.title}\n${n.body}`,
    );

    try {
      await sendEmail({
        to: [email],
        subject: `Insight Portal — ${items.length} هشدار جدید`,
        text: `سلام ${name}،\n\nدر آخرین بررسی موتور قوانین موارد زیر شناسایی شد:\n\n${lines.join("\n\n")}\n\nInsight Portal`,
      });

      await prisma.notification.updateMany({
        where: { id: { in: items.map((n) => n.id) } },
        data: { emailedAt: new Date() },
      });

      sent += items.length;
      console.error(`[digest] OK ${email} — ${items.length} notification(s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "خطای ناشناخته";
      console.error(`[digest] FAIL user=${userId}: ${message}`);
    }
  }

  if (skippedNoEmail) {
    console.error(`${skippedNoEmail} اعلان به دلیل نبود ایمیل کاربر ارسال نشد (نادیده گرفته نشد — دفعهٔ بعد دوباره تلاش می‌شود).`);
  }
  console.error(`Sent ${sent} notification(s) across ${byUser.size} user(s).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
