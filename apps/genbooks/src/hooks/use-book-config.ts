import { api } from "@/trpc/react";

export function useBookConfig(bookId?: string) {
    const [configInitData] = api.config.init.useSuspenseQuery({
      bookId: bookId ?? "",
    })

    const dummyInit = {
      modules: [],
      tips: [],
      types: [],
      book: null,
    }
    return configInitData ?? dummyInit;
  }
  