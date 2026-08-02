import { describe, test, expect } from "vitest";
import { createHash } from "crypto";
import { hashToken } from "../crypto.js";

describe("hashToken", () => {
  test("produces a 64-character hex sha256 digest", () => {
    const hash = hashToken("token123");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic for the same token", () => {
    expect(hashToken("token123")).toBe(hashToken("token123"));
  });

  test("produces different hashes for different tokens", () => {
    expect(hashToken("token123")).not.toBe(hashToken("token124"));
  });

  test("matches a known sha256 value", () => {
    const expected = createHash("sha256").update("token123").digest("hex");

    expect(hashToken("token123")).toBe(expected);
  });
});
