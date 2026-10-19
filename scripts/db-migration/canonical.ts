/** Canonical JSON without passing numeric values through JavaScript Number. */
export function canonicalJson(text: string): string {
  let at = 0;
  const whitespace = () => { while (/\s/.test(text[at] ?? "") && at < text.length) at++; };
  const string = () => {
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === "\\") at++;
      else if (char === '"') return JSON.stringify(JSON.parse(text.slice(start, at)));
    }
    throw new Error("Unterminated JSON string");
  };
  const value = (): string => {
    whitespace();
    if (text[at] === '"') return string();
    if (text[at] === "{") {
      at++; whitespace();
      const members = new Map<string, string>();
      if (text[at] !== "}") while (true) {
        whitespace();
        if (text[at] !== '"') throw new Error("Invalid JSON object key");
        const key = string(); whitespace();
        if (text[at++] !== ":") throw new Error("Invalid JSON object");
        if (members.has(key)) throw new Error("Duplicate JSON key cannot be preserved in jsonb");
        members.set(key, value()); whitespace();
        if (text[at] !== ",") break;
        at++;
      }
      if (text[at++] !== "}") throw new Error("Invalid JSON object");
      return `{${[...members].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}:${v}`).join(",")}}`;
    }
    if (text[at] === "[") {
      at++; whitespace(); const items: string[] = [];
      if (text[at] !== "]") while (true) {
        items.push(value()); whitespace();
        if (text[at] !== ",") break;
        at++;
      }
      if (text[at++] !== "]") throw new Error("Invalid JSON array");
      return `[${items.join(",")}]`;
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, at)) { at += literal.length; return literal; }
    }
    const match = text.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) throw new Error("Invalid JSON value");
    at += match[0].length;
    return canonicalNumber(match[0]);
  };
  const result = value(); whitespace();
  if (at !== text.length) throw new Error("Trailing JSON content");
  return result;
}

export function canonicalNumber(number: string): string {
  const match = number.match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) throw new Error("Invalid number");
  let digits = (match[2]! + (match[3] ?? "")).replace(/^0+/, "");
  if (!digits) return "0";
  let exponent = BigInt(match[4] ?? "0") - BigInt((match[3] ?? "").length);
  while (digits.endsWith("0")) { digits = digits.slice(0, -1); exponent++; }
  return `${match[1]}${digits}e${exponent}`;
}

export function normalizeValue(type: string, input: unknown, required: boolean, values?: string[]): string | null {
  if (input === null) {
    if (required) throw new Error("Unexpected NULL in required column");
    return null;
  }
  if (input === undefined) throw new Error("Missing column");
  const value = String(input);
  if (value.includes("\0")) throw new Error("NUL cannot be represented in PostgreSQL text/jsonb");
  if (type === "Int") {
    if (!/^-?\d+$/.test(value) || BigInt(value) < -2147483648n || BigInt(value) > 2147483647n) throw new Error("Integer out of range");
    return BigInt(value).toString();
  }
  if (type === "Boolean") {
    if (["0", "false"].includes(value)) return "false";
    if (["1", "true"].includes(value)) return "true";
    throw new Error("Invalid boolean");
  }
  if (type === "DateTime") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{6})$/);
    if (!match || match[1] === "0000" || !match[7]!.endsWith("000")) throw new Error("Invalid date or timestamp precision exceeds milliseconds");
    const iso = `${value.slice(0, 10)}T${value.slice(11, 23)}Z`;
    const parsed = new Date(iso);
    if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== iso) throw new Error("Invalid calendar date");
    return value;
  }
  if (type === "Json") {
    // Keep the original numeric spelling for insertion. Canonicalize only when hashing.
    canonicalJson(value);
    if (/\\u0000/i.test(value)) throw new Error("JSON NUL cannot be represented in jsonb");
    return value;
  }
  if (type === "Enum" && !values?.includes(value)) throw new Error("Invalid enum label");
  if (!["String", "Enum"].includes(type)) throw new Error(`Unsupported column type ${type}`);
  return value;
}
