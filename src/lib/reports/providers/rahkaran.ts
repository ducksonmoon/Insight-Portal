import { isRahkaranConfigured, queryRahkaran } from "@/lib/db/rahkaran";
import type { DataSourceProvider } from "@/lib/reports/datasources";

export const rahkaranProvider: DataSourceProvider = {
  key: "rahkaran",
  nameFa: "راهکاران",
  engine: "mssql",
  requiredEnvVars: [
    { key: "RAHKARAN_DB_SERVER", labelFa: "آدرس سرور SQL" },
    { key: "RAHKARAN_DB_NAME", labelFa: "نام دیتابیس" },
    { key: "RAHKARAN_DB_USER", labelFa: "نام کاربری" },
    { key: "RAHKARAN_DB_PASSWORD", labelFa: "رمز عبور" },
  ],
  isConfigured: isRahkaranConfigured,
  getPool: async () => {
    const { getRahkaranPool } = await import("@/lib/db/rahkaran");
    return getRahkaranPool();
  },
  testConnection: async () => {
    if (!isRahkaranConfigured()) {
      return { ok: false, message: "متغیرهای محیطی راهکاران تنظیم نشده‌اند" };
    }
    try {
      await queryRahkaran<{ ok: number }>("SELECT 1 AS ok");
      return { ok: true, message: "اتصال به راهکاران برقرار است" };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "خطای اتصال",
      };
    }
  },
};
