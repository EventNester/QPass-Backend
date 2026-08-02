import { describe, test, expect, vi } from "vitest";
import { success, created, noContent } from "../response.js";

function createMockRes() {
  const res = { statusCode: 200, body: undefined, ended: false };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body) => {
    res.body = body;
    return res;
  });
  res.end = vi.fn(() => {
    res.ended = true;
    return res;
  });
  return res;
}

describe("success", () => {
  test("returns status 200 with status and data", () => {
    const res = createMockRes();
    const result = success(res, { id: 1 }, undefined, 200);

    expect(res.statusCode).toBe(200);
    expect(result.body).toEqual({ status: "success", data: { id: 1 } });
  });

  test("includes message when provided", () => {
    const res = createMockRes();
    success(res, { id: 1 }, "Done");

    expect(res.body).toEqual({ status: "success", message: "Done", data: { id: 1 } });
  });

  test("omits message when falsy", () => {
    const res = createMockRes();
    success(res, [], "");

    expect(res.body).toEqual({ status: "success", data: [] });
  });

  test("uses the provided custom status code", () => {
    const res = createMockRes();
    success(res, null, "Custom", 202);

    expect(res.statusCode).toBe(202);
  });
});

describe("created", () => {
  test("returns status 201 with status and data", () => {
    const res = createMockRes();
    created(res, { id: 1 }, "Created");

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ status: "success", message: "Created", data: { id: 1 } });
  });
});

describe("noContent", () => {
  test("ends the response with status 204", () => {
    const res = createMockRes();
    noContent(res);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });
});
