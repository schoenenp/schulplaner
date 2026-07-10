import { describe, expect, it } from "bun:test";
import {
  buildModuleFeedVisibilityWhere,
  buildModulePreviewVisibilityWhere,
} from "./module-visibility";

describe("buildModuleFeedVisibilityWhere", () => {
  it("allows only public modules for anonymous users", () => {
    const where = buildModuleFeedVisibilityWhere();
    expect(where).toEqual({
      OR: [{ visible: "PUBLIC" }],
    });
  });

  it("allows public + own modules for authenticated users", () => {
    const where = buildModuleFeedVisibilityWhere("user_123");
    expect(where).toEqual({
      OR: [{ visible: "PUBLIC" }, { createdById: "user_123" }],
    });
  });
});

describe("buildModulePreviewVisibilityWhere", () => {
  it("allows shared previews for anonymous users", () => {
    const where = buildModulePreviewVisibilityWhere();
    expect(where).toEqual({
      OR: [{ visible: { in: ["PUBLIC", "SHARED"] } }],
    });
  });

  it("allows shared/public + own modules for authenticated users", () => {
    const where = buildModulePreviewVisibilityWhere("user_123");
    expect(where).toEqual({
      OR: [
        { visible: { in: ["PUBLIC", "SHARED"] } },
        { createdById: "user_123" },
      ],
    });
  });
});
