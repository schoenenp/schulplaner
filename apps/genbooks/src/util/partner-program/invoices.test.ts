import { describe, expect, it } from "bun:test";
import {
  buildPartnerIssuerSnapshot,
  getEInvoiceCompatibilityPath,
  getInvoiceCountryPath,
} from "./invoices";

describe("partner invoice snapshot builder", () => {
  it("maps country-specific invoice paths", () => {
    expect(getInvoiceCountryPath("DE")).toBe("DE");
    expect(getInvoiceCountryPath("AT")).toBe("AT");
    expect(getInvoiceCountryPath("FR")).toBe("EU");
  });

  it("maps e-invoice compatibility by country path", () => {
    expect(getEInvoiceCompatibilityPath("DE")).toBe("DE_XRECHNUNG_ZUGFERD_PREP");
    expect(getEInvoiceCompatibilityPath("AT")).toBe("AT_EBINTERFACE_PREP");
    expect(getEInvoiceCompatibilityPath("EU")).toBe("EU_GENERIC_PREP");
  });

  it("builds issuer snapshot with legal footer", () => {
    const snapshot = buildPartnerIssuerSnapshot({
      partnerUserId: "partner_1",
      partnerName: "Partner GmbH",
      partnerEmail: "partner@example.at",
      schoolCountry: "AT",
      confirmedAt: "2026-03-07T12:00:00.000Z",
    });

    expect(snapshot.partnerUserId).toBe("partner_1");
    expect(snapshot.legalFooter).toContain("Digitaldruck Pirrot GmbH");
    expect(snapshot.invoiceCountryPath).toBe("AT");
  });
});
