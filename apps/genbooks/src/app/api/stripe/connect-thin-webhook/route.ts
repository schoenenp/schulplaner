import { NextResponse } from "next/server";

export async function POST() {
  return new NextResponse(
    "Stripe webhooks are disabled. Connect state is resolved in server procedures.",
    { status: 410 },
  );
}
