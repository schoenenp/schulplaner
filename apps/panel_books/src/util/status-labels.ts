export type BadgeTone = "success" | "info" | "warning" | "danger" | "neutral";

export const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  success: "border-success-400/25 bg-success-950/35 text-success-300",
  info: "border-pirrot-blue-300/20 bg-pirrot-blue-950/55 text-pirrot-blue-200",
  warning: "border-warning-400/25 bg-warning-950/35 text-warning-200",
  danger: "border-pirrot-red-400/25 bg-pirrot-red-950/35 text-pirrot-red-300",
  neutral: "border-pirrot-blue-200/15 bg-slate-950/40 text-pirrot-blue-100/75",
};

type StatusMeta = { label: string; tone: BadgeTone };

export const ORDER_STATUS_META: Record<string, StatusMeta> = {
  PENDING: { label: "Offen", tone: "warning" },
  COMPLETED: { label: "Abgeschlossen", tone: "success" },
  SHIPPED: { label: "Versendet", tone: "info" },
  CANCELED: { label: "Storniert", tone: "danger" },
  FAILED: { label: "Fehlgeschlagen", tone: "danger" },
};

export const PAYMENT_STATUS_META: Record<string, StatusMeta> = {
  PENDING: { label: "Zahlung offen", tone: "warning" },
  SUCCEEDED: { label: "Bezahlt", tone: "success" },
  FAILED: { label: "Zahlung fehlgeschlagen", tone: "danger" },
  CANCELLED: { label: "Zahlung abgebrochen", tone: "danger" },
  REFUNDED: { label: "Erstattet", tone: "info" },
};

export const DELIVERY_STATUS_META: Record<string, StatusMeta> = {
  PENDING: { label: "Versand offen", tone: "warning" },
  PREPARING: { label: "In Vorbereitung", tone: "info" },
  SHIPPED: { label: "Versendet", tone: "info" },
  COMPLETED: { label: "Zugestellt", tone: "success" },
  RETOURING: { label: "Retoure läuft", tone: "warning" },
  RETOURED: { label: "Retourniert", tone: "danger" },
};

export const PARTNER_ORDER_STATUS_META: Record<string, StatusMeta> = {
  SUBMITTED_BY_SCHOOL: { label: "Von Schule eingereicht", tone: "warning" },
  UNDER_PARTNER_REVIEW: { label: "In Partner-Prüfung", tone: "info" },
  PARTNER_CONFIRMED: { label: "Partner bestätigt", tone: "info" },
  PARTNER_DECLINED: { label: "Abgelehnt", tone: "danger" },
  RELEASED_TO_PRODUCTION: { label: "In Produktion", tone: "success" },
  FULFILLED: { label: "Abgeschlossen", tone: "success" },
};

export const USER_ROLE_META: Record<string, StatusMeta> = {
  ADMIN: { label: "Admin", tone: "danger" },
  STAFF: { label: "Staff", tone: "info" },
  MODERATOR: { label: "Moderator", tone: "info" },
  USER: { label: "User", tone: "neutral" },
  SPONSOR: { label: "Sponsor", tone: "warning" },
  PARTNER: { label: "Partner", tone: "success" },
};

export function statusMeta(
  map: Record<string, StatusMeta>,
  status: string,
): StatusMeta {
  return map[status] ?? { label: status, tone: "neutral" };
}
