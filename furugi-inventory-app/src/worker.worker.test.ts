/// <reference types="@cloudflare/vitest-pool-workers" />

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Cloudflare Worker", () => {
  it("serves the Hono health endpoint in the Workers runtime", async () => {
    const response = await SELF.fetch("https://threadpick.test/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "threadpick-inventory",
    });
  });
});
