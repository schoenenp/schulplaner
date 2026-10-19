import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { GET } from "./route";

function request(path: string) {
  return new NextRequest(`http://internal-next:3000${path}`, {
    headers: {
      host: "internal-next:3000",
      "x-forwarded-host": "planer.pirrot.de",
      "x-forwarded-proto": "https",
    },
  });
}
describe("emailed template landing", () => {
  it("keeps old emailed links working behind the production proxy", () => {
    const response = GET(request("/template/share/claim?token=invite_1"));
    expect(response.headers.get("location")).toBe(
      "https://planer.pirrot.de/template/share?claim=invite_1",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("handles missing tokens", () => {
    expect(GET(request("/template/share/claim")).headers.get("location")).toBe(
      "https://planer.pirrot.de/template/share?error=missing-token",
    );
  });
});
