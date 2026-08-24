/**
 * Manage the whitelist that keeps the scan trustworthy: a manager marks a
 * finding as reviewed-and-fine, and it stops appearing in every future scan —
 * for that exact record only, never for the whole rule.
 *
 *   npm run scan:exception -- --list
 *   npm run scan:exception -- --list --rule fin.voucher.stale_temporary
 *   npm run scan:exception -- --add --rule fin.voucher.stale_temporary --entity 42 --note "سند افتتاحیه، عمداً موقت مانده"
 *   npm run scan:exception -- --remove --rule fin.voucher.stale_temporary --entity 42
 */
import { addException, listExceptions, removeException } from "../src/lib/rules/exceptions";
import { prisma } from "../src/lib/db/prisma";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function has(flag: string): boolean {
  return process.argv.includes(`--${flag}`);
}

async function main() {
  if (has("add")) {
    const ruleId = arg("rule");
    const entity = arg("entity");
    if (!ruleId || !entity) throw new Error("--add requires --rule and --entity");

    await addException({ ruleId, entityId: entity, note: arg("note"), createdBy: arg("by") });
    console.log(`استثنا ثبت شد: ${ruleId} / ${entity}`);
    return;
  }

  if (has("remove")) {
    const ruleId = arg("rule");
    const entity = arg("entity");
    if (!ruleId || !entity) throw new Error("--remove requires --rule and --entity");

    await removeException(ruleId, entity);
    console.log(`استثنا حذف شد: ${ruleId} / ${entity}`);
    return;
  }

  const exceptions = await listExceptions(arg("rule"));
  if (exceptions.length === 0) {
    console.log("هیچ استثنایی ثبت نشده است.");
    return;
  }

  console.log(`${exceptions.length} استثنا:`);
  for (const exception of exceptions) {
    console.log(
      `  ${exception.ruleId} / ${exception.entityId}` +
        (exception.note ? ` — ${exception.note}` : "") +
        (exception.createdBy ? ` (ثبت‌شده توسط ${exception.createdBy})` : ""),
    );
  }
}

main()
  .catch((error) => {
    console.error("خطا:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
