import { describe, expect, it } from "vitest";
import app from "./app";

describe("Hono API", () => {
  it("responds to the health endpoint", async () => {
    const response = await app.request("/api/health");

    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "threadpick-inventory",
    });
  });
});
