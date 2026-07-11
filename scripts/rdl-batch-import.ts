#!/usr/bin/env npx tsx
/**
 * Bulk import RDL files from a directory into Insight Portal.
 *
 * Usage:
 *   npm run rdl:import -- --dir "C:/path/to/RDL" --module financial [--convert] [--limit 100] [--recursive] [--resume] [--concurrency 5]
 */
import fs from "fs";
import path from "path";

import { prisma } from "../src/lib/db/prisma";
import { mapPool } from "../src/lib/concurrency";
import {
  convertRdlReport,
  importRdlFromBuffer,
  type RdlImportResult,
} from "../src/lib/reports/rdl-import";

type CsvRow = {
  file: string;
  status: string;
  slug: string;
  error: string;
};

function arg(name: string, fallback?: string) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function walkRdlFiles(dir: string, recursive: boolean): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...walkRdlFiles(full, recursive));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".rdl")) {
      out.push(full);
    }
  }
  return out.sort();
}

function toCsv(rows: CsvRow[]) {
  const header = "file,status,slug,error";
  const lines = rows.map((r) =>
    [r.file, r.status, r.slug, r.error]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...lines].join("\n");
}

async function processFile(
  filePath: string,
  absDir: string,
  moduleSlug: string,
  doConvert: boolean,
  resume: boolean,
): Promise<CsvRow> {
  const rel = path.relative(absDir, filePath);
  const basename = path.basename(filePath);

  try {
    if (resume) {
      const mod = await prisma.reportModule.findUnique({
        where: { slug: moduleSlug },
      });
      if (mod) {
        const existing = await prisma.rdlReport.findFirst({
          where: {
            originalFilename: basename,
            moduleId: mod.id,
            isActive: true,
            convertStatus: doConvert ? { in: ["converted", "needs_review"] } : "uploaded",
          },
        });
        if (existing) {
          return {
            file: rel,
            status: doConvert ? "skipped_converted" : "skipped_uploaded",
            slug: existing.convertedReportSlug ?? existing.slug,
            error: "",
          };
        }
      }
    }

    const buffer = fs.readFileSync(filePath);
    const importResult: RdlImportResult = await importRdlFromBuffer(
      buffer,
      basename,
      { moduleSlug, reimport: false },
    );

    if (!importResult.ok || !importResult.id) {
      return {
        file: rel,
        status: "import_failed",
        slug: "",
        error: importResult.error ?? "unknown",
      };
    }

    if (!doConvert) {
      return {
        file: rel,
        status: "uploaded",
        slug: importResult.slug ?? "",
        error: "",
      };
    }

    const convertResult = await convertRdlReport(importResult.id, {
      moduleId: moduleSlug,
      publish: true,
    });

    return {
      file: rel,
      status: convertResult.ok ? "converted" : "convert_failed",
      slug: convertResult.reportSlug ?? importResult.slug ?? "",
      error: convertResult.error ?? "",
    };
  } catch (err) {
    return {
      file: rel,
      status: "error",
      slug: "",
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

async function main() {
  const dir = arg("dir");
  const moduleSlug = arg("module", "imported") ?? "imported";
  const limitRaw = arg("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const recursive = hasFlag("recursive");
  const doConvert = hasFlag("convert");
  const resume = hasFlag("resume");
  const concurrency = Math.max(1, Number(arg("concurrency", "3")));

  if (!dir) {
    console.error(
      'Usage: npm run rdl:import -- --dir "C:/path/to/RDL" --module financial [--convert] [--limit 100] [--recursive] [--resume] [--concurrency 5]',
    );
    process.exit(1);
  }

  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) {
    console.error(`Directory not found: ${absDir}`);
    process.exit(1);
  }

  let files = walkRdlFiles(absDir, recursive);
  if (limit && limit > 0) files = files.slice(0, limit);

  console.error(
    `Found ${files.length} RDL file(s) in ${absDir} (concurrency=${concurrency}, resume=${resume})`,
  );

  const csvRows = await mapPool(files, concurrency, (filePath) =>
    processFile(filePath, absDir, moduleSlug, doConvert, resume),
  );

  const uploaded = csvRows.filter((r) => r.status === "uploaded").length;
  const converted = csvRows.filter((r) => r.status === "converted").length;
  const skipped = csvRows.filter((r) => r.status.startsWith("skipped")).length;
  const failed = csvRows.length - uploaded - converted - skipped;

  console.error(
    `Done: ${uploaded} uploaded, ${converted} converted, ${skipped} skipped, ${failed} failed`,
  );
  console.log(toCsv(csvRows));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
