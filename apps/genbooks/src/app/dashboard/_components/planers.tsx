"use client";
import { api } from "@/trpc/react";
import LoadingSpinner from "@/app/_components/loading-spinner";

import {
  BookOpenText,
  ClipboardCopy,
  LoaderCircle,
  Mail,
  PencilLine,
  PlusIcon,
  Send,
  TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { ToggleSwitch } from "@/app/_components/toggle-switch";
import { DashboardEmptyState } from "./dashboard-states";
import { useState } from "react";

export default function PlanerSection() {
  const utils = api.useUtils();
  const [userBooks] = api.book.getUserBooks.useSuspenseQuery();
  const { data: userData } = api.user.getMyRole.useQuery();
  const [pendingDeleteBookId, setPendingDeleteBookId] = useState<string | null>(
    null,
  );
  const [pendingToggleBookId, setPendingToggleBookId] = useState<string | null>(
    null,
  );
  const [pendingShareBookId, setPendingShareBookId] = useState<string | null>(
    null,
  );
  const [pendingInviteBookId, setPendingInviteBookId] = useState<string | null>(
    null,
  );
  const [shareLinksByBookId, setShareLinksByBookId] = useState<
    Record<string, string>
  >({});
  const [inviteEmailsByBookId, setInviteEmailsByBookId] = useState<
    Record<string, string>
  >({});
  const [shareFeedbackByBookId, setShareFeedbackByBookId] = useState<
    Record<string, string>
  >({});

  const deleteBook = api.book.delete.useMutation({
    onMutate: ({ bookId }) => {
      setPendingDeleteBookId(bookId);
    },
    onSuccess: async () => {
      await utils.book.getUserBooks.invalidate();
    },
    onSettled: () => {
      setPendingDeleteBookId(null);
    },
  });
  const toggleTemplate = api.book.toggleTemplate.useMutation({
    onMutate: ({ bookId }) => {
      setPendingToggleBookId(bookId);
    },
    onSuccess: async () => {
      await utils.book.getUserBooks.invalidate();
    },
    onSettled: () => {
      setPendingToggleBookId(null);
    },
  });
  const togglePublic = api.book.togglePublic.useMutation({
    onMutate: ({ bookId }) => {
      setPendingToggleBookId(bookId);
    },
    onSuccess: async () => {
      await utils.book.getUserBooks.invalidate();
    },
    onSettled: () => {
      setPendingToggleBookId(null);
    },
  });
  const createShareLink = api.templateShare.createLink.useMutation({
    onMutate: ({ templateId }) => {
      setPendingShareBookId(templateId);
      setShareFeedbackByBookId((current) => ({
        ...current,
        [templateId]: "Link wird erstellt...",
      }));
    },
    onSuccess: async (data, variables) => {
      setShareLinksByBookId((current) => ({
        ...current,
        [variables.templateId]: data.shareUrl,
      }));
      await copyShareLink(variables.templateId, data.shareUrl);
    },
    onError: (error, variables) => {
      setShareFeedbackByBookId((current) => ({
        ...current,
        [variables.templateId]: error.message,
      }));
    },
    onSettled: () => {
      setPendingShareBookId(null);
    },
  });
  const sendTemplateInvite = api.templateShare.sendInvite.useMutation({
    onMutate: ({ templateId }) => {
      setPendingInviteBookId(templateId);
      setShareFeedbackByBookId((current) => ({
        ...current,
        [templateId]: "Einladung wird gesendet...",
      }));
    },
    onSuccess: (data, variables) => {
      setInviteEmailsByBookId((current) => ({
        ...current,
        [variables.templateId]: "",
      }));
      setShareFeedbackByBookId((current) => ({
        ...current,
        [variables.templateId]: `Einladung gesendet an ${data.email}.`,
      }));
    },
    onError: (error, variables) => {
      setShareFeedbackByBookId((current) => ({
        ...current,
        [variables.templateId]: error.message,
      }));
    },
    onSettled: () => {
      setPendingInviteBookId(null);
    },
  });

  function handleDeleteBook(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const deletedBookId = event.currentTarget.id;
    deleteBook.mutate({ bookId: deletedBookId });
  }

  const handleToggle = (id: string, checked: boolean) => {
    toggleTemplate.mutate({ bookId: id, isTemplate: checked });
  };

  const handleTogglePublic = (id: string, checked: boolean) => {
    togglePublic.mutate({ bookId: id, isPublic: checked });
  };

  async function copyShareLink(bookId: string, shareUrl: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setShareFeedbackByBookId((current) => ({
        ...current,
        [bookId]: "Link erstellt. Bitte manuell kopieren.",
      }));
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareFeedbackByBookId((current) => ({
        ...current,
        [bookId]: "Link wurde in die Zwischenablage kopiert.",
      }));
    } catch {
      setShareFeedbackByBookId((current) => ({
        ...current,
        [bookId]: "Link erstellt. Bitte manuell kopieren.",
      }));
    }
  }

  function updateInviteEmail(bookId: string, email: string) {
    setInviteEmailsByBookId((current) => ({
      ...current,
      [bookId]: email,
    }));
  }

  function handleSendInvite(
    event: React.FormEvent<HTMLFormElement>,
    templateId: string,
  ) {
    event.preventDefault();
    const email = (inviteEmailsByBookId[templateId] ?? "").trim();
    if (!templateId || !email) {
      return;
    }
    sendTemplateInvite.mutate({ templateId, email });
  }

  const isStaff =
    userData?.role === "ADMIN" ||
    userData?.role === "STAFF" ||
    userData?.role === "MODERATOR";

  return (
    <div className="content-card rise-in relative flex flex-1 flex-col gap-4 p-4 lg:min-h-96">
      <h2 className="text-2xl font-bold uppercase">Planer</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <Link
          href="/#planer-erstellen"
          aria-label="Neuen Planer erstellen"
          title="Neuen Planer erstellen"
          className="content-card text-pirrot-blue-500 hover:text-pirrot-blue-700 flex min-h-48 cursor-pointer items-center justify-center gap-3 p-1 max-md:min-h-16 max-md:justify-start max-md:px-4 max-md:py-3"
        >
          <PlusIcon className="size-8" />
          <span className="text-info-900 font-bold md:hidden">
            Neuen Planer erstellen
          </span>
        </Link>
        {userBooks.map((book, index) => {
          const isDeletingThisBook =
            deleteBook.isPending && pendingDeleteBookId === book.id;
          const isTogglingThisBook =
            toggleTemplate.isPending && pendingToggleBookId === book.id;
          const isCreatingShareLink =
            createShareLink.isPending && pendingShareBookId === book.id;
          const isSendingInvite =
            sendTemplateInvite.isPending && pendingInviteBookId === book.id;
          const shareLink = shareLinksByBookId[book.id] ?? "";
          const inviteEmail = inviteEmailsByBookId[book.id] ?? "";
          const shareFeedback = shareFeedbackByBookId[book.id];
          return (
            <div
              className="field-shell stagger-item flex min-h-48 flex-col p-3 max-md:min-h-0"
              key={book.id}
              style={{ animationDelay: `${(index + 1) * 60}ms` }}
            >
              <Link
                className="text-info-900 hover:text-pirrot-blue-700 font-bold max-md:text-lg"
                href={`/config?bookId=${book.id}`}
              >
                {book.name ?? book.bookTitle ?? "Schulplaner"}
              </Link>

              {/* Template Toggle */}
              {isStaff && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-pirrot-blue-950 text-xs font-bold uppercase">
                    Template
                  </span>
                  <ToggleSwitch
                    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
                    checked={(book as any).isTemplate}
                    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
                    onChange={(checked) => handleToggle(book.id, checked)}
                    disabled={isTogglingThisBook}
                  />
                  {isTogglingThisBook && (
                    <LoaderCircle className="text-info-700 size-4 animate-spin" />
                  )}
                </div>
              )}

              {/* Public Toggle - only show for templates */}
              {isStaff && book.isTemplate && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-pirrot-blue-950 text-xs font-bold uppercase">
                    Öffentlich
                  </span>
                  <ToggleSwitch
                    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
                    checked={(book as any).isPublic}
                    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
                    onChange={(checked) => handleTogglePublic(book.id, checked)}
                    disabled={isTogglingThisBook}
                  />
                  {isTogglingThisBook && (
                    <LoaderCircle className="text-info-700 size-4 animate-spin" />
                  )}
                </div>
              )}

              {isStaff && book.isTemplate && (
                <div className="border-pirrot-blue-300/30 bg-pirrot-blue-50/40 mt-3 flex flex-col gap-2 rounded border p-2">
                  <p className="text-pirrot-blue-950 text-xs font-bold uppercase">
                    Teilen
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      createShareLink.mutate({ templateId: book.id })
                    }
                    disabled={isCreatingShareLink}
                    className="btn-soft inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs uppercase disabled:cursor-not-allowed disabled:opacity-60 max-md:min-h-11"
                  >
                    {isCreatingShareLink ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <ClipboardCopy className="size-4" />
                    )}
                    Link erstellen
                  </button>
                  {shareLink ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="text"
                        value={shareLink}
                        readOnly
                        className="field-shell min-w-0 flex-1 px-2 py-1 text-xs"
                        aria-label="Template-Link"
                      />
                      <button
                        type="button"
                        onClick={() => void copyShareLink(book.id, shareLink)}
                        className="btn-soft inline-flex size-9 shrink-0 items-center justify-center rounded-md max-md:size-11"
                        aria-label="Template-Link kopieren"
                        title="Template-Link kopieren"
                      >
                        <ClipboardCopy className="size-4" />
                      </button>
                    </div>
                  ) : null}
                  <form
                    onSubmit={(event) => handleSendInvite(event, book.id)}
                    className="flex min-w-0 flex-col gap-2"
                  >
                    <label
                      htmlFor={`template-invite-${book.id}`}
                      className="text-pirrot-blue-950 text-xs font-semibold"
                    >
                      Einladung per E-Mail
                    </label>
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Mail className="text-info-700 absolute top-1/2 left-2 size-4 -translate-y-1/2" />
                        <input
                          id={`template-invite-${book.id}`}
                          name="email"
                          type="email"
                          value={inviteEmail}
                          onChange={(event) =>
                            updateInviteEmail(book.id, event.target.value)
                          }
                          placeholder="email@schule.de"
                          className="field-shell w-full min-w-0 py-2 pr-2 pl-8 text-xs"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isSendingInvite || !inviteEmail.trim()}
                        className="btn-soft inline-flex size-9 shrink-0 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-60 max-md:size-11"
                        aria-label="Einladung senden"
                        title="Einladung senden"
                      >
                        {isSendingInvite ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                      </button>
                    </div>
                  </form>
                  {shareFeedback ? (
                    <p className="text-info-700 text-xs">{shareFeedback}</p>
                  ) : null}
                </div>
              )}

              <div className="mt-auto flex gap-2 max-md:mt-3">
                <Link
                  className="btn-soft flex items-center justify-center rounded-md px-3 text-xs uppercase max-md:hidden"
                  href={`/config?bookId=${book.id}`}
                >
                  Bearbeiten
                </Link>
                <Link
                  className="btn-solid flex min-h-11 flex-1 items-center justify-center gap-2 px-4 md:hidden"
                  href={`/config?bookId=${book.id}`}
                >
                  <PencilLine className="size-4" />
                  Weiter bearbeiten
                </Link>
                <button
                  type="button"
                  disabled={isDeletingThisBook}
                  id={book.id}
                  onClick={handleDeleteBook}
                  className="btn-soft cursor-pointer rounded-md px-3 py-1 text-xs uppercase max-md:flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center"
                >
                  {isDeletingThisBook ? <LoadingSpinner /> : <TrashIcon />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {userBooks.length === 0 ? (
        <DashboardEmptyState
          icon={BookOpenText}
          title="Noch keine Planer"
          description="Erstellen Sie Ihren ersten Planer und bearbeiten Sie ihn später hier im Dashboard."
          actionHref="/"
          actionLabel="Planer erstellen"
        />
      ) : null}
    </div>
  );
}
