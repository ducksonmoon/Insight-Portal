import type { DataSourceProvider } from "@/lib/reports/datasources";

function isAttendanceConfigured(): boolean {
  return Boolean(
    process.env.ATTENDANCE_DB_SERVER &&
      process.env.ATTENDANCE_DB_NAME &&
      process.env.ATTENDANCE_DB_USER &&
      process.env.ATTENDANCE_DB_PASSWORD,
  );
}

export const attendanceProvider: DataSourceProvider = {
  key: "attendance",
  nameFa: "حضور و غیاب",
  engine: "mssql",
  requiredEnvVars: [
    { key: "ATTENDANCE_DB_SERVER", labelFa: "آدرس سرور SQL" },
    { key: "ATTENDANCE_DB_NAME", labelFa: "نام دیتابیس" },
    { key: "ATTENDANCE_DB_USER", labelFa: "نام کاربری" },
    { key: "ATTENDANCE_DB_PASSWORD", labelFa: "رمز عبور" },
  ],
  isConfigured: isAttendanceConfigured,
  getPool: async () => {
    throw new Error(
      "اتصال حضور و غیاب هنوز پیاده‌سازی نشده — provider را در providers/attendance.ts تکمیل کنید.",
    );
  },
  testConnection: async () => {
    if (!isAttendanceConfigured()) {
      return {
        ok: false,
        message: "متغیرهای محیطی حضور و غیاب تنظیم نشده‌اند",
      };
    }
    return {
      ok: false,
      message: "پیکربندی یافت شد اما اتصال هنوز فعال نشده است",
    };
  },
};
