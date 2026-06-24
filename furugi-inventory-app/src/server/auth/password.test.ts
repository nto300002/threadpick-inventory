import { describe, expect, it } from "vitest";
import { hashPassword, passwordHashNeedsUpgrade, verifyPassword } from "./password";

const testConfig = {
  iterations: 1_000,
  pepper: "test-pepper",
};

describe("password hashing", () => {
  it("hashes passwords with PBKDF2 metadata and a random salt", async () => {
    const firstHash = await hashPassword("Password!1", testConfig);
    const secondHash = await hashPassword("Password!1", testConfig);

    expect(firstHash).toMatch(/^pbkdf2-sha256\$i=1000\$s=[A-Za-z0-9_-]+\$h=[A-Za-z0-9_-]+$/);
    expect(secondHash).toMatch(/^pbkdf2-sha256\$i=1000\$s=[A-Za-z0-9_-]+\$h=[A-Za-z0-9_-]+$/);
    expect(firstHash).not.toBe(secondHash);
  });

  it("verifies correct passwords and rejects incorrect passwords", async () => {
    const passwordHash = await hashPassword("Password!1", testConfig);

    await expect(verifyPassword("Password!1", passwordHash, testConfig)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", passwordHash, testConfig)).resolves.toBe(false);
  });

  it("flags low iteration hashes for upgrade", async () => {
    const passwordHash = await hashPassword("Password!1", { ...testConfig, iterations: 500 });

    expect(passwordHashNeedsUpgrade(passwordHash, testConfig)).toBe(true);
    expect(passwordHashNeedsUpgrade(passwordHash, { ...testConfig, iterations: 500 })).toBe(false);
  });
});
