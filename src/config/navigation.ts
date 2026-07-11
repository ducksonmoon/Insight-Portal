import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  Paintbrush,
  Settings2,
  Shield,
  FileCode2,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  description?: string;
  group?: "main" | "reports" | "admin" | "account";
};

export const mainNavigation: NavItem[] = [
  {
    title: "داشبورد",
    href: "/",
    icon: LayoutDashboard,
    description: "خلاصه وضعیت",
    group: "main",
  },
  {
    title: "گزارش‌ها",
    href: "/reports",
    icon: BarChart3,
    description: "اجرا و خروجی",
    group: "main",
  },
  {
    title: "استودیو گزارش",
    href: "/admin/reports",
    icon: Settings2,
    adminOnly: true,
    description: "ساخت و ویرایش",
    group: "reports",
  },
  {
    title: "مهاجرت RDL",
    href: "/admin/rdl",
    icon: FileCode2,
    adminOnly: true,
    description: "بارگذاری و تبدیل",
    group: "reports",
  },
  {
    title: "زمان‌بندی",
    href: "/admin/schedules",
    icon: CalendarClock,
    adminOnly: true,
    description: "اجرای خودکار",
    group: "reports",
  },
  {
    title: "ماژول‌ها",
    href: "/modules",
    icon: FolderKanban,
    adminOnly: true,
    description: "ساختار و دسته‌بندی",
    group: "admin",
  },
  {
    title: "دسترسی‌ها",
    href: "/access",
    icon: Shield,
    adminOnly: true,
    description: "کاربران، نقش‌ها، مجوزها",
    group: "admin",
  },
  {
    title: "گزارش ممیزی",
    href: "/admin/audit",
    icon: ClipboardList,
    adminOnly: true,
    description: "اجرای گزارش‌ها",
    group: "admin",
  },
  {
    title: "تنظیمات برند",
    href: "/settings",
    icon: Paintbrush,
    adminOnly: true,
    description: "نام، لوگو، رنگ",
    group: "admin",
  },
  {
    title: "پروفایل",
    href: "/profile",
    icon: UserCircle,
    description: "زبان و رمز عبور",
    group: "account",
  },
];

export const navGroupLabels: Record<string, string> = {
  main: "منوی اصلی",
  reports: "گزارش و مهاجرت",
  admin: "مدیریت",
  account: "حساب کاربری",
};
