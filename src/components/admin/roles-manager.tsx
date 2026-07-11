"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Shield, Trash2 } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

type RoleRow = {
  id: string;
  slug: string;
  nameFa: string;
  _count: { users: number; moduleAccess: number; reportAccess: number };
};

type ModuleRow = { id: string; nameFa: string };
type ReportRow = { id: string; nameFa: string; slug: string };

export function RolesManager({ embedded = false }: { embedded?: boolean }) {
  const { toast, confirm } = useToast();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState("");
  const [nameFa, setNameFa] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [grantRoleId, setGrantRoleId] = useState("");
  const [grantModuleIds, setGrantModuleIds] = useState<string[]>([]);
  const [grantReportIds, setGrantReportIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, accessRes] = await Promise.all([
        fetch("/api/admin/roles"),
        fetch("/api/admin/access"),
      ]);
      const rolesData = await rolesRes.json();
      const accessData = await accessRes.json();
      if (!rolesRes.ok) throw new Error(rolesData.error ?? "خطا");
      const nextRoles: RoleRow[] = rolesData.roles ?? [];
      setRoles(nextRoles);
      setModules(accessData.modules ?? []);
      setReports(accessData.reports ?? []);
      setGrantRoleId((prev) => prev || nextRoles[0]?.id || "");
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRole() {
    if (!slug.trim() || !nameFa.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slug.trim(), nameFa: nameFa.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setSlug("");
      setNameFa("");
      toast("نقش ایجاد شد", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    try {
      const res = await fetch(`/api/admin/roles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameFa: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setEditingId(null);
      toast("نقش به‌روز شد", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    }
  }

  async function removeRole(id: string) {
    const ok = await confirm("حذف نقش", "این نقش حذف شود؟");
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/roles/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      toast("نقش حذف شد", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    }
  }

  async function applyBulkGrant() {
    if (!grantRoleId) return;
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulkGrant: true,
          roleId: grantRoleId,
          moduleIds: grantModuleIds,
          reportIds: grantReportIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      toast("دسترسی نقش ذخیره شد", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    }
  }

  const body = (
    <div className="space-y-6">
      {!embedded ? (
        <PageHeader
          title="نقش‌ها و دسترسی گروهی"
          subtitle="نقش بسازید و از صفحه دسترسی‌ها به کاربران اختصاص دهید."
          breadcrumbs={[
            { label: "دسترسی‌ها", href: "/access" },
            { label: "نقش‌ها" },
          ]}
        />
      ) : null}

      <section className="surface-panel">
        <div className="surface-panel-header">
          <p className="section-title">نقش جدید</p>
        </div>
        <div className="surface-panel-body flex flex-wrap gap-2">
          <Input
            className="min-w-[140px] max-w-[180px]"
            placeholder="شناسه (slug)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <Input
            className="min-w-[200px] max-w-xs"
            placeholder="نام فارسی"
            value={nameFa}
            onChange={(e) => setNameFa(e.target.value)}
          />
          <Button onClick={() => void createRole()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            ایجاد
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        </div>
      ) : roles.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <div
              key={role.id}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Shield className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                  {editingId === role.id ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8"
                    />
                  ) : (
                    <span className="font-bold">{role.nameFa}</span>
                  )}
                </div>
                <div className="flex gap-1">
                  {editingId === role.id ? (
                    <Button size="sm" onClick={() => void saveEdit(role.id)}>
                      ذخیره
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(role.id);
                        setEditName(role.nameFa);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--danger)]"
                    onClick={() => void removeRole(role.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">{role.slug}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="badge badge-primary">{role._count.users} کاربر</span>
                <span className="badge">{role._count.moduleAccess} ماژول</span>
                <span className="badge">{role._count.reportAccess} گزارش</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="نقشی تعریف نشده"
          description="یک نقش بسازید و سپس در تب کاربران به افراد اختصاص دهید."
        />
      )}

      {roles.length ? (
        <section className="surface-panel">
          <div className="surface-panel-header">
            <p className="section-title">اعطای دسترسی به نقش</p>
            <p className="section-desc">ماژول‌ها و گزارش‌های مجاز برای یک نقش</p>
          </div>
          <div className="surface-panel-body space-y-4">
            <Select
              value={grantRoleId}
              onChange={(e) => setGrantRoleId(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nameFa}
                </option>
              ))}
            </Select>
            <div>
              <p className="field-label">ماژول‌ها</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {modules.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={grantModuleIds.includes(m.id)}
                      onChange={(e) => {
                        setGrantModuleIds((prev) =>
                          e.target.checked
                            ? [...prev, m.id]
                            : prev.filter((id) => id !== m.id),
                        );
                      }}
                    />
                    {m.nameFa}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="field-label">گزارش‌ها</p>
              <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                {reports.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={grantReportIds.includes(r.id)}
                      onChange={(e) => {
                        setGrantReportIds((prev) =>
                          e.target.checked
                            ? [...prev, r.id]
                            : prev.filter((id) => id !== r.id),
                        );
                      }}
                    />
                    {r.nameFa}
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={() => void applyBulkGrant()}>ذخیره دسترسی نقش</Button>
          </div>
        </section>
      ) : null}
    </div>
  );

  return body;
}
