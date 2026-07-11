"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type {
  OrgFolderNode,
  OrgModuleNode,
  OrgReportItem,
} from "@/lib/reports/organization";

type ModuleMeta = {
  id: string;
  dbId: string | null;
  nameFa: string;
  description?: string | null;
  sortOrder: number;
};

function flattenFolders(
  nodes: OrgFolderNode[],
  depth = 0,
): Array<{ node: OrgFolderNode; depth: number }> {
  const out: Array<{ node: OrgFolderNode; depth: number }> = [];
  for (const node of nodes) {
    out.push({ node, depth });
    out.push(...flattenFolders(node.children, depth + 1));
  }
  return out;
}

function ReportRow({
  report,
  modules,
  folders,
  onMoved,
}: {
  report: OrgReportItem;
  modules: ModuleMeta[];
  folders: Array<{ id: string; label: string }>;
  onMoved: () => void;
}) {
  const { toast } = useToast();
  const [moduleId, setModuleId] = useState(report.moduleId);
  const [folderId, setFolderId] = useState(report.folderId ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}/placement`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId,
          folderId: folderId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      toast("جایگاه گزارش ذخیره شد", "success");
      onMoved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="action-row flex-wrap gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[var(--foreground)]">{report.nameFa}</p>
        <p className="text-xs text-[var(--muted)]">
          <code>{report.id}</code>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-sm"
          value={moduleId}
          onChange={(e) => {
            setModuleId(e.target.value);
            setFolderId("");
          }}
        >
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nameFa}
            </option>
          ))}
        </select>
        <select
          className="h-9 max-w-[180px] rounded-lg border border-[var(--border)] bg-white px-2 text-sm"
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
        >
          <option value="">بدون پوشه</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "انتقال"}
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/admin/reports/${report.id}/edit`}>
            <Pencil className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function FolderBlock({
  folder,
  depth,
  moduleId,
  onChanged,
}: {
  folder: OrgFolderNode;
  depth: number;
  moduleId: string;
  onChanged: () => void;
}) {
  const { toast, confirm } = useToast();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.nameFa);
  const [busy, setBusy] = useState(false);

  async function saveName() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/folders/${folder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameFa: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setEditing(false);
      toast("نام پوشه ذخیره شد", "success");
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeFolder() {
    const ok = await confirm(
      "حذف پوشه",
      `پوشه «${folder.nameFa}» حذف شود؟ گزارش‌ها به سطح بالاتر منتقل می‌شوند.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/folders/${folder.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      toast("پوشه حذف شد", "success");
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginRight: depth * 16 }}>
      <div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--surface-muted)] px-3 py-2">
        <button
          type="button"
          className="text-[var(--muted)]"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        {editing ? (
          <>
            <input
              className="h-8 flex-1 rounded-lg border border-[var(--border)] px-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button size="sm" disabled={busy} onClick={saveName}>
              ذخیره
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              انصراف
            </Button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm font-semibold">{folder.nameFa}</span>
            <span className="text-xs text-[var(--muted)]">
              {folder.reports.length} گزارش
            </span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={removeFolder}>
              <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
            </Button>
          </>
        )}
      </div>
      {open ? (
        <div className="mb-4 space-y-1 border-r-2 border-[var(--border)] pr-2">
          {folder.reports.map((r) => (
            <p key={r.id} className="px-2 py-1 text-sm text-[var(--muted)]">
              · {r.nameFa}
            </p>
          ))}
          {folder.children.map((child) => (
            <FolderBlock
              key={child.id}
              folder={child}
              depth={depth + 1}
              moduleId={moduleId}
              onChanged={onChanged}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ModulesManager() {
  const { toast, confirm } = useToast();
  const [modules, setModules] = useState<ModuleMeta[]>([]);
  const [organization, setOrganization] = useState<OrgModuleNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newModuleName, setNewModuleName] = useState("");
  const [newModuleSlug, setNewModuleSlug] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState("");
  const [creatingModule, setCreatingModule] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/modules");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "بارگذاری ناموفق");
      setModules(data.modules ?? []);
      setOrganization(data.organization ?? []);
      setSelectedId((prev) => prev ?? data.modules?.[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = organization.find((m) => m.id === selectedId) ?? null;
  const flatFolders = selected
    ? flattenFolders(selected.folders).map(({ node, depth }) => ({
        id: node.id,
        label: `${"—".repeat(depth)} ${node.nameFa}`.trim(),
      }))
    : [];

  const allReports: OrgReportItem[] = selected
    ? [
        ...selected.reports,
        ...flattenFolders(selected.folders).flatMap(({ node }) => node.reports),
      ]
    : [];

  async function createModule() {
    if (!newModuleName.trim()) return;
    setCreatingModule(true);
    try {
      const res = await fetch("/api/admin/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameFa: newModuleName.trim(),
          slug: newModuleSlug.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setNewModuleName("");
      setNewModuleSlug("");
      setSelectedId(data.module.id);
      toast("ماژول ایجاد شد", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setCreatingModule(false);
    }
  }

  async function createFolder() {
    if (!selected || !newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await fetch("/api/admin/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId: selected.id,
          nameFa: newFolderName.trim(),
          parentFolderId: newFolderParent || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setNewFolderName("");
      setNewFolderParent("");
      toast("پوشه ایجاد شد", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function deleteModule(moduleId: string) {
    const ok = await confirm("غیرفعال‌سازی ماژول", "این ماژول غیرفعال شود؟");
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/modules/${moduleId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setSelectedId(null);
      toast("ماژول غیرفعال شد", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        در حال بارگذاری...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
        {error}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div>
          <h2 className="text-sm font-bold text-[var(--foreground)]">ماژول‌ها</h2>
          <p className="text-xs text-[var(--muted)]">دسته اصلی گزارش‌ها</p>
        </div>

        <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
          {modules.map((m) => {
            const org = organization.find((o) => o.id === m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`action-row w-full text-right ${
                  selectedId === m.id ? "bg-[var(--primary-soft)]" : ""
                }`}
                onClick={() => setSelectedId(m.id)}
              >
                <div>
                  <p className="font-semibold">{m.nameFa}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {org?.reportCount ?? 0} گزارش · <code>{m.id}</code>
                  </p>
                </div>
              </button>
            );
          })}
          {!modules.length ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
              هنوز ماژولی نیست
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-xs font-semibold text-[var(--foreground)]">ماژول جدید</p>
          <input
            className="h-9 w-full rounded-lg border border-[var(--border)] px-2 text-sm"
            placeholder="نام فارسی"
            value={newModuleName}
            onChange={(e) => setNewModuleName(e.target.value)}
          />
          <input
            className="h-9 w-full rounded-lg border border-[var(--border)] px-2 text-sm"
            placeholder="شناسه انگلیسی (اختیاری)"
            dir="ltr"
            value={newModuleSlug}
            onChange={(e) => setNewModuleSlug(e.target.value)}
          />
          <Button
            className="w-full"
            size="sm"
            disabled={creatingModule}
            onClick={createModule}
          >
            {creatingModule ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            افزودن ماژول
          </Button>
        </div>
      </aside>

      <section className="space-y-6">
        {selected ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{selected.nameFa}</h2>
                <p className="text-sm text-[var(--muted)]">
                  شناسه: <code>{selected.id}</code>
                  {selected.description ? ` · ${selected.description}` : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-[var(--danger)]"
                onClick={() => deleteModule(selected.id)}
              >
                <Trash2 className="h-4 w-4" />
                حذف ماژول
              </Button>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <FolderPlus className="h-4 w-4 text-[var(--primary)]" />
                <h3 className="font-semibold">پوشه‌ها</h3>
              </div>

              <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  className="h-9 rounded-lg border border-[var(--border)] px-2 text-sm"
                  placeholder="نام پوشه جدید"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                />
                <select
                  className="h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-sm"
                  value={newFolderParent}
                  onChange={(e) => setNewFolderParent(e.target.value)}
                >
                  <option value="">ریشه ماژول</option>
                  {flatFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <Button size="sm" disabled={creatingFolder} onClick={createFolder}>
                  {creatingFolder ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "افزودن پوشه"
                  )}
                </Button>
              </div>

              {selected.folders.length ? (
                selected.folders.map((folder) => (
                  <FolderBlock
                    key={folder.id}
                    folder={folder}
                    depth={0}
                    moduleId={selected.id}
                    onChanged={load}
                  />
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">هنوز پوشه‌ای ساخته نشده</p>
              )}
            </div>

            <div>
              <h3 className="mb-2 font-semibold">مدیریت محل گزارش‌ها</h3>
              <p className="mb-3 text-sm text-[var(--muted)]">
                ماژول و پوشه هر گزارش را انتخاب کنید و «انتقال» را بزنید
              </p>
              <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
                {allReports.length ? (
                  allReports.map((report) => (
                    <ReportRow
                      key={report.id}
                      report={report}
                      modules={modules}
                      folders={
                        selected.id === report.moduleId
                          ? flatFolders
                          : organization
                              .find((m) => m.id === report.moduleId)
                              ? flattenFolders(
                                  organization.find((m) => m.id === report.moduleId)!
                                    .folders,
                                ).map(({ node, depth }) => ({
                                  id: node.id,
                                  label: `${"—".repeat(depth)} ${node.nameFa}`.trim(),
                                }))
                              : []
                      }
                      onMoved={load}
                    />
                  ))
                ) : (
                  <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                    گزارشی در این ماژول نیست. از{" "}
                    <Link href="/admin/reports" className="text-[var(--primary)]">
                      استودیو گزارش
                    </Link>{" "}
                    بسازید.
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">یک ماژول انتخاب کنید یا بسازید</p>
        )}
      </section>
    </div>
  );
}
