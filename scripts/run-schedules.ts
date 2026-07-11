#!/usr/bin/env npx tsx
/** Cron-friendly runner for due report schedules */
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const now = new Date();
  const due = await prisma.reportSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    take: 20,
  });

  for (const schedule of due) {
    console.error(`[schedule] ${schedule.id} ${schedule.reportSlug} (${schedule.format})`);
    const next = new Date(now);
    if (schedule.frequency === "weekly") next.setDate(next.getDate() + 7);
    else if (schedule.frequency === "monthly") next.setMonth(next.getMonth() + 1);
    else next.setDate(next.getDate() + 1);

    await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: now, nextRunAt: next },
    });
  }

  console.error(`Processed ${due.length} schedule(s)`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
