import { quotePlanner, type PriceBook, type PrintFormat } from "pricing";
import { getBindingKeyByName } from "@/util/book/binding-rules";

type CalcObject = {
  amount: number;
  bPages: number;
  cPages: number;
  format: PrintFormat;
  bindingName?: string;
  /** Admin-managed prices; load them once per request with getPriceBook(). */
  priceBook: PriceBook;
};

export function calculatePrintCost({
  amount,
  bPages,
  cPages,
  format = "DIN A5",
  bindingName,
  priceBook,
}: CalcObject): { single: number; total: number } {
  return quotePlanner(
    {
      quantity: amount,
      grayscalePages: bPages,
      colorPages: cPages,
      format,
      bindingKey: bindingName ? getBindingKeyByName(bindingName) : null,
    },
    priceBook,
  );
}
