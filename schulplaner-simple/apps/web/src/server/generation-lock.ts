import "server-only";

/**
 * One PDF generation at a time per key (user or order). Generation is CPU-
 * and memory-heavy; repeated clicks should wait for the running one.
 */
const running = new Set<string>();

export async function withGenerationLock<T>(key: string, task: () => Promise<T>) {
  if (running.has(key)) return { busy: true as const };
  running.add(key);
  try {
    return { busy: false as const, value: await task() };
  } finally {
    running.delete(key);
  }
}
