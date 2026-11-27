"use server";

import { TRPCError } from "@trpc/server";
import { headers } from "next/headers";
import { after } from "next/server";
import { auth } from "@/server/auth";
import {
  prepareSchoolOrder,
  SchoolOrderError,
  submitSchoolOrder,
} from "@/server/school-order";
import { getAppOriginFromHeaders } from "@/util/app-origin";
import { encryptPayload } from "@/util/crypto";
import { logger } from "@/util/logger";
import { sendOrderVerification } from "@/util/order/functions";
import { createOrderConfirmationEmail } from "@/util/order/templates/create-validation-order";
import { enforceProcedureRateLimit } from "@/util/rate-limit";
import { schoolOrderInput } from "@/util/school-order-input";

function getAddress(formData: FormData, prefix: "billing" | "shipping") {
  return Object.fromEntries(
    ["recipient", "extra", "street", "zip", "city", "country"].map((field) => [
      field,
      formData.get(`${prefix}.${field}`),
    ]),
  );
}

function actionError(error: unknown) {
  if (
    error instanceof SchoolOrderError ||
    (error instanceof TRPCError && error.code === "SERVICE_UNAVAILABLE")
  ) {
    return error.message;
  }
  if (error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS") {
    return "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.";
  }
  logger.error("school_order_failed", { error });
  return "Die Bestellung konnte nicht bearbeitet werden. Bitte versuchen Sie es erneut.";
}

export async function reviewSchoolOrder(
  bookId: string,
  preview: string,
  formData: FormData,
) {
  const [session, requestHeaders] = await Promise.all([auth(), headers()]);
  if (!session?.user) return { error: "Bitte melden Sie sich erneut an." };

  const billingAddress = getAddress(formData, "billing");
  const result = schoolOrderInput.safeParse({
    quantity: formData.get("quantity"),
    schoolName: formData.get("schoolName"),
    contactName: formData.get("contactName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    customerNote: formData.get("customerNote"),
    billingAddress,
    shippingAddress:
      formData.get("separateShipping") === "on"
        ? getAddress(formData, "shipping")
        : billingAddress,
  });
  if (!result.success) {
    return { error: "Bitte prüfen Sie Auflage, Kontakt und Adressen." };
  }

  try {
    enforceProcedureRateLimit(
      { headers: requestHeaders, session },
      {
        scope: "schoolOrder.review",
        windowMs: 10 * 60 * 1000,
        maxRequests: 30,
      },
    );
    return {
      review: await prepareSchoolOrder(
        session.user.id,
        bookId,
        preview,
        result.data,
      ),
    };
  } catch (error) {
    return { error: actionError(error) };
  }
}

export async function placeSchoolOrder(token: string, formData: FormData) {
  const [session, requestHeaders] = await Promise.all([auth(), headers()]);
  if (!session?.user) return { error: "Bitte melden Sie sich erneut an." };
  if (formData.get("confirmed") !== "on") {
    return { error: "Bitte bestätigen Sie die Bestelldaten." };
  }

  let order;
  try {
    enforceProcedureRateLimit(
      { headers: requestHeaders, session },
      {
        scope: "schoolOrder.submit",
        windowMs: 10 * 60 * 1000,
        maxRequests: 10,
      },
    );
    order = await submitSchoolOrder(session.user.id, token);
  } catch (error) {
    return { error: actionError(error) };
  }

  const { orderKey, email } = order;
  if (order.newOrder) {
    after(async () => {
      try {
        const html = await createOrderConfirmationEmail(
          orderKey,
          undefined,
          getAppOriginFromHeaders(requestHeaders),
        );
        await sendOrderVerification(
          email,
          "Schulplaner-Bestellung bestätigt – Pirrot",
          html,
        );
      } catch (error) {
        logger.error("school_order_confirmation_email_failed", {
          orderKey,
          error,
        });
      }
    });
  }

  const orderRef = encryptPayload({ orderKey });
  return {
    destination: `/payment/success?order_ref=${encodeURIComponent(orderRef)}&flow=school-invoice`,
  };
}
