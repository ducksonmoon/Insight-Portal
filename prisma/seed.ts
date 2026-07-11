import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import {
  DEFAULT_LOOKUP_CATALOGS,
  reportDefinitions,
} from "../src/lib/reports/definitions";
import { reportModules } from "../src/types/report";

const prisma = new PrismaClient();

async function main() {
  await prisma.dataSource.upsert({
    where: { slug: "rahkaran" },
    create: {
      slug: "rahkaran",
      nameFa: "دیتابیس راهکاران",
      type: "sqlserver",
      providerKey: "rahkaran",
      isActive: true,
    },
    update: {
      nameFa: "دیتابیس راهکاران",
      providerKey: "rahkaran",
      isActive: true,
    },
  });

  for (const catalog of DEFAULT_LOOKUP_CATALOGS) {
    await prisma.lookupCatalog.upsert({
      where: { slug: catalog.slug },
      create: {
        slug: catalog.slug,
        nameFa: catalog.nameFa,
        description: catalog.description,
        lookupSql: catalog.lookupSql,
        dataSourceKey: catalog.dataSourceKey,
        isActive: true,
      },
      update: {
        nameFa: catalog.nameFa,
        description: catalog.description,
        lookupSql: catalog.lookupSql,
        dataSourceKey: catalog.dataSourceKey,
        isActive: true,
      },
    });
  }

  for (const [index, module] of reportModules.entries()) {
    await prisma.reportModule.upsert({
      where: { slug: module.id },
      create: {
        slug: module.id,
        nameFa: module.nameFa,
        description: module.description,
        sortOrder: index,
      },
      update: {
        nameFa: module.nameFa,
        description: module.description,
        sortOrder: index,
      },
    });
  }

  const rahkaran = await prisma.dataSource.findUniqueOrThrow({
    where: { slug: "rahkaran" },
  });

  for (const [index, report] of reportDefinitions.entries()) {
    const module = await prisma.reportModule.findUniqueOrThrow({
      where: { slug: report.moduleId },
    });

    const definitionJson = JSON.stringify(report);

    const saved = await prisma.report.upsert({
      where: { slug: report.id },
      create: {
        slug: report.id,
        nameFa: report.nameFa,
        moduleId: module.id,
        dataSourceId: rahkaran.id,
        sqlFile: report.sqlFile ?? report.sqlSource.path,
        definition: definitionJson,
        publishedVersion: 1,
        sortOrder: index,
      },
      update: {
        nameFa: report.nameFa,
        moduleId: module.id,
        dataSourceId: rahkaran.id,
        sqlFile: report.sqlFile ?? report.sqlSource.path,
        definition: definitionJson,
        sortOrder: index,
      },
    });

    await prisma.reportVersion.upsert({
      where: {
        reportId_version: { reportId: saved.id, version: 1 },
      },
      create: {
        reportId: saved.id,
        version: 1,
        definition: definitionJson,
        note: "seed",
      },
      update: {
        definition: definitionJson,
      },
    });
  }

  const adminUser = process.env.SEED_ADMIN_USER ?? "admin";
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  const hash = await bcrypt.hash(adminPass, 10);

  await prisma.user.upsert({
    where: { username: adminUser },
    create: {
      username: adminUser,
      displayName: "مدیر سیستم",
      passwordHash: hash,
      isAdmin: true,
      isActive: true,
    },
    update: {
      passwordHash: hash,
      isAdmin: true,
      isActive: true,
    },
  });

  console.log(`Seeded datasources, catalogs, modules, reports, admin=${adminUser}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
