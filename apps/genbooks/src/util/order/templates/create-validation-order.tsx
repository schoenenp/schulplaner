import { buildAppUrl, getConfiguredAppOrigin } from "@/util/app-origin";
import { encryptPayload } from "@/util/crypto";
import { formatDisplayDate } from "@/util/date";

export const createOrderConfirmationEmail = async (
  orderKey: string,
  customerName?: string,
  appOrigin = getConfiguredAppOrigin(),
) => {
  const orderDate = formatDisplayDate(new Date());

  const linkPayload = encryptPayload({ orderKey });
  const orderViewLink = buildAppUrl(appOrigin, `/order/view?pl=${linkPayload}`);
  const year = new Date().getFullYear();

  return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bestellung bestätigt - pirrot.de</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Baloo 2', Arial, sans-serif; background-color: #f8fafc; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
              <!-- Header -->
              <div style="background: linear-gradient(135deg, oklch(0.69 0.18 250), oklch(0.63 0.20 250)); padding: 40px 30px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      🎉 Bestellung bestätigt!
                  </h1>
                  <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
                      Vielen Dank für Ihre Bestellung bei Digitaldruck Pirrot GmbH
                  </p>
              </div>
  
              <!-- Main Content -->
              <div style="padding: 40px 30px;">
                  ${
                    customerName
                      ? `
                  <p style="color: oklch(0.35 0.04 250); font-size: 18px; margin: 0 0 20px 0;">
                      Hallo ${customerName},
                  </p>
                  `
                      : ""
                  }
                  
                  <p style="color: oklch(0.35 0.04 250); font-size: 16px; margin: 0 0 20px 0;">
                      Ihre Bestellung wurde erfolgreich erstellt und wird jetzt bearbeitet.
                  </p>
  
                  <!-- Order Details Box -->
                  <div style="background-color: oklch(0.97 0.02 250); border-left: 4px solid oklch(0.69 0.18 250); padding: 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
                      <h2 style="color: oklch(0.35 0.04 250); margin: 0 0 15px 0; font-size: 20px;">
                          📋 Bestelldetails
                      </h2>
                      <div style="margin-bottom: 10px;">
                          <strong style="color: oklch(0.35 0.04 250);">Bestellnummer:</strong>
                          <span style="color: oklch(0.69 0.18 250); font-weight: bold; font-size: 18px; margin-left: 10px;">
                              ${orderKey}
                          </span>
                      </div>
                      <div style="margin-bottom: 10px;">
                          <strong style="color: oklch(0.35 0.04 250);">Bestelldatum:</strong>
                          <span style="color: oklch(0.35 0.04 250); margin-left: 10px;">
                              ${orderDate}
                          </span>
                      </div>
                  </div>
  
                  <p style="color: oklch(0.35 0.04 250); font-size: 16px; margin: 0 0 20px 0;">
                      Wir werden Sie über den Status Ihrer Bestellung informieren, sobald sie versandt wird.
                  </p>
  
                  <!-- Action Button -->
                  <div style="text-align: center; margin: 30px 0;">
                      <a href="${orderViewLink}" style="display: inline-block; background: linear-gradient(135deg, oklch(0.69 0.18 250), oklch(0.63 0.20 250)); color: #ffffff; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                          📧 Bestellstatus verfolgen
                      </a>
                  </div>
  
                  <p style="color: oklch(0.35 0.04 250); font-size: 16px; margin: 0 0 20px 0;">
                      Falls Sie Fragen haben, zögern Sie nicht, uns zu kontaktieren.
                  </p>
              </div>
  
              <!-- Footer -->
              <div style="background-color: oklch(0.97 0.02 250); padding: 30px; text-align: center; border-top: 1px solid oklch(0.89 0.08 250);">
                  <p style="color: oklch(0.45 0.07 250); margin: 0 0 10px 0; font-size: 14px;">
                      Mit freundlichen Grüßen,
                  </p>
                  <p style="color: oklch(0.69 0.18 250); margin: 0; font-weight: bold; font-size: 16px;">
                      Ihr Pirrot Team
                  </p>
                  <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid oklch(0.89 0.08 250);">
                      <p style="color: oklch(0.45 0.07 250); margin: 0; font-size: 12px;">
                          © ${year} pirrot.de Alle Rechte vorbehalten.
                      </p>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;
};
