import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

import { prisma } from "@/lib/db/prisma";
import { ensureModuleBySlug, setReportPlacement } from "@/lib/reports/organization";
import { upsertReportDefinition } from "@/lib/reports/registry";
import { readRdlFile } from "@/lib/reports/rdl-storage";
import {
  parseRdlXml,
  rdlNeedsManualReview,
  rdlToReportDefinition,
  slugifyFromRdlName,
  type ParsedRdl,
} from "@/lib/reports/rdl-parser";
import { validateReportDefinition } from "@/lib/reports/validate";
import { resolveSqlText } from "@/lib/reports/sql-loader";
import {
  REPORT_PACKAGE_FORMAT,
  REPORT_PACKAGE_VERSION,
} from "@/types/report-package";
import { normalizeDefinition } from "@/types/report";

const RDL_DIR = path.join(process.cwd(), "data", "rdl");

export type RdlImportResult = {
  ok: boolean;
  filename: string;
  id?: string;
  slug?: string;
  nameFa?: string;
  error?: string;
};

export async function ensureRdlModule(moduleSlug: string): Promise<string> {
  const mod = await prisma.reportModule.findUnique({
    where: { slug: moduleSlug },
  });
  if (mod) return mod.id;

  const created = await prisma.reportModule.create({
    data: {
      slug: moduleSlug,
      nameFa: moduleSlug === "imported" ? "وارد شده از RDL" : moduleSlug,
    },
  });
  return created.id;
}

export async function saveRdlBuffer(
  buffer: Buffer,
  originalFilename: string,
): Promise<string> {
  if (!originalFilename.toLowerCase().endsWith(".rdl")) {
    throw new Error("فقط فایل .rdl مجاز است");
  }
  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error("حداکثر حجم فایل RDL: ۱۵ مگابایت");
  }

  await fs.mkdir(RDL_DIR, { recursive: true });

  const safeBase = path
    .basename(originalFilename, ".rdl")
    .replace(/[^\w\u0600-\u06FF.-]+/g, "-")
    .slice(0, 80);

  const storageName = `${Date.now()}-${randomBytes(4).toString("hex")}-${safeBase || "report"}.rdl`;
  await fs.writeFile(path.join(RDL_DIR, storageName), buffer);
  return storageName;
}

export async function importRdlFromBuffer(
  buffer: Buffer,
  originalFilename: string,
  options: {
    moduleSlug?: string;
    uploadedBy?: string;
    reimport?: boolean;
  } = {},
): Promise<RdlImportResult> {
  const filename = originalFilename;
  try {
    const moduleSlug = options.moduleSlug ?? "imported";
    const moduleId = await ensureRdlModule(moduleSlug);

    const existing = await prisma.rdlReport.findFirst({
      where: { originalFilename, moduleId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    const storageName = await saveRdlBuffer(buffer, originalFilename);
    const xml = buffer.toString("utf8");
    const parsed = parseRdlXml(xml, originalFilename);

    if (existing && !options.reimport) {
      await prisma.rdlReport.update({
        where: { id: existing.id },
        data: {
          storageName,
          parsedMeta: JSON.stringify(parsed),
          convertStatus: "uploaded",
          convertError: null,
        },
      });
      return {
        ok: true,
        filename,
        id: existing.id,
        slug: existing.slug,
        nameFa: existing.nameFa,
      };
    }

    let slug = slugifyFromRdlName(parsed.name);
    const slugTaken = await prisma.rdlReport.findUnique({ where: { slug } });
    if (slugTaken) slug = `${slug}-${Date.now().toString(36)}`;

    const row = await prisma.rdlReport.create({
      data: {
        slug,
        nameFa: parsed.name,
        originalFilename,
        storageName,
        parsedMeta: JSON.stringify(parsed),
        moduleId,
        uploadedBy: options.uploadedBy,
        convertStatus: "uploaded",
      },
    });

    return {
      ok: true,
      filename,
      id: row.id,
      slug: row.slug,
      nameFa: row.nameFa,
    };
  } catch (err) {
    return {
      ok: false,
      filename,
      error: err instanceof Error ? err.message : "خطا",
    };
  }
}

export async function importRdlFromFile(
  file: File,
  options: { moduleSlug?: string; uploadedBy?: string } = {},
): Promise<RdlImportResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return importRdlFromBuffer(buffer, file.name, options);
}

export type RdlConvertResult = {
  ok: boolean;
  id: string;
  slug?: string;
  reportSlug?: string;
  error?: string;
};

export async function convertRdlReport(
  rdlIdOrSlug: string,
  options: {
    moduleId?: string;
    slug?: string;
    nameFa?: string;
    publish?: boolean;
    userId?: string;
  } = {},
): Promise<RdlConvertResult> {
  const row = await prisma.rdlReport.findFirst({
    where: { OR: [{ id: rdlIdOrSlug }, { slug: rdlIdOrSlug }], isActive: true },
  });
  if (!row) {
    return { ok: false, id: rdlIdOrSlug, error: "گزارش RDL یافت نشد" };
  }

  try {
    const { importReportPackage } = await import("@/lib/reports/import-package");

    const moduleSlug =
      options.moduleId ??
      (row.moduleId
        ? (
            await prisma.reportModule.findUnique({
              where: { id: row.moduleId },
              select: { slug: true },
            })
          )?.slug
        : null) ??
      "imported";

    const parsed: ParsedRdl = JSON.parse(row.parsedMeta);
    const xml = await readRdlFile(row.storageName);
    const fresh = parseRdlXml(xml, row.originalFilename);

    const reportSlug =
      options.slug ?? slugifyFromRdlName(parsed.name);

    const defInput = rdlToReportDefinition(fresh, {
      slug: reportSlug,
      moduleId: moduleSlug,
      nameFa: options.nameFa ?? row.nameFa,
    });

    const definition = normalizeDefinition(defInput);
    const sqlText = resolveSqlText(definition);
    const validation = validateReportDefinition(definition, sqlText);
    const needsReview = rdlNeedsManualReview(fresh) || !validation.ok;

    if (!validation.ok && options.publish !== false) {
      // still import but mark for review
    }

    const result = await importReportPackage(
      {
        format: REPORT_PACKAGE_FORMAT,
        formatVersion: REPORT_PACKAGE_VERSION,
        exportedAt: new Date().toISOString(),
        exportNote: `converted from RDL ${row.originalFilename}`,
        report: {
          definition,
          sqlText,
          placement: { moduleId: moduleSlug, folderId: null },
        },
      },
      {
        userId: options.userId,
        conflict: "rename",
        moduleId: moduleSlug,
        publish: options.publish !== false,
        sourceType: "rdl",
        sourceRef: row.id,
      },
    );

    if (result.slug) {
      const reportRow = await prisma.report.findUnique({
        where: { slug: result.slug },
        select: { id: true },
      });
      await prisma.rdlReport.update({
        where: { id: row.id },
        data: {
          convertedReportSlug: result.slug,
          convertedReportId: reportRow?.id ?? null,
          convertStatus: needsReview ? "needs_review" : "converted",
          convertError: validation.ok
            ? null
            : validation.issues?.map((i) => i.message).join("; ") ?? null,
        },
      });
    }

    return {
      ok: true,
      id: row.id,
      slug: row.slug,
      reportSlug: result.slug,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا در تبدیل";
    await prisma.rdlReport.update({
      where: { id: row.id },
      data: { convertStatus: "failed", convertError: message },
    });
    return { ok: false, id: row.id, slug: row.slug, error: message };
  }
}
