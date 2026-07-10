import type { DateItem } from "./types";

export interface HolidayQuery {
  code?: string;
  country?: string;
  start: Date;
  end: Date;
}

export type HolidayProvider = (query: HolidayQuery) => Promise<DateItem[]>;

let activeProvider: HolidayProvider | undefined;

/**
 * Apps inject their holiday lookup here (both apps ship an openholidaysapi
 * client). The planner handler only calls it when a book enables holidays.
 */
export function setHolidayProvider(provider: HolidayProvider): void {
  activeProvider = provider;
}

export async function getHolidays(query: HolidayQuery): Promise<DateItem[]> {
  if (!activeProvider) {
    throw new Error(
      "pdf-pipeline: no holiday provider configured. Import the pipeline " +
        "through your app's @/util/pdf wrapper, which calls setHolidayProvider.",
    );
  }
  return activeProvider(query);
}
