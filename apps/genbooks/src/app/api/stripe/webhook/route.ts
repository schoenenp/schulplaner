import { NextResponse } from "next/server";

export async function POST() {
  return new NextResponse(
    "Stripe webhooks are disabled. Checkout post-processing is handled in server procedures.",
    { status: 410 },
  );
}
