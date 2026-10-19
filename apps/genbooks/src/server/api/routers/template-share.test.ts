import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Session } from "next-auth";
import { createCallerFactory } from "@/server/api/trpc";
import { templateSharingFixture } from "@/test/template-sharing";
import { hashTemplateShareToken } from "@/util/template-share";

// Exercise the real invitation sender, replacing only the SMTP transport.
const emails: Array<{ to: string; html: string }> = [];
let acceptMail = true;
const createTransport = () => ({
  sendMail: async (mail: { to: string; html: string }) => {
    emails.push(mail);
    return {
      accepted: acceptMail ? [mail.to] : [],
      rejected: acceptMail ? [] : [mail.to],
    };
  },
});
mock.module("nodemailer", () => ({
  createTransport,
  default: { createTransport },
}));
const { templateShareRouter } = await import("./template-share");
const createCaller = createCallerFactory(templateShareRouter);
const school = {
  id: "school_1",
  email: "school@example.de",
  role: "USER" as const,
};
const staff = {
  id: "staff_1",
  email: "staff@example.de",
  role: "STAFF" as const,
};
let requestId = 0;

function fixture() {
  const f = templateSharingFixture();
  const asUser = (user: Session["user"] | null) =>
    createCaller({
      db: f.db as never,
      session: user ? { user, expires: "2099-01-01" } : null,
      headers: new Headers({
        host: "app.example.de",
        "x-forwarded-proto": "https",
        "x-forwarded-for": `203.0.113.${++requestId}`,
      }),
      config: { id: "test" },
    });
  return { ...f, asUser, sender: asUser(staff), recipient: asUser(school) };
}

beforeEach(() => {
  emails.length = 0;
  acceptMail = true;
});

describe("template sharing", () => {
  it("shares an owned template by link and preserves its planner content", async () => {
    const f = fixture();
    const link = await f.sender.createLink({ templateId: f.share.template.id });
    expect(link.shareUrl).toBe(
      `https://app.example.de/template/share?claim=${link.token}`,
    );
    expect(f.share.tokenHash).toBe(hashTemplateShareToken(link.token));
    const result = await f.recipient.claim({ token: link.token });
    expect(result).toMatchObject({ bookId: "book_1", alreadyClaimed: false });
    expect(f.db.book.create.mock.calls[0]?.[0].data).toMatchObject({
      createdById: school.id,
      sourceType: "TEMPLATE_SHARE",
      copyFromId: f.share.template.id,
      bookTitle: "Unser Schulplaner",
      planStart: f.share.template.planStart,
      planEnd: f.share.template.planEnd,
      format: "A5",
      region: "SL",
      country: "DE",
      clientRef: "pirrot",
      customDates: { create: f.share.template.customDates },
      modules: {
        create: [
          {
            idx: 0,
            moduleId: "module_1",
            colorCode: "COLOR",
            locations: { connect: [{ id: "school_location" }] },
          },
        ],
      },
    });
  });

  it("emails only the invited address, with an escaped template name and a working link", async () => {
    const f = fixture();
    f.share.template.name = '<Math & "Art">';
    await f.sender.sendInvite({
      templateId: f.share.template.id,
      email: " School@Example.DE ",
    });
    expect(emails).toHaveLength(1);
    const mail = emails[0]!;
    expect(mail.to).toBe(school.email);
    expect(mail).not.toHaveProperty("bcc");
    expect(mail).not.toHaveProperty("cc");
    expect(mail.html).toContain("&lt;Math &amp; &quot;Art&quot;&gt;");
    const url = new URL(mail.html.match(/href="([^"]+)"/)![1]!);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://app.example.de/template/share",
    );
    expect(
      await f.recipient.claim({ token: url.searchParams.get("claim")! }),
    ).toMatchObject({ bookId: "book_1" });
  });

  it("revokes the invitation when SMTP rejects its recipient", async () => {
    const f = fixture();
    acceptMail = false;
    await expect(
      f.sender.sendInvite({
        templateId: f.share.template.id,
        email: school.email,
      }),
    ).rejects.toThrow("nicht versendet");
    expect(f.share.revokedAt).toBeInstanceOf(Date);
    expect(f.books).toHaveLength(0);
  });

  it.each([school, { ...staff, id: "another_staff" }])(
    "rejects sharing by an unauthorized sender: $id",
    async (user) => {
      const f = fixture();
      await expect(
        f.asUser(user).createLink({ templateId: f.share.template.id }),
      ).rejects.toThrow();
      expect(f.db.templateShare.create).not.toHaveBeenCalled();
    },
  );

  it("masks the recipient and refuses claims by guests or a different account", async () => {
    const f = fixture();
    const guest = f.asUser(null);
    expect(await guest.getShare({ token: f.token })).toMatchObject({
      recipientEmail: "sc***l@example.de",
      recipientMatchesSession: null,
      existingBookId: null,
    });
    await expect(guest.claim({ token: f.token })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const wrongAccount = f.asUser({ ...school, email: "other@example.de" });
    expect(await wrongAccount.getShare({ token: f.token })).toMatchObject({
      recipientMatchesSession: false,
      existingBookId: null,
    });
    await expect(wrongAccount.claim({ token: f.token })).rejects.toThrow(
      "andere E-Mail-Adresse",
    );
    expect(f.books).toHaveLength(0);
  });

  it("reopens the same owned planner after expiry and deletion of the original template", async () => {
    const f = fixture();
    await f.recipient.claim({ token: f.token });
    f.share.expiresAt = new Date(0);
    f.share.template.deletedAt = new Date();
    expect(await f.recipient.getShare({ token: f.token })).toMatchObject({
      existingBookId: "book_1",
    });
    expect(await f.recipient.claim({ token: f.token })).toMatchObject({
      bookId: "book_1",
      alreadyClaimed: true,
    });
    expect(f.books).toHaveLength(1);
    await expect(
      f.asUser({ ...school, id: "another_user" }).getShare({ token: f.token }),
    ).rejects.toThrow("abgelaufen");
  });

  it.each(["expired", "revoked", "deleted"])(
    "rejects new claims when the invitation is %s",
    async (reason) => {
      const f = fixture();
      if (reason === "expired") f.share.expiresAt = new Date(0);
      if (reason === "revoked") f.share.revokedAt = new Date();
      if (reason === "deleted") f.share.template.deletedAt = new Date();
      await expect(f.recipient.claim({ token: f.token })).rejects.toThrow();
      expect(f.books).toHaveLength(0);
    },
  );

  it("replaces a deleted copy using the existing claim", async () => {
    const f = fixture();
    await f.recipient.claim({ token: f.token });
    f.books[0]!.deletedAt = new Date();
    expect(await f.recipient.claim({ token: f.token })).toMatchObject({
      bookId: "book_2",
      alreadyClaimed: false,
    });
    expect(f.share.claims).toHaveLength(1);
    expect(f.share.claims[0]?.book?.id).toBe("book_2");
  });

  it("recovers the existing copy when a concurrent claim wins", async () => {
    const f = fixture();
    await f.recipient.claim({ token: f.token });
    f.state.transactionError = Object.assign(new Error("Concurrent claim"), {
      code: "P2002",
    });
    expect(await f.recipient.claim({ token: f.token })).toMatchObject({
      bookId: "book_1",
      alreadyClaimed: true,
    });
    expect(f.books).toHaveLength(1);
  });

  it("does not transfer a consumed invitation to a second account", async () => {
    const f = fixture();
    await f.recipient.claim({ token: f.token });
    await expect(
      f.asUser({ ...school, id: "another_user" }).claim({ token: f.token }),
    ).rejects.toThrow("bereits beansprucht");
    expect(f.books).toHaveLength(1);
  });
});
