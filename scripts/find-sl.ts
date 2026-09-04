/**
 * Look up SL (معین) codes by title — for finding the exact codes a finance
 * manager means when they say "همون حساب بستانکاران تجاری" but don't have the
 * numeric code memorized. Read-only, no writes.
 *
 *   npm run scan:find-sl -- بستانکار
 *   npm run scan:find-sl -- "دریافتنی تجاری"
 */
import { queryRahkaran } from "../src/lib/db/rahkaran";

interface SlRow extends Record<string, unknown> {
  Code: string;
  Title: string;
  Nature: number;
  IsTraceable: boolean;
}

const NATURE_FA: Record<number, string> = { 1: "مهم نیست", 2: "بدهکار", 3: "بستانکار" };

async function main() {
  const keyword = process.argv.slice(2).filter((token) => token !== "--").join(" ").trim();
  if (!keyword) {
    console.error('استفاده: npm run scan:find-sl -- "بخشی از عنوان معین"');
    process.exitCode = 1;
    return;
  }

  const escaped = keyword.replace(/'/g, "''");
  const rows = await queryRahkaran<SlRow>(`
    SELECT TOP 40 Code, Title, Nature, IsTraceable
    FROM FIN3.SL
    WHERE State = 1 AND Title LIKE N'%${escaped}%'
    ORDER BY Code`);

  if (rows.length === 0) {
    console.log(`چیزی برای «${keyword}» پیدا نشد.`);
    return;
  }

  console.log(`${rows.length} معین یافت شد:\n`);
  for (const row of rows) {
    const traceable = row.IsTraceable ? "تفصیلی‌پذیر" : "بدون تفصیلی";
    console.log(`  ${row.Code}  ${row.Title}  —  ${NATURE_FA[row.Nature] ?? row.Nature}, ${traceable}`);
  }
  console.log("\nکد(های) درست را در PAYABLES_WATCH_SL_CODES در .env.local بگذار.");
}

main()
  .catch((error) => {
    console.error("خطا:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
