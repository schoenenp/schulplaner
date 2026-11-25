import "server-only";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/server/auth";

export async function requireUser(callbackPath = "/planer") {
  const session = await auth();
  if (!session?.user) {
    redirect(`/anmelden?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }
  return session.user;
}

export function isStaffRole(role: string | undefined) {
  return role === "ADMIN" || role === "STAFF";
}

/** Panel pages and actions: staff only; others get a plain 404. */
export async function requireStaff() {
  const user = await requireUser("/panel");
  if (!isStaffRole(user.role)) notFound();
  return user;
}

export async function requireAdmin() {
  const user = await requireStaff();
  if (user.role !== "ADMIN") notFound();
  return user;
}
