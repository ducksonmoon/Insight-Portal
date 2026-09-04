/**
 * The finance copilot: answers only by calling the grounded tools in
 * ./tools.ts — never by writing its own SQL (see tools.ts for why).
 *
 * Runs against a local Ollama instance instead of a paid cloud API, so the
 * whole product stays deployable on the company's own server with no
 * outbound-internet dependency and no per-query cost.
 *
 * Configure via env:
 *   OLLAMA_HOST   default http://127.0.0.1:11434
 *   OLLAMA_MODEL  must support tool calling in Ollama. Pick the size to the
 *                 server's real hardware — a 7–8B model if it's CPU-only /
 *                 modest RAM, 14B+ if there's a real GPU. Whichever you pick,
 *                 test it against real questions before trusting it: this
 *                 integration was written against Ollama's documented API
 *                 shape but has not been run against a live model — no
 *                 Ollama install or model was available in the environment
 *                 this was written in.
 */
import { listReports, listRules, runReportTool, runRuleTool } from "./tools";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:14b-instruct";

const SYSTEM_PROMPT = `
تو دستیار مالی داخلی هستی که فقط از طریق ابزارهای زیر به سؤال کارمندان دربارهٔ دادهٔ راهکاران جواب می‌دهی.

قوانین سخت‌گیرانه:
- هیچ‌وقت عدد، مانده، یا وضعیتی را از خودت نگو — همیشه اول ابزار مربوطه را صدا بزن و فقط از نتیجهٔ آن استفاده کن.
- هیچ‌وقت خودت SQL یا کوئری نمی‌سازی — فقط گزارش‌ها و قوانینِ از‌قبل‌ساخته‌شده را با run_report / run_rule اجرا می‌کنی.
- اگر ابزاری خطا داد یا داده‌ای پیدا نشد، همین را صادقانه بگو؛ حدس نزن.
- اگر مطمئن نیستی کدام گزارش/قانون مرتبط است، اول list_reports و list_rules را ببین.
- اگر گزارش نیاز به پارامتری دارد که کاربر نگفته (مثلاً بازهٔ تاریخ)، یا آن را از متن استنباط کن یا بپرس.
- جواب را کوتاه، فارسی و مستقیم بده. مبلغ‌ها را با جداکنندهٔ هزارگان و واحد «ریال» بگو.
`.trim();

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaChatResponse {
  message: OllamaMessage;
  done: boolean;
}

const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "list_reports",
      description:
        "فهرست همهٔ گزارش‌های منتشرشده در پرتال (Studio، تبدیل‌شده از RDL، یا از قبل تعریف‌شده) را با پارامترهای هرکدام برمی‌گرداند.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "run_report",
      description:
        "یک گزارش مشخص را با پارامترهای داده‌شده روی دیتابیس زندهٔ راهکاران اجرا می‌کند و نمونه‌ای از ردیف‌های نتیجه را برمی‌گرداند.",
      parameters: {
        type: "object",
        properties: {
          reportId: { type: "string", description: "شناسهٔ گزارش، از خروجی list_reports" },
          parameters: {
            type: "object",
            description: "کلید:مقدار پارامترهای همان گزارش (نام‌ها دقیقاً مطابق list_reports)",
          },
        },
        required: ["reportId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_rules",
      description: "فهرست قوانین اسکن سلامت داده و کارتابل روزانه را برمی‌گرداند.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "run_rule",
      description: "یک قانون مشخص از اسکن سلامت داده را روی دیتابیس زنده اجرا می‌کند.",
      parameters: {
        type: "object",
        properties: { ruleId: { type: "string", description: "شناسهٔ قانون، از خروجی list_rules" } },
        required: ["ruleId"],
      },
    },
  },
];

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string | null | undefined,
): Promise<string> {
  switch (name) {
    case "list_reports":
      return JSON.stringify(await listReports());
    case "run_report":
      return JSON.stringify(
        await runReportTool(
          String(args.reportId ?? ""),
          (args.parameters as Record<string, unknown> | undefined) ?? {},
          userId,
        ),
      );
    case "list_rules":
      return JSON.stringify(listRules());
    case "run_rule":
      return JSON.stringify(await runRuleTool(String(args.ruleId ?? "")));
    default:
      return JSON.stringify({ error: `ابزار ناشناخته: ${name}` });
  }
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Hard cap on tool round-trips per question, so a confused model can't loop forever. */
const MAX_TOOL_ITERATIONS = 6;

export async function askCopilot(
  history: ChatTurn[],
  userMessage: string,
  userId?: string | null,
): Promise<string> {
  const messages: OllamaMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user", content: userMessage },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    let response: Response;
    try {
      response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages,
          tools: TOOL_SCHEMAS,
          stream: false,
        }),
      });
    } catch {
      throw new Error(
        `به مدل لوکال روی ${OLLAMA_HOST} وصل نشد. مطمئن شو Ollama در حال اجراست (OLLAMA_HOST را در .env بررسی کن).`,
      );
    }

    if (!response.ok) {
      throw new Error(`Ollama خطا داد: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    const message = data.message;
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content || "متأسفم، نتوانستم جواب مشخصی بدهم.";
    }

    for (const call of message.tool_calls) {
      const result = await executeTool(call.function.name, call.function.arguments ?? {}, userId);
      messages.push({ role: "tool", content: result });
    }
  }

  return "این سؤال چند مرحله‌ای شد و به نتیجهٔ قطعی نرسید — لطفاً واضح‌تر یا محدودتر بپرس.";
}
