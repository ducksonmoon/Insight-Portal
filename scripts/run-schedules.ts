#!/usr/bin/env npx tsx
/** Cron-friendly runner for due report schedules */
import { prisma } from "../src/lib/db/prisma";
import { sendEmail, isSmtpConfigured } from "../src/lib/email/send";
import { executeReport } from "../src/lib/reports/engine";
import { buildReportExcelBuffer } from "../src/lib/reports/excel-export";
import { getReportDefinition, writeAuditLog } from "../src/lib/reports/registry";

function computeNextRun(frequency: string, runAt: string, from: Date): Date {
  const [hh, mm] = runAt.split(":").map(Number);
  const next = new Date(from);
  next.setHours(hh ?? 8, mm ?? 0, 0, 0);
  if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  else next.setDate(next.getDate() + 1);
  return next;
}

async function runSchedule(schedule: {
  id: string;
  reportSlug: string;
  userId: string;
  nameFa: string;
  frequency: string;
  runAt: string;
  format: string;
  parameters: string;
  recipients: string;
}) {
  const now = new Date();
  const parameters = JSON.parse(schedule.parameters) as Record<string, unknown>;
  const recipients = JSON.parse(schedule.recipients) as string[];

  try {
    const report = await getReportDefinition(schedule.reportSlug);
    if (!report) throw new Error(`گزارش ${schedule.reportSlug} یافت نشد`);

    const started = Date.now();
    const result = await executeReport(schedule.reportSlug, {
      parameters,
      userId: schedule.userId,
      skipAudit: true,
      maxRows: report.validation?.maxRows ?? 50000,
    });

    if (schedule.format === "excel") {
      if (!isSmtpConfigured()) {
        throw new Error("SMTP پیکربندی نشده — ارسال ایمیل ممکن نیست");
      }
      const buffer = await buildReportExcelBuffer(result);
      await sendEmail({
        to: recipients,
        subject: `گزارش زمان‌بندی‌شده: ${schedule.nameFa}`,
        text: `گزارش «${report.nameFa}» به پیوست ارسال شد.\n\nInsight Portal`,
        attachments: [
          {
            filename: `${schedule.reportSlug}.xlsx`,
            content: buffer,
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        ],
      });
    }

    const next = computeNextRun(schedule.frequency, schedule.runAt, now);

    await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: now,
        lastRunStatus: "success",
        lastRunError: null,
        nextRunAt: next,
      },
    });

    await writeAuditLog({
      userId: schedule.userId,
      action: "schedule.run",
      reportSlug: schedule.reportSlug,
      parameters,
      durationMs: Date.now() - started,
      success: true,
      message: `ارسال به ${recipients.join(", ")}`,
    });

    console.error(`[schedule] OK ${schedule.id} ${schedule.reportSlug}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطای ناشناخته";
    const next = computeNextRun(schedule.frequency, schedule.runAt, now);

    await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: now,
        lastRunStatus: "failed",
        lastRunError: message,
        nextRunAt: next,
      },
    });

    await writeAuditLog({
      userId: schedule.userId,
      action: "schedule.run",
      reportSlug: schedule.reportSlug,
      success: false,
      message,
    });

    console.error(`[schedule] FAIL ${schedule.id}: ${message}`);
  }
}

async function main() {
  const now = new Date();
  const due = await prisma.reportSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    take: 20,
  });

  for (const schedule of due) {
    await runSchedule(schedule);
  }

  console.error(`Processed ${due.length} schedule(s)`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
