"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  PlayCircle,
  RefreshCcw,
  Trash2,
} from "lucide-react";

import { EmptyState, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type RuleParam = { name: string; labelFa: string; defaultValue: number };

type ConditionOp = "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "contains";
const OP_LABEL_FA: Record<ConditionOp, string> = {
  eq: "برابر است با",
  ne: "برابر نیست با",
  lt: "کمتر از",
  lte: "کمتر یا مساوی",
  gt: "بیشتر از",
  gte: "بیشتر یا مساوی",
  in: "یکی از (با ویرگول)",
  contains: "شامل",
};

type EntityField = { key: string; labelFa: string; type: "number" | "string" | "date" | "boolean" };
type EntityMeta = { key: string; labelFa: string; module: string; fields: EntityField[] };

type ConditionLeaf = { field: string; op: ConditionOp; value: unknown };
type ConditionNode = ConditionLeaf | { all: ConditionNode[] } | { any: ConditionNode[] };

/** Editable row shape for the builder form — value stays a raw string until submit, when it's coerced per the field's declared type. */
type ConditionDraftRow = { field: string; op: ConditionOp; value: string };

type CustomRuleForm = {
  entityKey: string;
  titleFa: string;
  severity: "critical" | "high" | "medium" | "low";
  frequency: string;
  runAt: string;
  conditions: ConditionDraftRow[];
};

function emptyCustomForm(entities: EntityMeta[]): CustomRuleForm {
  const firstEntity = entities[0];
  return {
    entityKey: firstEntity?.key ?? "",
    titleFa: "",
    severity: "medium",
    frequency: "daily",
    runAt: "07:00",
    conditions: firstEntity?.fields[0]
      ? [{ field: firstEntity.fields[0].key, op: "gt", value: "" }]
      : [],
  };
}

function coerceConditionValue(raw: string, type: EntityField["type"], op: ConditionOp): unknown {
  if (op === "in") {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (type === "number" ? Number(part) : part));
  }
  return type === "number" ? Number(raw) : raw;
}

type LastRun = {
  status: "ok" | "error";
  findingCount: number;
  newCount: number;
  resolvedCount: number;
  totalAmount: number | null;
  runAt: string;
  error: string | null;
};

type RuleRow = {
  id: string;
  kind: "predefined" | "custom";
  ruleCode: string;
  titleFa: string;
  descriptionFa: string;
  whyItMattersFa: string;
  fixHintFa: string;
  moduleFa: string;
  pack: "health" | "daily";
  severity: "critical" | "high" | "medium" | "low";
  severityFa: string;
  params: RuleParam[];
  paramOverrides: Record<string, number>;
  entityKey: string | null;
  condition: ConditionNode | null;
  isEnabled: boolean;
  frequency: string;
  runAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  openFindingCount: number;
  openAmount: number;
  lastRun: LastRun | null;
};

type FindingRow = {
  id: string;
  entityId: string;
  status: "new" | "acknowledged" | "resolved";
  titleFa: string;
  detailFa: string;
  amount: number | null;
  refDate: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

const SEVERITY_BADGE: Record<RuleRow["severity"], string> = {
  critical: "badge-danger",
  high: "badge-warning",
  medium: "badge-primary",
  low: "",
};

function formatAmount(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("fa-IR").format(Math.round(n));
}

export function RulesManager() {
  const { toast, confirm } = useToast();
  const searchParams = useSearchParams();
  const deepLinkedRuleId = searchParams.get("rule");
  const autoExpandedRef = useRef(false);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [entities, setEntities] = useState<EntityMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAll, setRunningAll] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [findings, setFindings] = useState<Record<string, FindingRow[] | "loading">>({});
  const [drafts, setDrafts] = useState<Record<string, { frequency: string; runAt: string; params: Record<string, number> }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [customForm, setCustomForm] = useState<CustomRuleForm | null>(null);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [savingCustom, setSavingCustom] = useState(false);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/rules");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      const rows: RuleRow[] = data.rules ?? [];
      setRules(rows);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (next[row.id]) continue;
          next[row.id] = {
            frequency: row.frequency,
            runAt: row.runAt,
            params: { ...row.paramOverrides },
          };
        }
        return next;
      });
    } catch (err) {
      if (!opts.silent) toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [toast]);

  const loadEntities = useCallback(async () => {
    try {
      const res = await fetch("/api/entities");
      const data = await res.json();
      if (res.ok) setEntities(data.entities ?? []);
    } catch {
      // the custom-rule builder just won't have entities to offer — non-fatal
    }
  }, []);

  useEffect(() => {
    void load();
    void loadEntities();
  }, [load, loadEntities]);

  const summary = useMemo(() => {
    const openFindings = rules.reduce((sum, r) => sum + r.openFindingCount, 0);
    const openAmount = rules.reduce((sum, r) => sum + r.openAmount, 0);
    const enabled = rules.filter((r) => r.isEnabled).length;
    return { openFindings, openAmount, enabled, total: rules.length };
  }, [rules]);

  const grouped = useMemo(() => {
    const map = new Map<string, RuleRow[]>();
    for (const rule of rules) {
      const list = map.get(rule.moduleFa) ?? [];
      list.push(rule);
      map.set(rule.moduleFa, list);
    }
    return Array.from(map.entries());
  }, [rules]);

  async function runAll() {
    setRunningAll(true);
    // Rules run up to 3 at a time server-side (src/lib/rules/persistence.ts)
    // but a batch of a dozen-plus real ledger queries still takes a while —
    // each rule persists its result as soon as it finishes, so poll in the
    // background and let cards update live instead of staring at one spinner.
    const pollId = setInterval(() => void load({ silent: true }), 3000);
    try {
      const res = await fetch("/api/admin/rules/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      toast("همهٔ قوانین فعال اجرا شدند", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      clearInterval(pollId);
      setRunningAll(false);
      await load();
    }
  }

  async function runOne(id: string) {
    setRunningId(id);
    try {
      const res = await fetch(`/api/admin/rules/${id}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      await load();
      if (expandedId === id) await loadFindings(id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setRunningId(null);
    }
  }

  async function toggleEnabled(row: RuleRow) {
    try {
      const res = await fetch(`/api/admin/rules/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !row.isEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    }
  }

  async function saveConfig(row: RuleRow) {
    const draft = drafts[row.id];
    if (!draft) return;
    setSavingId(row.id);
    try {
      const res = await fetch(`/api/admin/rules/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frequency: draft.frequency,
          runAt: draft.runAt,
          params: draft.params,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      toast("تنظیمات ذخیره شد", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setSavingId(null);
    }
  }

  async function loadFindings(ruleId: string) {
    setFindings((prev) => ({ ...prev, [ruleId]: "loading" }));
    try {
      const res = await fetch(`/api/admin/rules/${ruleId}/findings`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      setFindings((prev) => ({ ...prev, [ruleId]: data.findings ?? [] }));
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
      setFindings((prev) => ({ ...prev, [ruleId]: [] }));
    }
  }

  async function toggleExpand(ruleId: string) {
    const next = expandedId === ruleId ? null : ruleId;
    setExpandedId(next);
    if (next && !findings[next]) await loadFindings(next);
  }

  // Arriving from a notification (?rule=<id>) — open that card and scroll to
  // it once the list has loaded. Only ever once per page load, so re-fetches
  // (polling, manual refresh) don't keep yanking the user back to it.
  useEffect(() => {
    if (!deepLinkedRuleId || autoExpandedRef.current || !rules.length) return;
    if (!rules.some((r) => r.id === deepLinkedRuleId)) return;
    autoExpandedRef.current = true;
    setExpandedId(deepLinkedRuleId);
    void loadFindings(deepLinkedRuleId);
    document
      .getElementById(`rule-${deepLinkedRuleId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedRuleId, rules]);

  async function setFindingStatus(
    ruleId: string,
    findingId: string,
    status: "acknowledged" | "resolved" | "new",
  ) {
    try {
      const res = await fetch(`/api/admin/rules/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      await loadFindings(ruleId);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    }
  }

  function openNewCustomForm() {
    setEditingCustomId(null);
    setCustomForm(emptyCustomForm(entities));
  }

  function openEditCustomForm(row: RuleRow) {
    const entity = entities.find((e) => e.key === row.entityKey);
    const flatConditions: ConditionDraftRow[] =
      row.condition && "all" in row.condition
        ? row.condition.all
            .filter((c): c is ConditionLeaf => "field" in c)
            .map((c) => ({
              field: c.field,
              op: c.op,
              value: Array.isArray(c.value) ? c.value.join(", ") : String(c.value),
            }))
        : [];

    setEditingCustomId(row.id);
    setCustomForm({
      entityKey: row.entityKey ?? entity?.key ?? "",
      titleFa: row.titleFa,
      severity: row.severity,
      frequency: row.frequency,
      runAt: row.runAt,
      conditions: flatConditions.length ? flatConditions : emptyCustomForm(entities).conditions,
    });
  }

  function addConditionRow() {
    setCustomForm((form) => {
      if (!form) return form;
      const entity = entities.find((e) => e.key === form.entityKey);
      const firstField = entity?.fields[0]?.key ?? "";
      return { ...form, conditions: [...form.conditions, { field: firstField, op: "gt", value: "" }] };
    });
  }

  function removeConditionRow(index: number) {
    setCustomForm((form) => (form ? { ...form, conditions: form.conditions.filter((_, i) => i !== index) } : form));
  }

  function updateConditionRow(index: number, patch: Partial<ConditionDraftRow>) {
    setCustomForm((form) =>
      form
        ? { ...form, conditions: form.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) }
        : form,
    );
  }

  async function saveCustomRule() {
    if (!customForm) return;
    const entity = entities.find((e) => e.key === customForm.entityKey);
    if (!entity) {
      toast("موجودیتی انتخاب نشده", "error");
      return;
    }
    if (!customForm.titleFa.trim()) {
      toast("نام قانون الزامی است", "error");
      return;
    }
    if (!customForm.conditions.length) {
      toast("حداقل یک شرط لازم است", "error");
      return;
    }

    const condition: ConditionNode = {
      all: customForm.conditions.map((row) => {
        const field = entity.fields.find((f) => f.key === row.field);
        return {
          field: row.field,
          op: row.op,
          value: coerceConditionValue(row.value, field?.type ?? "string", row.op),
        };
      }),
    };

    setSavingCustom(true);
    try {
      const body = {
        entityKey: customForm.entityKey,
        titleFa: customForm.titleFa.trim(),
        severity: customForm.severity,
        condition,
        frequency: customForm.frequency,
        runAt: customForm.runAt,
      };
      const res = await fetch(
        editingCustomId ? `/api/admin/rules/custom/${editingCustomId}` : "/api/admin/rules/custom",
        {
          method: editingCustomId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      toast(editingCustomId ? "قانون سفارشی به‌روزرسانی شد" : "قانون سفارشی ساخته شد", "success");
      setCustomForm(null);
      setEditingCustomId(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setSavingCustom(false);
    }
  }

  async function deleteCustomRule(row: RuleRow) {
    const ok = await confirm("حذف قانون سفارشی", `«${row.titleFa}» حذف شود؟ تاریخچهٔ یافته‌های آن هم حذف می‌شود.`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/rules/custom/${row.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا");
      toast("حذف شد", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "خطا", "error");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="موتور قوانین"
        subtitle="بررسی خودکار سلامت داده و استثناهای عملیاتی راهکاران"
        breadcrumbs={[{ label: "مدیریت", href: "/admin/reports" }, { label: "موتور قوانین" }]}
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              بروزرسانی
            </Button>
            <Button onClick={() => void runAll()} disabled={runningAll}>
              {runningAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              اجرای همهٔ قوانین فعال
            </Button>
            <Button variant="outline" onClick={openNewCustomForm} disabled={!entities.length}>
              <Plus className="h-4 w-4" />
              قانون سفارشی جدید
            </Button>
          </>
        }
      />

      {customForm ? (
        <section className="surface-panel">
          <div className="surface-panel-header">
            <p className="section-title">{editingCustomId ? "ویرایش قانون سفارشی" : "قانون سفارشی جدید"}</p>
          </div>
          <div className="surface-panel-body space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="field-label">نام قانون</span>
                <Input
                  value={customForm.titleFa}
                  onChange={(e) => setCustomForm((f) => (f ? { ...f, titleFa: e.target.value } : f))}
                  placeholder="مثلاً: چک‌های درشت نزدیک سررسید"
                />
              </label>
              <label className="space-y-1">
                <span className="field-label">موجودیت</span>
                <Select
                  value={customForm.entityKey}
                  disabled={Boolean(editingCustomId)}
                  onChange={(e) => {
                    const entityKey = e.target.value;
                    const entity = entities.find((en) => en.key === entityKey);
                    setCustomForm((f) =>
                      f
                        ? {
                            ...f,
                            entityKey,
                            conditions: entity?.fields[0] ? [{ field: entity.fields[0].key, op: "gt", value: "" }] : [],
                          }
                        : f,
                    );
                  }}
                >
                  {entities.map((entity) => (
                    <option key={entity.key} value={entity.key}>
                      {entity.labelFa}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="field-label">شدت</span>
                <Select
                  value={customForm.severity}
                  onChange={(e) =>
                    setCustomForm((f) => (f ? { ...f, severity: e.target.value as CustomRuleForm["severity"] } : f))
                  }
                >
                  <option value="critical">بحرانی</option>
                  <option value="high">مهم</option>
                  <option value="medium">متوسط</option>
                  <option value="low">کم</option>
                </Select>
              </label>
            </div>

            <div className="space-y-2">
              <span className="field-label">شرط‌ها (همه باید برقرار باشند)</span>
              {(() => {
                const entity = entities.find((en) => en.key === customForm.entityKey);
                return customForm.conditions.map((row, index) => {
                  const field = entity?.fields.find((f) => f.key === row.field);
                  return (
                    <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                      <Select
                        value={row.field}
                        onChange={(e) => updateConditionRow(index, { field: e.target.value })}
                      >
                        {entity?.fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.labelFa}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={row.op}
                        onChange={(e) => updateConditionRow(index, { op: e.target.value as ConditionOp })}
                      >
                        {Object.entries(OP_LABEL_FA).map(([op, labelFa]) => (
                          <option key={op} value={op}>
                            {labelFa}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type={field?.type === "number" && row.op !== "in" ? "number" : "text"}
                        value={row.value}
                        onChange={(e) => updateConditionRow(index, { value: e.target.value })}
                        placeholder={row.op === "in" ? "مقدار۱, مقدار۲" : "مقدار"}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-[var(--danger)]"
                        onClick={() => removeConditionRow(index)}
                        disabled={customForm.conditions.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                });
              })()}
              <Button size="sm" variant="outline" onClick={addConditionRow}>
                <Plus className="h-3.5 w-3.5" />
                افزودن شرط
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="field-label">تناوب</span>
                <Select
                  value={customForm.frequency}
                  onChange={(e) => setCustomForm((f) => (f ? { ...f, frequency: e.target.value } : f))}
                >
                  <option value="hourly">ساعتی</option>
                  <option value="daily">روزانه</option>
                  <option value="weekly">هفتگی</option>
                </Select>
              </label>
              <label className="space-y-1">
                <span className="field-label">ساعت اجرا (HH:mm)</span>
                <Input
                  value={customForm.runAt}
                  onChange={(e) => setCustomForm((f) => (f ? { ...f, runAt: e.target.value } : f))}
                  placeholder="07:00"
                  disabled={customForm.frequency === "hourly"}
                />
              </label>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => void saveCustomRule()} disabled={savingCustom}>
                {savingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                ذخیره
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCustomForm(null);
                  setEditingCustomId(null);
                }}
              >
                انصراف
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && rules.length ? (
        <section className="grid gap-3 sm:grid-cols-4">
          <div className="surface-panel surface-panel-body">
            <p className="field-label">یافته‌های باز</p>
            <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">{summary.openFindings}</p>
          </div>
          <div className="surface-panel surface-panel-body">
            <p className="field-label">مبلغ در معرض ریسک</p>
            <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">{formatAmount(summary.openAmount)}</p>
          </div>
          <div className="surface-panel surface-panel-body">
            <p className="field-label">قوانین فعال</p>
            <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">
              {summary.enabled} / {summary.total}
            </p>
          </div>
          <div className="surface-panel surface-panel-body">
            <p className="field-label">دستیار مالی</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              یافته‌های همین قوانین را می‌توانید از «دستیار مالی» هم بپرسید.
            </p>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        </div>
      ) : !rules.length ? (
        <EmptyState title="قانونی یافت نشد" description="پکیج قوانین (src/lib/rules/packs) خالی است." />
      ) : (
        <div className="space-y-6">
          {grouped.map(([moduleFa, moduleRules]) => (
            <section key={moduleFa} className="space-y-2">
              <p className="section-title">{moduleFa}</p>
              <div className="list-panel">
                {moduleRules.map((row) => {
                  const expanded = expandedId === row.id;
                  const draft = drafts[row.id] ?? { frequency: row.frequency, runAt: row.runAt, params: row.paramOverrides };
                  const rowFindings = findings[row.id];

                  return (
                    <div
                      key={row.id}
                      id={`rule-${row.id}`}
                      className="border-b border-[var(--border)] last:border-b-0 scroll-mt-24"
                    >
                      <div className="action-row text-sm">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-start gap-3 text-right"
                          onClick={() => void toggleExpand(row.id)}
                        >
                          {expanded ? (
                            <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-[var(--muted)]" />
                          ) : (
                            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-[var(--muted)]" />
                          )}
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "badge",
                                  SEVERITY_BADGE[row.severity] || "bg-[var(--surface-muted)] text-[var(--muted)]",
                                )}
                              >
                                {row.severityFa}
                              </span>
                              <span className="font-semibold">{row.titleFa}</span>
                              {row.kind === "custom" ? <span className="badge badge-primary">سفارشی</span> : null}
                              {row.openFindingCount > 0 ? (
                                <span className="badge badge-danger">{row.openFindingCount} یافته باز</span>
                              ) : (
                                <span className="badge badge-success">سالم</span>
                              )}
                            </span>
                            <span className="mt-1 block text-xs text-[var(--muted)]">
                              {row.descriptionFa}
                            </span>
                            <span className="mt-1 block text-xs text-[var(--muted)]">
                              {row.pack === "daily" ? "پنل روزانه" : "سلامت داده"} · {row.frequency === "hourly" ? "ساعتی" : row.frequency === "weekly" ? "هفتگی" : "روزانه"} @ {row.runAt}
                              {row.lastRun
                                ? row.lastRun.status === "error"
                                  ? ` · آخرین اجرا ناموفق: ${row.lastRun.error ?? ""}`
                                  : ` · آخرین اجرا: ${new Date(row.lastRun.runAt).toLocaleString("fa-IR")}`
                                : " · هنوز اجرا نشده"}
                            </span>
                          </span>
                        </button>

                        <Button size="sm" variant="outline" onClick={() => void toggleEnabled(row)}>
                          {row.isEnabled ? "فعال" : "غیرفعال"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void runOne(row.id)}
                          disabled={runningId === row.id}
                        >
                          {runningId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <PlayCircle className="h-3.5 w-3.5" />
                          )}
                          اجرای اکنون
                        </Button>
                        {row.kind === "custom" ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => openEditCustomForm(row)}>
                              ویرایش
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[var(--danger)]"
                              onClick={() => void deleteCustomRule(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>

                      {expanded ? (
                        <div className="space-y-4 border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4">
                          <p className="text-xs leading-relaxed text-[var(--foreground)]">
                            <span className="font-semibold">چرا مهم است: </span>
                            {row.whyItMattersFa}
                          </p>
                          <p className="text-xs leading-relaxed text-[var(--muted)]">
                            <span className="font-semibold text-[var(--foreground)]">اقدام پیشنهادی: </span>
                            {row.fixHintFa}
                          </p>

                          <div className="grid gap-3 sm:grid-cols-3">
                            <label className="space-y-1">
                              <span className="field-label">تناوب</span>
                              <Select
                                value={draft.frequency}
                                onChange={(e) =>
                                  setDrafts((d) => ({ ...d, [row.id]: { ...draft, frequency: e.target.value } }))
                                }
                              >
                                <option value="hourly">ساعتی</option>
                                <option value="daily">روزانه</option>
                                <option value="weekly">هفتگی</option>
                              </Select>
                            </label>
                            <label className="space-y-1">
                              <span className="field-label">ساعت اجرا (HH:mm)</span>
                              <Input
                                value={draft.runAt}
                                onChange={(e) =>
                                  setDrafts((d) => ({ ...d, [row.id]: { ...draft, runAt: e.target.value } }))
                                }
                                placeholder="07:00"
                                disabled={draft.frequency === "hourly"}
                              />
                            </label>
                            {row.params.map((param) => (
                              <label key={param.name} className="space-y-1">
                                <span className="field-label">{param.labelFa}</span>
                                <Input
                                  type="number"
                                  value={draft.params[param.name] ?? param.defaultValue}
                                  onChange={(e) =>
                                    setDrafts((d) => ({
                                      ...d,
                                      [row.id]: {
                                        ...draft,
                                        params: { ...draft.params, [param.name]: Number(e.target.value) },
                                      },
                                    }))
                                  }
                                />
                              </label>
                            ))}
                          </div>
                          <Button size="sm" onClick={() => void saveConfig(row)} disabled={savingId === row.id}>
                            {savingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            ذخیره تنظیمات
                          </Button>

                          <div>
                            <p className="field-label mb-2">یافته‌های باز</p>
                            {rowFindings === "loading" || rowFindings === undefined ? (
                              <div className="flex justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                              </div>
                            ) : rowFindings.length === 0 ? (
                              <p className="text-xs text-[var(--muted)]">یافتهٔ بازی برای این قانون ثبت نشده.</p>
                            ) : (
                              <div className="space-y-2">
                                {rowFindings.map((finding) => (
                                  <div
                                    key={finding.id}
                                    className="flex flex-wrap items-start justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold">
                                        {finding.titleFa}
                                        {finding.status === "acknowledged" ? (
                                          <span className="badge badge-primary mr-2">دیده‌شده</span>
                                        ) : null}
                                      </p>
                                      <p className="mt-0.5 text-xs text-[var(--muted)]">{finding.detailFa}</p>
                                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                                        {finding.amount != null ? `مبلغ: ${formatAmount(finding.amount)} · ` : ""}
                                        اولین مشاهده: {new Date(finding.firstSeenAt).toLocaleDateString("fa-IR")}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 gap-1">
                                      {finding.status === "new" ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => void setFindingStatus(row.id, finding.id, "acknowledged")}
                                        >
                                          دیدم
                                        </Button>
                                      ) : null}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => void setFindingStatus(row.id, finding.id, "resolved")}
                                      >
                                        رفع شد
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        برای اجرای زمان‌بندی‌شده روی سرور، دستور <code>npm run rules:run</code> را با
        Task Scheduler/cron صدا بزنید — دقیقاً مثل زمان‌بندی گزارش‌ها.
      </p>
    </div>
  );
}
