import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_FROM &&
      (process.env.SMTP_USER ? process.env.SMTP_PASSWORD : true),
  );
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!isSmtpConfigured()) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_FROM, and optionally SMTP_USER/SMTP_PASSWORD.",
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD ?? "",
          }
        : undefined,
    });
  }
  return transporter;
}

export async function sendEmail(options: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const transport = getTransporter();
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: options.to.join(", "),
    subject: options.subject,
    text: options.text,
    html: options.html ?? options.text.replace(/\n/g, "<br>"),
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
}

export async function testSmtpConnection(): Promise<{ ok: boolean; message: string }> {
  if (!isSmtpConfigured()) {
    return { ok: false, message: "SMTP پیکربندی نشده است" };
  }
  try {
    await getTransporter().verify();
    return { ok: true, message: "اتصال SMTP برقرار است" };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "خطای اتصال SMTP",
    };
  }
}
