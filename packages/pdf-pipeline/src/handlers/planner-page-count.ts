type PlannerPageCountInput = {
  periodStart?: Date;
  periodEnd?: Date;
  previewMode: boolean;
  currentPageCount: number;
  now?: Date;
};

export function estimatePlannerPageCount(input: PlannerPageCountInput): number {
  const currentDate = input.now ? new Date(input.now) : new Date();
  const nextYearsDate = new Date(currentDate);
  nextYearsDate.setFullYear(currentDate.getFullYear() + 1);

  const startTime = input.periodStart
    ? new Date(input.periodStart)
    : new Date(currentDate);
  startTime.setDate(startTime.getDate() - 7);

  const endTime = input.periodEnd ? new Date(input.periodEnd) : new Date(nextYearsDate);

  const diffTime = Math.abs(endTime.getTime() - startTime.getTime());
  const totalWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
  const weeksToProcess = input.previewMode
    ? Math.min(totalWeeks + 1, 4)
    : totalWeeks + 1;

  let pagesAdded = 0;
  let workingPageCount = input.currentPageCount;

  for (let weekIndex = 0; weekIndex < weeksToProcess; weekIndex++) {
    if (workingPageCount % 2 === 0) {
      pagesAdded += 1;
      workingPageCount += 1;
    }
    pagesAdded += 2;
    workingPageCount += 2;
  }

  return pagesAdded;
}
