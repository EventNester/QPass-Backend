import { describe, test, expect } from "vitest";
import { generateSlug } from "../slug.js";

describe("generateSlug", () => {
  test("produces lowercase slug with hex suffix", () => {
    const slug = generateSlug("Tech Conference 2026");

    expect(slug).toMatch(/^tech-conference-2026-[0-9a-f]{6}$/);
  });

  test("uses untitled fallback for special-character-only titles", () => {
    const slug = generateSlug("!! @@ ##");

    expect(slug).toMatch(/^untitled-[0-9a-f]{6}$/);
  });

  test("uses untitled fallback for empty titles", () => {
    const slug = generateSlug("");

    expect(slug).toMatch(/^untitled-[0-9a-f]{6}$/);
  });
});
