import { z } from "zod";

function target(url: URL) {
  const hostname = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ? "loopback"
    : url.hostname.toLowerCase();
  return `${hostname}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`;
}

/** Never includes a connection string or credentials in its error messages. */
export function assertPricingDatabaseUrl(
  value: string,
  applicationDatabaseUrl?: string,
): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "PRICING_DATABASE_URL muss eine PostgreSQL-Verbindungsadresse sein.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1) ||
    url.searchParams.has("host") ||
    url.searchParams.has("port") ||
    url.searchParams.has("dbname")
  ) {
    throw new Error(
      "PRICING_DATABASE_URL muss eine PostgreSQL-Adresse mit Host und Datenbanknamen sein.",
    );
  }
  if (applicationDatabaseUrl) {
    let application: URL;
    try {
      application = new URL(applicationDatabaseUrl);
    } catch {
      return;
    }
    if (target(url) === target(application))
      throw new Error(
        "PRICING_DATABASE_URL muss auf eine andere Datenbank als DATABASE_URL zeigen.",
      );
  }
}

export function pricingDatabaseUrlSchema(applicationDatabaseUrl?: string) {
  return z.string().superRefine((value, ctx) => {
    try {
      assertPricingDatabaseUrl(value, applicationDatabaseUrl);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: (error as Error).message,
      });
    }
  });
}
