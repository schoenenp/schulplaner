import "server-only";
import { createTransport, type Transporter } from "nodemailer";
import { brand } from "@/brand";
import { env } from "@/env";
import { logger } from "@/lib/logger";

let transport: Transporter | undefined;

export function smtpServer() {
  return {
    host: env.EMAIL_SERVER_HOST ?? "localhost",
    port: env.EMAIL_SERVER_PORT,
    secure: env.EMAIL_SERVER_PORT === 465,
    auth: env.EMAIL_SERVER_USER
      ? { user: env.EMAIL_SERVER_USER, pass: env.EMAIL_SERVER_PASSWORD ?? "" }
      : undefined,
  };
}

export function mailFrom() {
  return env.EMAIL_FROM ?? env.EMAIL_SERVER_USER ?? `noreply@localhost`;
}

/**
 * Mail is only delivered in production (or with EMAIL_DEV_SEND=true) and
 * only when SMTP is configured; otherwise the message is written to the log
 * so local testing never reaches real inboxes.
 */
export function canDeliverMail() {
  return (
    Boolean(env.EMAIL_SERVER_HOST) &&
    (env.NODE_ENV === "production" || env.EMAIL_DEV_SEND === "true")
  );
}

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}) {
  if (!canDeliverMail()) {
    logger.info("mail_not_sent_logged_only", message);
    return;
  }
  transport ??= createTransport(smtpServer());
  const result = await transport.sendMail({
    from: `${brand.name} <${mailFrom()}>`,
    ...message,
  });
  const failed = [...(result.rejected ?? []), ...(result.pending ?? [])];
  if (failed.length > 0) {
    throw new Error(`Mail could not be delivered to ${failed.join(", ")}`);
  }
}

/** Notifications must never block or fail the action that triggered them. */
export function sendMailInBackground(
  message: Parameters<typeof sendMail>[0],
): void {
  void sendMail(message).catch((error: unknown) =>
    logger.error("mail_delivery_failed", { subject: message.subject, error }),
  );
}
