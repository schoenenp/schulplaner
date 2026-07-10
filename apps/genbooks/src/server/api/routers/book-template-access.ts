import type { UserRole } from "@prisma/client";

export function canToggleTemplateByRole(role: UserRole): boolean {
  return (
    role === "ADMIN" ||
    role === "STAFF" ||
    role === "MODERATOR" ||
    role === "SPONSOR" ||
    role === "PARTNER"
  );
}
