import nodemailer from "nodemailer";
import { env } from "@/env";

// Invitations contain private access tokens. Send only to the invited address.
export async function sendTemplateInvitation(to: string, html: string) {
  const transport = nodemailer.createTransport({
    host: env.EMAIL_SERVER_HOST,
    port: env.EMAIL_SERVER_PORT,
    secure: env.EMAIL_SERVER_PORT === 465,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    auth: { user: env.EMAIL_SERVER_USER, pass: env.EMAIL_SERVER_PASSWORD },
  });
  const result = await transport.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject: "Ihre Schulplaner-Vorlage",
    html,
  });
  const accepted = (result.accepted ?? []).some(
    (recipient) =>
      (typeof recipient === "string" ? recipient : recipient.address)
        ?.trim()
        .toLowerCase() === to.trim().toLowerCase(),
  );
  if (!accepted)
    throw new Error("Der Mailserver hat die Einladung nicht angenommen.");
}
