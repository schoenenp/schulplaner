import { mock } from "bun:test";
import { hashTemplateShareToken } from "@/util/template-share";

type Copy = {
  id: string;
  createdById: string;
  sourceType: "TEMPLATE_SHARE";
  deletedAt: Date | null;
};
type Claim = { id: string; userId: string; book: Copy | null };
type ClaimData = { userId: string; bookId: string; email: string };
type ClaimFilter = { claims?: { where: { userId: string } } };

// Shared persistence fixture for the API and real Auth.js handoff tests.
// It models ownership/claims; SMTP, routing and claim logic stay real.
export function templateSharingFixture(email = "school@example.de") {
  const token = "test-template-token";
  const share = {
    id: "share_1",
    kind: "INVITE" as "LINK" | "INVITE",
    recipientEmail: email as string | null,
    tokenHash: hashTemplateShareToken(token),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null as Date | null,
    template: {
      id: "template_1",
      createdById: "staff_1",
      name: "Schulplaner",
      bookTitle: "Unser Schulplaner",
      subTitle: "Klasse 7",
      format: "A5",
      region: "SL",
      country: "DE",
      clientRef: "pirrot",
      planStart: new Date("2026-09-01"),
      planEnd: new Date("2027-07-31"),
      isTemplate: true,
      deletedAt: null as Date | null,
      customDates: [{ name: "Schulfest", date: new Date("2026-09-18") }],
      modules: [
        {
          idx: 0,
          moduleId: "module_1",
          colorCode: "COLOR",
          locations: [{ id: "school_location" }],
        },
      ],
    },
    claims: [] as Claim[],
  };
  const books: Copy[] = [];
  const state = { transactionError: null as Error | null };
  const tx = {
    templateShare: {
      create: mock(async ({ data }: { data: Partial<typeof share> }) => {
        Object.assign(share, data);
        return share;
      }),
      update: mock(async ({ data }: { data: Partial<typeof share> }) => {
        Object.assign(share, data);
        return share;
      }),
      findUnique: async ({
        where,
        include,
        select,
      }: {
        where: { tokenHash: string };
        include?: ClaimFilter;
        select?: ClaimFilter;
      }) =>
        where.tokenHash === share.tokenHash
          ? {
              ...share,
              claims: share.claims.filter(
                (claim) =>
                  claim.userId === (include ?? select)?.claims?.where.userId,
              ),
            }
          : null,
    },
    book: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; createdById: string };
      }) =>
        where.id === share.template.id &&
        where.createdById === share.template.createdById
          ? share.template
          : null,
      create: mock(
        async ({
          data,
        }: {
          data: Record<string, unknown> &
            Pick<Copy, "createdById" | "sourceType">;
        }) => {
          const book: Copy = {
            ...data,
            id: `book_${books.length + 1}`,
            deletedAt: null,
          };
          books.push(book);
          return book;
        },
      ),
    },
    templateShareClaim: {
      findFirst: async () => share.claims[0] ?? null,
      create: mock(async ({ data }: { data: ClaimData }) => {
        const claim = {
          id: `claim_${share.claims.length + 1}`,
          userId: data.userId,
          book: books.find((book) => book.id === data.bookId) ?? null,
        };
        share.claims.push(claim);
        return claim;
      }),
      update: mock(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Pick<ClaimData, "bookId" | "email">;
        }) => {
          const claim = share.claims.find((claim) => claim.id === where.id)!;
          claim.book = books.find((book) => book.id === data.bookId) ?? null;
          return claim;
        },
      ),
    },
  };
  const db = {
    ...tx,
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => {
      if (state.transactionError) throw state.transactionError;
      return fn(tx);
    },
  };
  return { token, share, books, state, db };
}
