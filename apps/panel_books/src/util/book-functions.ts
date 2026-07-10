import { logger } from "@/util/logger";

export type DateItem = {
  id: string;
  name: string;
  date: string;
};

// Format to YYYY-MM-DD
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type HolidayName = {
  language: string;
  text: string;
};

export type Holiday = {
  id: string;
  startDate: string;
  endDate: string;
  type: "Public";
  name: HolidayName[];
  regionalScope: "Regional" | "National";
  temporalScope: "FullDay";
  nationwide: boolean;
};

export async function getHolidays(input: {
  code?: string;
  country?: string;
  start: Date;
  end: Date;
}): Promise<DateItem[]> {
  const { code, country, start, end } = input;
  const periodStart = formatDate(start);
  const periodEnd = formatDate(end);
  const countryCode = country ?? "DE";
  const subdivisionCode = code ?? `${countryCode}-SL`;

  const holidaysLink = `https://openholidaysapi.org/PublicHolidays?countryIsoCode=${countryCode}&validFrom=${periodStart}&validTo=${periodEnd}&languageIsoCode=DE&subdivisionCode=${subdivisionCode}`;

  const schoolHolidaysLink = `https://openholidaysapi.org/SchoolHolidays?countryIsoCode=${countryCode}&validFrom=${periodStart}&validTo=${periodEnd}&languageIsoCode=DE&subdivisionCode=${subdivisionCode}`;

  const holidaysData: DateItem[] = [];

  try {
    const holidaysRes = await fetch(holidaysLink);
    if (!holidaysRes.ok) {
      throw new Error(`HTTP error! status: ${holidaysRes.status}`);
    }

    const data = (await holidaysRes.json()) as Holiday[];
    for (const day of data) {
      const name =
        day.name.find((d) => d.language === "DE")?.text ?? "Feiertag";
      const holidayItem = {
        id: day.id,
        name,
        date: day.startDate,
      };
      holidaysData.push(holidayItem);
    }
  } catch (err) {
    logger.warn("failed_to_fetch_public_holidays", {
      countryCode,
      subdivisionCode,
      error: err,
    });
    return [];
  }

  try {
    const schoolHolidaysRes = await fetch(schoolHolidaysLink);
    if (!schoolHolidaysRes.ok) {
      throw new Error(`HTTP error! status: ${schoolHolidaysRes.status}`);
    }

    const schoolsData = (await schoolHolidaysRes.json()) as Holiday[];
    for (const day of schoolsData) {
      const name =
        day.name.find((d) => d.language === "DE")?.text ?? "Schulferien";

      const startItem = {
        id: day.id,
        name: `${name} Start`,
        date: day.startDate,
      };

      holidaysData.push(startItem);
      const endItem = {
        id: day.id,
        name: `${name} Ende`,
        date: day.endDate,
      };
      holidaysData.push(endItem);
    }
  } catch (err) {
    logger.warn("failed_to_fetch_school_holidays", {
      countryCode,
      subdivisionCode,
      error: err,
    });
    return [];
  }

  return holidaysData;
}
