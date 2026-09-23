import { describe, expect, it } from "vitest";
import { localDateTime, localToInstant } from "./local-time";

describe("tournament local time", () => {
  it("converts independently of the browser timezone", () => {
    expect(localToInstant("2026-09-26T08:00", "America/Chicago")).toBe("2026-09-26T13:00:00.000Z");
    expect(localDateTime("2026-09-26T13:00:00Z", "America/Chicago")).toBe("2026-09-26T08:00");
    expect(localToInstant("2026-12-05T08:00", "America/Chicago")).toBe("2026-12-05T14:00:00.000Z");
  });
  it("rejects nonexistent and ambiguous clock-change times", () => {
    expect(() => localToInstant("2026-03-08T02:30", "America/Chicago")).toThrow("unambiguous");
    expect(() => localToInstant("2026-11-01T01:30", "America/Chicago")).toThrow("unambiguous");
    expect(() => localToInstant("", "America/Chicago")).toThrow("valid");
  });
});