export function templateSharePath(token: string) {
  return `/template/share?claim=${encodeURIComponent(token)}`;
}

export function claimedPlannerPath(bookId: string) {
  return `/config?bookId=${encodeURIComponent(bookId)}`;
}

export function templateSignInPath(token: string) {
  return `/auth/signin?callbackUrl=${encodeURIComponent(templateSharePath(token))}`;
}
