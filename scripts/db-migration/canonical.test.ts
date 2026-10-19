import { describe, expect, it } from "bun:test";
import { canonicalJson, normalizeValue } from "./canonical";

describe("lossless migration values", () => {
  it("compares JSON semantics without rounding large integers or decimals", () => {
    expect(canonicalJson('{"b":1.2300,"a":900719925474099312345}')).toBe(canonicalJson('{"a":900719925474099312345,"b":123e-2}'));
    expect(canonicalJson("900719925474099312345")).not.toBe(canonicalJson("900719925474099312346"));
    expect(canonicalJson("1.000000000000000000001")).not.toBe(canonicalJson("1"));
    expect(canonicalJson("-0.0")).toBe(canonicalJson("0"));
  });
  it("preserves arrays, strings and the distinction between SQL and JSON null", () => {
    expect(canonicalJson('["Ä 😀",null,true,{"z":2,"a":1}]')).toBe('["Ä 😀",null,true,{"a":1e0,"z":2e0}]');
    expect(normalizeValue("Json", null, false)).toBeNull();
    expect(normalizeValue("Json", "null", false)).toBe("null");
    expect(normalizeValue("String", "  Ä\n😀  ", true)).toBe("  Ä\n😀  ");
    expect(normalizeValue("String", "", true)).toBe("");
  });
  it("rejects incompatible values instead of replacing or dropping them", () => {
    for (const bad of ["0000-00-00 00:00:00.000000", "2024-02-30 12:00:00.000000", "2024-01-01 00:00:00.000001"]) expect(() => normalizeValue("DateTime", bad, true)).toThrow();
    expect(() => normalizeValue("Boolean", "2", true)).toThrow();
    expect(() => normalizeValue("Int", "2147483648", true)).toThrow();
    expect(() => normalizeValue("String", "x\0y", true)).toThrow();
    expect(() => normalizeValue("Enum", "", true, ["PENDING"])).toThrow();
    expect(() => normalizeValue("String", null, true)).toThrow();
    expect(() => canonicalJson('{"a":1,"a":2}')).toThrow();
    expect(() => canonicalJson("[1,]")).toThrow();
    expect(() => canonicalJson("01")).toThrow();
  });
  it("preserves millisecond date components without applying a local timezone", () => {
    expect(normalizeValue("DateTime", "2024-02-29 23:59:59.123000", true)).toBe("2024-02-29 23:59:59.123000");
  });
});
