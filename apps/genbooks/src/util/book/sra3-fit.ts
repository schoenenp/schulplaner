const SRA3 = { width: 450, height: 320 } as const;

interface Dimensions {
  x: number;
  y: number;
}

interface OrientationDetails {
  count: number;
  fitsX: number;
  fitsY: number;
  description: string;
}

interface WasteArea {
  normal: number;
  rotated: number;
  best: number;
}

interface FitResult {
  count: number;
  orientation?: 'normal' | 'rotated';
  details?: {
    normal: OrientationDetails;
    rotated: OrientationDetails;
  };
  wasteArea?: WasteArea;
  error?: string;
}

function calculateSRA3Fit(dimensions: Dimensions): FitResult {
  const { x, y } = dimensions;
  
  if (!x || !y || x <= 0 || y <= 0) {
    return { 
      count: 0, 
      error: "Invalid dimensions. Both x and y must be positive numbers." 
    };
  }
  
  if (
       (x > SRA3.width && x > SRA3.height)
    || (y > SRA3.width && y > SRA3.height)
  ){
    return { 
      count: 0, 
      error: "Dimensions too large for SRA3 sheet." 
    };
  }
  
  const fit1X: number = Math.floor(SRA3.width / x);
  const fit1Y: number = Math.floor(SRA3.height / y);
  const count1: number = fit1X * fit1Y;
  
  const fit2X: number = Math.floor(SRA3.height / x);
  const fit2Y: number = Math.floor(SRA3.width / y);
  const count2: number = fit2X * fit2Y;
  
  const maxCount: number = Math.max(count1, count2);
  const bestOrientation: 'normal' | 'rotated' = count1 >= count2 ? 'normal' : 'rotated';
  
  const totalSRA3Area: number = SRA3.width * SRA3.height;
  const itemArea: number = x * y;
  
  const wasteArea: WasteArea = {
    normal: totalSRA3Area - (count1 * itemArea),
    rotated: totalSRA3Area - (count2 * itemArea),
    best: totalSRA3Area - (maxCount * itemArea)
  };
  
  return {
    count: maxCount,
    orientation: bestOrientation,
    details: {
      normal: {
        count: count1,
        fitsX: fit1X,
        fitsY: fit1Y,
        description: `${fit1X} × ${fit1Y} (${x}mm × ${y}mm on ${SRA3.width}mm × ${SRA3.height}mm)`
      },
      rotated: {
        count: count2,
        fitsX: fit2X,
        fitsY: fit2Y,
        description: `${fit2X} × ${fit2Y} (${x}mm × ${y}mm rotated on ${SRA3.width}mm × ${SRA3.height}mm)`
      }
    },
    wasteArea
  };
}

function quickFit(x: number, y: number): number {
  return calculateSRA3Fit({ x, y }).count;
}

function calculateEfficiency(dimensions: Dimensions): number {
  const result = calculateSRA3Fit(dimensions);
  if (result.count === 0 || !result.wasteArea) return 0;
  
  const totalArea = SRA3.width * SRA3.height;
  const usedArea = totalArea - result.wasteArea.best;
  return Math.round((usedArea / totalArea) * 100 * 100) / 100;
}

interface CostAnalysisArgs {
  pagesPerBook: number;
  numberOfBooks: number;
  pageDimensions: Dimensions;
  costPerSheet?: number;
  // Other costs can be added for a more detailed quote
  bindingCostPerBook?: number;
  coverCostPerBook?: number;
  isDuplex?: boolean;
}

function getFullCostAnalysis(args: CostAnalysisArgs) {
    const {
        pagesPerBook,
        numberOfBooks,
        pageDimensions,
        costPerSheet = 0.3, // Example cost, adjust as needed
        bindingCostPerBook = 0,
        coverCostPerBook = 0,
        isDuplex = true, // Books are typically printed on both sides
    } = args;

    // 1. Analyze how many pages fit on a single SRA3 sheet
    const fitAnalysis = getDetailedAnalysis(pageDimensions, costPerSheet);
    if (fitAnalysis.count === 0) {
        return { error: "Page dimensions do not fit on SRA3 sheet." };
    }

    // If printing duplex, one SRA3 sheet yields twice the number of pages
    const pagesPerSRA3Sheet = fitAnalysis.count * (isDuplex ? 2 : 1);

    // 2. Calculate total pages and sheets needed for the entire job
    const totalPages = pagesPerBook * numberOfBooks;
    const totalSRA3Sheets = Math.ceil(totalPages / pagesPerSRA3Sheet);

    // 3. Calculate cost breakdown
    const totalInteriorCost = totalSRA3Sheets * costPerSheet;
    const totalBindingCost = numberOfBooks * bindingCostPerBook;
    const totalCoverCost = numberOfBooks * coverCostPerBook;
    
    const grandTotalCost = totalInteriorCost + totalBindingCost + totalCoverCost;
    const finalCostPerBook = grandTotalCost / numberOfBooks;

    // 4. Assemble the comprehensive report
    return {
        inputs: { ...args },
        fitAnalysis: {
            ...fitAnalysis,
            pagesPerSRA3Sheet
        },
        jobTotals: {
            totalPages,
            totalSRA3Sheets,
        },
        costBreakdown: {
            totalInteriorCost: Number(totalInteriorCost.toFixed(2)),
            totalBindingCost: Number(totalBindingCost.toFixed(2)),
            totalCoverCost: Number(totalCoverCost.toFixed(2)),
            grandTotalCost: Number(grandTotalCost.toFixed(2)),
            finalCostPerBook: Number(finalCostPerBook.toFixed(2)),
        }
    };
}

function getDetailedAnalysis(
  dimensions: Dimensions,
  costPerSheet?: number
): FitResult & { 
  efficiency: number;
  costPerItem?: number
}{

  const result = calculateSRA3Fit(dimensions);
  const efficiency = calculateEfficiency(dimensions);
  
  const analysis = {
    ...result,
    efficiency
  };
  
  if ( costPerSheet && result.count > 0 ){
    return {
      ...analysis,
      costPerItem: Math.round((costPerSheet / result.count) * 100) / 100
    };
  }
  
  return analysis;
}

export {
  calculateSRA3Fit,
  quickFit,
  calculateEfficiency,
  getDetailedAnalysis,
  getFullCostAnalysis,
  type Dimensions,
  type FitResult,
  type OrientationDetails,
  type WasteArea
}