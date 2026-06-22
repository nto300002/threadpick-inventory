import { describe, expect, it } from "vitest";
import { isProductStatus, PRODUCT_STATUS_VALUES } from "./status";

describe("product status", () => {
  it("contains the MVP workflow states", () => {
    expect(PRODUCT_STATUS_VALUES).toEqual([
      "unmeasured",
      "measured",
      "selling",
      "sold",
      "returned",
    ]);
  });

  it("rejects unknown product states", () => {
    expect(isProductStatus("sold")).toBe(true);
    expect(isProductStatus("archived")).toBe(false);
  });
});
