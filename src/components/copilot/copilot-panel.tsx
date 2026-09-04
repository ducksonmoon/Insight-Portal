"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The finance copilot chat, embedded as a tab/widget inside the portal — not a
 * separate destination. Answers are grounded: every reply comes from the rule
 * engine or a direct party lookup, never from the model composing SQL itself.
 */
export function CopilotPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const message = input.trim();
    if (!message || sending) return;

    const history = turns;
    setTurns([...history, { role: "user", content: message }]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطا در پاسخ");
      setTurns((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ارتباط با کوپایلوت");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="surface-panel">
      <div className="surface-panel-header">
        <p className="section-title">دستیار مالی</p>
        <p className="section-desc">
          سؤالت را دربارهٔ مانده، چک‌ها، یا وضعیت یک طرف‌حساب بپرس — جواب همیشه از
          روی دادهٔ زندهٔ راهکاران است.
        </p>
      </div>

      <div className="surface-panel-body space-y-4">
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
          {turns.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              مثلاً بپرس: «مانده شرکت سرآمد رنگ شمال چقدره؟» یا «امروز چه مشکلی داریم؟»
            </p>
          ) : null}
          {turns.map((turn, index) => (
            <div
              key={index}
              className={`max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm ${
                turn.role === "user"
                  ? "self-end bg-[var(--primary)] text-white"
                  : "self-start bg-[var(--surface-muted)] text-[var(--foreground)]"
              }`}
            >
              {turn.content}
            </div>
          ))}
          {sending ? (
            <div className="self-start rounded-[var(--radius)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--muted)]">
              <Loader2 className="inline h-3 w-3 animate-spin" /> در حال بررسی دادهٔ زنده...
            </div>
          ) : null}
        </div>

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="سؤالت را بنویس..."
            disabled={sending}
          />
          <Button type="submit" disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </section>
  );
}
