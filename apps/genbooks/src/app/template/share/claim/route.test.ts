import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NextRequest } from "next/server";

import { hashTemplateShareToken } from "@/util/template-share";

type RouteTestDb = {
  templateShare: {
    findUnique: (args: unknown) => Promise<unknown>;
  };
  user: {
    upsert: (args: unknown) => Promise<{ id: string; email: string | null }>;
  };
  session: {
    create: (args: unknown) => Promise<{ id: string }>;
  };
  $transaction: (
    callback: (tx: unknown) => Promise<unknown>,
  ) => Promise<unknown>;
};

const db = {} as RouteTestDb;

mock.module("@/server/db", () => ({
  db,
}));

const { GET } = await import("./route");

function createRequest(url: string) {
  return new NextRequest(url, {
    headers: {
      host: "app.example.de",
      "x-forwarded-proto": "https",
    },
  });
}

describe("/template/share/claim route", () => {
  beforeEach(() => {
    db.templateShare = {
      findUnique: async () => ({
        kind: "INVITE",
        recipientEmail: "School@Example.DE",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        template: {
          isTemplate: true,
          deletedAt: null,
        },
      }),
    };
    db.user = {
      upsert: async () => ({ id: "user_1", email: "school@example.de" }),
    };
    db.session = {
      create: async () => ({ id: "session_1" }),
    };
    db.$transaction = async (callback) =>
      callback({
        templateShare: {
          findUnique: async () => ({
            id: "share_1",
            kind: "INVITE",
            recipientEmail: "school@example.de",
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: null,
            template: {
              id: "template_1",
              name: "Mathe Vorlage",
              bookTitle: "Mathe Planer",
              subTitle: null,
              format: "A4",
              region: "BE",
              planStart: new Date("2026-09-01T00:00:00.000Z"),
              planEnd: new Date("2027-07-31T00:00:00.000Z"),
              country: "DE",
              isTemplate: true,
              deletedAt: null,
              modules: [{ idx: 0, moduleId: "module_1", colorCode: "COLOR" }],
            },
            claims: [],
          }),
        },
        templateShareClaim: {
          findFirst: async () => null,
          create: async () => ({ id: "claim_1" }),
        },
        book: {
          create: async () => ({ id: "book_1" }),
        },
      });
  });

  it("redirects missing tokens back to the share page", async () => {
    const response = await GET(
      createRequest("https://app.example.de/template/share/claim"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.de/template/share?error=missing-token",
    );
  });

  it("claims a valid invite, creates an auth session, and redirects to dashboard", async () => {
    let initialLookupHash = "";
    let upsertArgs: unknown;
    let sessionCreateArgs: unknown;

    db.templateShare.findUnique = async (args: unknown) => {
      const { where } = args as { where: { tokenHash: string } };
      initialLookupHash = where.tokenHash;
      return {
        kind: "INVITE",
        recipientEmail: "School@Example.DE",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        template: {
          isTemplate: true,
          deletedAt: null,
        },
      };
    };
    db.user.upsert = async (args: unknown) => {
      upsertArgs = args;
      return { id: "user_1", email: "school@example.de" };
    };
    db.session.create = async (args: unknown) => {
      sessionCreateArgs = args;
      return { id: "session_1" };
    };

    const response = await GET(
      createRequest(
        "https://app.example.de/template/share/claim?token=token_1",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.de/dashboard?claimedTemplate=book_1",
    );
    expect(initialLookupHash).toBe(hashTemplateShareToken("token_1"));
    expect(upsertArgs).toMatchObject({
      where: { email: "school@example.de" },
      create: { email: "school@example.de" },
    });
    expect(sessionCreateArgs).toMatchObject({
      data: {
        userId: "user_1",
      },
    });
    expect(response.headers.get("set-cookie")).toContain(
      "__Secure-authjs.session-token=",
    );
  });
});
