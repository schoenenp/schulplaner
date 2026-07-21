import type { BookPart } from "db";
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
