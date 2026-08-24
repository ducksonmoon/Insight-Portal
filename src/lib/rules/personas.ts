import { MODULE_LABEL_FA, type RuleModule } from "./types";

/**
 * A persona is a manager who gets their own morning panel.
 *
 * The engine and the rules stay shared; a persona is only a filter over modules
 * plus a delivery address. That is what makes "every manager in the company"
 * cheap: adding a persona costs one entry here, not a new product.
 *
 * `corpusRdls` records how many reports in the FBC archive touch the persona's
 * schemas. It is not decoration — it is our honest confidence signal. High count
 * means we already know the tables, the joins and the lookup codes. Zero means we
 * would be writing rules blind, and should not promise that module to a customer
 * until we have seen a real database.
 */
export interface Persona {
  id: string;
  titleFa: string;
  /** Who this actually is inside a mid-size Iranian manufacturer. */
  scopeFa: string;
  modules: RuleModule[];
  /** RDL references behind these modules — our domain-knowledge depth. */
  corpusRdls: number;
  /** Build order. 1 = shipped or next; 4 = blind, needs field work first. */
  tier: 1 | 2 | 3 | 4;
}

export const personas: Persona[] = [
  {
    id: "cfo",
    titleFa: "مدیر مالی",
    scopeFa: "دفتر کل، خزانه، چک و بانک، تنخواه، مطالبات و بدهی‌ها",
    modules: ["FIN", "RPA", "FSR"],
    corpusRdls: 890,
    tier: 1,
  },
  {
    id: "warehouse",
    titleFa: "مدیر انبار",
    scopeFa: "موجودی، رسید و حواله، بچ و سریال، مغایرت انبار با حسابداری",
    modules: ["LGS"],
    corpusRdls: 677,
    tier: 1,
  },
  {
    id: "sales",
    titleFa: "مدیر فروش",
    scopeFa: "سفارش، فاکتور، تحویل، مشتری، وصول مطالبات فروش",
    modules: ["SLS", "DSD"],
    corpusRdls: 463,
    tier: 2,
  },
  {
    id: "procurement",
    titleFa: "مدیر خرید و تدارکات",
    scopeFa: "درخواست خرید، سفارش، تأمین‌کننده، رسید خرید",
    modules: ["PRC"],
    corpusRdls: 179,
    tier: 2,
  },
  {
    id: "production",
    titleFa: "مدیر تولید",
    scopeFa: "برنامهٔ تولید، مراکز کاری، ضایعات، مصرف مواد",
    modules: ["MMG", "PAC", "MRP"],
    corpusRdls: 151,
    tier: 2,
  },
  {
    id: "maintenance",
    titleFa: "مدیر نگهداری و تعمیرات",
    scopeFa: "تجهیزات، برنامهٔ نت، قطعات یدکی، توقفات",
    modules: ["CMMS"],
    corpusRdls: 98,
    tier: 3,
  },
  {
    id: "cost",
    titleFa: "مدیر بهای تمام‌شده",
    scopeFa: "بهای تمام‌شده محصول، انحرافات، سرشکن سربار",
    modules: ["CAC"],
    corpusRdls: 96,
    tier: 3,
  },
  {
    id: "hr",
    titleFa: "مدیر سرمایه انسانی",
    scopeFa: "پرسنل، احکام، حقوق و دستمزد، مرخصی و تردد",
    modules: ["HCM"],
    corpusRdls: 294,
    tier: 3,
  },
  {
    id: "assets",
    titleFa: "مدیر دارایی‌ها",
    scopeFa: "دارایی ثابت، استهلاک، اسقاط و فروش",
    modules: ["FAM"],
    corpusRdls: 55,
    tier: 3,
  },
  {
    id: "logistics",
    titleFa: "مدیر حمل و نقل",
    scopeFa: "بارنامه، ناوگان، حمل و توزیع",
    modules: ["XLS"],
    corpusRdls: 30,
    tier: 3,
  },
  {
    id: "quality",
    titleFa: "مدیر کیفیت",
    scopeFa: "بازرسی، عدم انطباق، کالیبراسیون",
    modules: ["QCM"],
    corpusRdls: 2,
    tier: 4,
  },
  {
    id: "budget",
    titleFa: "مدیر بودجه",
    scopeFa: "بودجه در برابر عملکرد، تخصیص و انحراف",
    modules: ["BDG"],
    corpusRdls: 0,
    tier: 4,
  },
  {
    id: "contracts",
    titleFa: "مدیر قراردادها",
    scopeFa: "قرارداد، تضامین، صورت‌وضعیت",
    modules: ["FCC"],
    corpusRdls: 0,
    tier: 4,
  },
  {
    id: "foreign-trade",
    titleFa: "مدیر بازرگانی خارجی",
    scopeFa: "ثبت سفارش، اعتبار اسنادی، ترخیص",
    modules: ["IPR"],
    corpusRdls: 0,
    tier: 4,
  },
];

/**
 * The CEO is not a domain — it is a roll-up. Their panel shows only the
 * critical findings from every other persona, which is why it is built last:
 * it is worth nothing until the panels underneath it are trustworthy.
 */
export const ceoPersona: Persona = {
  id: "ceo",
  titleFa: "مدیرعامل",
  scopeFa: "تجمیع موارد بحرانی همهٔ حوزه‌ها در یک صفحه",
  modules: personas.flatMap((persona) => persona.modules),
  corpusRdls: personas.reduce((sum, persona) => sum + persona.corpusRdls, 0),
  tier: 4,
};

export function getPersona(id: string): Persona | undefined {
  return id === ceoPersona.id ? ceoPersona : personas.find((p) => p.id === id);
}

/** Human-readable scope, e.g. "انبار · فروش". */
export function personaModuleLabels(persona: Persona): string {
  return persona.modules.map((module) => MODULE_LABEL_FA[module]).join(" · ");
}
