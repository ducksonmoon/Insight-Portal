"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { RolesManager } from "@/components/admin/roles-manager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type ModuleRow = { id: string; slug: string; nameFa: string };
type ReportRow = {
  id: string;
  slug: string;
  nameFa: string;
  moduleId: string;
};
type RoleRow = { id: string; slug: string; nameFa: string };
type UserRow = {
  id: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  isActive: boolean;
  domainUserName: string | null;
  moduleAccess: Array<{
    moduleId: string;
    canView: boolean;
    module: { slug: string; nameFa: string };
  }>;
  reportAccess: Array<{
    reportId: string;
    canView: boolean;
    canExport: boolean;
    report: { slug: string; nameFa: string };
  }>;
  roles: Array<{
    roleId: string;
    role: { id: string; slug: string; nameFa: string };
  }>;
};

type AccessManagerProps = {
  initialTab?: "users" | "roles";
};

export function AccessManager({ initialTab = "users" }: AccessManagerProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"users" | "roles">(initialTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [reportIds, setReportIds] = useState<string[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/access");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "بارگذاری ناموفق");
      const nextUsers: UserRow[] = data.users ?? [];
      setUsers(nextUsers);
      setModules(data.modules ?? []);
      setReports(data.reports ?? []);
      setRoles(data.roles ?? []);
      const keep =
        nextUsers.find((u) => u.id === selectedUserId) ?? nextUsers[0];
      if (keep) selectUser(keep);
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectUser(user: UserRow) {
    setSelectedUserId(user.id);
    setModuleIds(user.moduleAccess.map((m) => m.moduleId));
    setReportIds(
      user.reportAccess.filter((r) => r.canView).map((r) => r.reportId),
    );
    setRoleIds(user.roles?.map((r) => r.roleId) ?? []);
    setPassword("");
  }

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  async function save() {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          moduleIds,
          roleIds,
          reportGrants: reportIds.map((reportId) => ({
            reportId,
            canView: true,
            canExport: true,
          })),
          ...(password
            ? { setPassword: { password, isActive: true } }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ذخیره ناموفق");
      toast("دسترسی‌ها ذخیره شد", "success");
      if (password) {
        setGeneratedPassword(password);
        setResetDialogOpen(true);
      }
      setPassword("");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setSaving(false);
    }
  }

  function generateTempPassword() {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 10; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    setPassword(out);
    setGeneratedPassword(out);
    toast("رمز موقت ایجاد شد — پس از ذخیره به کاربر اطلاع دهید", "info");
  }

  async function resetPasswordOnly() {
    if (!selectedUserId || !password) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          setPassword: { password, isActive: true },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setGeneratedPassword(password);
      setResetDialogOpen(true);
      setPassword("");
      toast("رمز عبور به‌روز شد", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setResetting(false);
    }
  }

  async function syncUsers() {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/sync-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "همگام‌سازی ناموفق");
      toast(`${data.upserted ?? 0} کاربر همگام شد`, "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setSyncing(false);
    }
  }

  if (loading && tab === "users") {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-[var(--muted)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        در حال بارگذاری...
      </div>
    );
  }

  return (
    <div className="animate-stagger space-y-5">
      <PageHeader
        title="دسترسی‌ها"
        subtitle="کاربران، نقش‌ها و مجوزهای ماژول/گزارش"
        actions={
          tab === "users" ? (
            <Button variant="outline" onClick={() => void syncUsers()} disabled={syncing}>
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              همگام‌سازی از راهکاران
            </Button>
          ) : null
        }
      />

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={tab === "users" ? "default" : "outline"}
          onClick={() => setTab("users")}
        >
          کاربران
        </Button>
        <Button
          size="sm"
          variant={tab === "roles" ? "default" : "outline"}
          onClick={() => setTab("roles")}
        >
          نقش‌ها
        </Button>
      </div>

      {tab === "roles" ? (
        <RolesManager embedded />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
          <div className="surface-panel">
            <div className="surface-panel-header">
              <p className="section-title">کاربران</p>
              <p className="section-desc">{users.length} نفر</p>
            </div>
            <div className="surface-panel-body max-h-[70vh] space-y-1 overflow-y-auto">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => selectUser(user)}
                  className={`w-full rounded-[var(--radius)] px-3 py-2.5 text-right transition ${
                    selectedUserId === user.id
                      ? "bg-[var(--primary)] text-white"
                      : "hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  <p className="text-sm font-semibold">
                    {user.displayName ?? user.username}
                  </p>
                  <p
                    className={`text-xs ${
                      selectedUserId === user.id
                        ? "text-white/80"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {user.username}
                    {user.isAdmin ? " · ادمین" : ""}
                    {!user.isActive ? " · غیرفعال" : ""}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="surface-panel">
            <div className="surface-panel-header">
              <p className="section-title">
                {selectedUser
                  ? `دسترسی‌های ${selectedUser.displayName ?? selectedUser.username}`
                  : "یک کاربر انتخاب کنید"}
              </p>
              <p className="section-desc">
                نقش‌ها دسترسی گروهی می‌دهند؛ ماژول/گزارش برای دسترسی مستقیم است.
              </p>
            </div>
            <div className="surface-panel-body space-y-5">
              {!selectedUser ? null : selectedUser.isAdmin ? (
                <p className="rounded-[var(--radius)] bg-[var(--primary-soft)] px-4 py-3 text-sm text-[var(--primary)]">
                  این کاربر ادمین است و بدون نیاز به تخصیص، به همه گزارش‌ها دسترسی
                  دارد.
                </p>
              ) : (
                <>
                  <div>
                    <h3 className="mb-2 text-sm font-bold">نقش‌ها</h3>
                    {roles.length ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {roles.map((role) => {
                          const checked = roleIds.includes(role.id);
                          return (
                            <label
                              key={role.id}
                              className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setRoleIds((prev) =>
                                    e.target.checked
                                      ? [...prev, role.id]
                                      : prev.filter((id) => id !== role.id),
                                  );
                                }}
                              />
                              {role.nameFa}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--muted)]">
                        هنوز نقشی تعریف نشده — از تب «نقش‌ها» بسازید.
                      </p>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-bold">ماژول‌ها</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {modules.map((m) => {
                        const checked = moduleIds.includes(m.id);
                        return (
                          <label
                            key={m.id}
                            className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setModuleIds((prev) =>
                                  e.target.checked
                                    ? [...prev, m.id]
                                    : prev.filter((id) => id !== m.id),
                                );
                              }}
                            />
                            {m.nameFa}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-bold">گزارش‌ها (اختیاری)</h3>
                    <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                      {reports.map((r) => {
                        const checked = reportIds.includes(r.id);
                        return (
                          <label
                            key={r.id}
                            className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setReportIds((prev) =>
                                  e.target.checked
                                    ? [...prev, r.id]
                                    : prev.filter((id) => id !== r.id),
                                );
                              }}
                            />
                            <span>
                              {r.nameFa}
                              <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                                {r.slug}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {selectedUser ? (
                <div className="space-y-3 border-t border-[var(--border)] pt-4">
                  <label className="block space-y-1 text-sm">
                    <span className="field-label">رمز عبور اپ (اختیاری)</span>
                    <Input
                      type="text"
                      value={password}
                      placeholder="برای تغییر رمز پر کنید"
                      onChange={(e) => setPassword(e.target.value)}
                      dir="ltr"
                      autoComplete="off"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={generateTempPassword}
                    >
                      ایجاد رمز موقت
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!password || resetting}
                      onClick={() => void resetPasswordOnly()}
                    >
                      {resetting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      فقط تغییر رمز
                    </Button>
                    <Button onClick={() => void save()} disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      ذخیره دسترسی
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent showClose={false}>
          <DialogHeader>
            <DialogTitle>رمز عبور جدید</DialogTitle>
            <DialogDescription>
              این رمز فقط یک‌بار نمایش داده می‌شود. آن را به کاربر امن منتقل کنید.
            </DialogDescription>
          </DialogHeader>
          <p
            className="rounded-[var(--radius)] bg-[var(--surface-muted)] px-4 py-3 text-center font-mono text-lg"
            dir="ltr"
          >
            {generatedPassword}
          </p>
          <DialogFooter>
            <Button
              onClick={() => {
                setResetDialogOpen(false);
                setGeneratedPassword(null);
              }}
            >
              متوجه شدم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
