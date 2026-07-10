import type { BookPart } from "@prisma/client";
export function handleBookPart(type: string): BookPart {
  switch (type.toLocaleLowerCase()) {
    case "bindung":
      return "BINDING";
    case "umschlag":
      return "COVER";
    case "wochenplaner":
      return "PLANNER";
    default:
      return "DEFAULT";
  }
}
