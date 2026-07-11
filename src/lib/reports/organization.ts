import { prisma } from "@/lib/db/prisma";
import { reportModules as staticModules } from "@/types/report";

export type OrgReportItem = {
  id: string;
  nameFa: string;
  moduleId: string;
  folderId: string | null;
  parameterCount: number;
  columnCount: number;
  sourceType?: string;
  sourceRef?: string | null;
};

export type OrgFolderNode = {
  id: string;
  nameFa: string;
  parentId: string | null;
  sortOrder: number;
  reports: OrgReportItem[];
  children: OrgFolderNode[];
};

export type OrgModuleNode = {
  id: string;
  dbId: string;
  nameFa: string;
  description?: string;
  sortOrder: number;
  reportCount: number;
  folders: OrgFolderNode[];
  reports: OrgReportItem[];
};

function countParamsAndColumns(definition: string | null): {
  parameterCount: number;
  columnCount: number;
} {
  if (!definition) return { parameterCount: 0, columnCount: 0 };
  try {
    const parsed = JSON.parse(definition) as {
      parameters?: unknown[];
      columns?: unknown[];
      datasets?: Array<{ columns?: unknown[] }>;
    };
    const parameterCount = parsed.parameters?.length ?? 0;
    let columnCount = parsed.columns?.length ?? 0;
    if (!columnCount && parsed.datasets?.length) {
      columnCount = parsed.datasets[0]?.columns?.length ?? 0;
    }
    return { parameterCount, columnCount };
  } catch {
    return { parameterCount: 0, columnCount: 0 };
  }
}

function buildFolderTree(
  folders: Array<{
    id: string;
    nameFa: string;
    parentFolderId: string | null;
    sortOrder: number;
  }>,
  reportsByFolder: Map<string, OrgReportItem[]>,
): OrgFolderNode[] {
  const nodes = new Map<string, OrgFolderNode>();
  for (const f of folders) {
    nodes.set(f.id, {
      id: f.id,
      nameFa: f.nameFa,
      parentId: f.parentFolderId,
      sortOrder: f.sortOrder,
      reports: reportsByFolder.get(f.id) ?? [],
      children: [],
    });
  }

  const roots: OrgFolderNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: OrgFolderNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.nameFa.localeCompare(b.nameFa, "fa"));
    for (const n of list) sortNodes(n.children);
  };
  sortNodes(roots);
  return roots;
}

export async function listModulesFromDb() {
  try {
    const rows = await prisma.reportModule.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameFa: "asc" }],
    });
    if (rows.length) return rows;
  } catch {
    /* fallback */
  }

  return staticModules.map((m, index) => ({
    id: `static-${m.id}`,
    slug: m.id,
    nameFa: m.nameFa,
    description: m.description ?? null,
    sortOrder: index,
    isActive: true,
    createdAt: new Date(),
  }));
}

export async function loadReportOrganization(): Promise<OrgModuleNode[]> {
  const modules = await listModulesFromDb();

  let dbReports: Array<{
    slug: string;
    nameFa: string;
    definition: string | null;
    folderId: string | null;
    sourceType: string;
    sourceRef: string | null;
    module: { slug: string; id: string };
  }> = [];

  let dbFolders: Array<{
    id: string;
    nameFa: string;
    parentFolderId: string | null;
    sortOrder: number;
    moduleId: string;
  }> = [];

  try {
    dbReports = await prisma.report.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameFa: "asc" }],
      select: {
        slug: true,
        nameFa: true,
        definition: true,
        folderId: true,
        sourceType: true,
        sourceRef: true,
        module: { select: { slug: true, id: true } },
      },
    });

    dbFolders = await prisma.reportFolder.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { nameFa: "asc" }],
      select: {
        id: true,
        nameFa: true,
        parentFolderId: true,
        sortOrder: true,
        moduleId: true,
      },
    });
  } catch {
    /* code fallback handled below */
  }

  const moduleDbIdBySlug = new Map(
    modules.map((m) => [m.slug, m.id.startsWith("static-") ? null : m.id]),
  );

  const reportsByModuleSlug = new Map<string, OrgReportItem[]>();
  const reportsByFolder = new Map<string, OrgReportItem[]>();

  for (const row of dbReports) {
    const counts = countParamsAndColumns(row.definition);
    const item: OrgReportItem = {
      id: row.slug,
      nameFa: row.nameFa,
      moduleId: row.module.slug,
      folderId: row.folderId,
      sourceType: row.sourceType,
      sourceRef: row.sourceRef,
      ...counts,
    };

    if (row.folderId) {
      const list = reportsByFolder.get(row.folderId) ?? [];
      list.push(item);
      reportsByFolder.set(row.folderId, list);
    } else {
      const list = reportsByModuleSlug.get(row.module.slug) ?? [];
      list.push(item);
      reportsByModuleSlug.set(row.module.slug, list);
    }
  }

  const foldersByModuleDbId = new Map<string, typeof dbFolders>();
  for (const folder of dbFolders) {
    const list = foldersByModuleDbId.get(folder.moduleId) ?? [];
    list.push(folder);
    foldersByModuleDbId.set(folder.moduleId, list);
  }

  return modules.map((mod) => {
    const dbId = mod.id.startsWith("static-") ? mod.slug : mod.id;
    const moduleDbId = moduleDbIdBySlug.get(mod.slug) ?? mod.id;
    const moduleFolders =
      typeof moduleDbId === "string" && !moduleDbId.startsWith("static-")
        ? foldersByModuleDbId.get(moduleDbId) ?? []
        : [];

    const rootReports = reportsByModuleSlug.get(mod.slug) ?? [];
    const folderTree = buildFolderTree(moduleFolders, reportsByFolder);

    const countInFolders = (nodes: OrgFolderNode[]): number =>
      nodes.reduce(
        (sum, n) => sum + n.reports.length + countInFolders(n.children),
        0,
      );

    return {
      id: mod.slug,
      dbId,
      nameFa: mod.nameFa,
      description: mod.description ?? undefined,
      sortOrder: mod.sortOrder,
      reportCount: rootReports.length + countInFolders(folderTree),
      folders: folderTree,
      reports: rootReports,
    };
  });
}

export function slugifyLatin(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `item-${Date.now()}`;
}

export async function ensureModuleBySlug(slug: string, nameFa?: string) {
  return prisma.reportModule.upsert({
    where: { slug },
    create: {
      slug,
      nameFa: nameFa ?? slug,
    },
    update: {},
  });
}

export async function setReportPlacement(
  reportSlug: string,
  moduleSlug: string,
  folderId: string | null,
) {
  const mod = await prisma.reportModule.findUnique({ where: { slug: moduleSlug } });
  if (!mod) throw new Error("ماژول یافت نشد");

  if (folderId) {
    const folder = await prisma.reportFolder.findFirst({
      where: { id: folderId, moduleId: mod.id, isActive: true },
    });
    if (!folder) throw new Error("پوشه یافت نشد یا به این ماژول تعلق ندارد");
  }

  return prisma.report.update({
    where: { slug: reportSlug },
    data: {
      moduleId: mod.id,
      folderId,
    },
  });
}
