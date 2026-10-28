import { describe, expect, it } from "vitest";
import { unadjustSplits } from "./yahoo.js";

describe("unadjustSplits", () => {
  it("restores the prices that actually traded before a split", () => {
    const points: [string, number][] = [["2024-06-07", 120], ["2024-06-10", 121]];
    // 10-for-1 split effective 2024-06-10: Yahoo reports 2024-06-07 as 120 (split-adjusted); it traded at 1200.
    expect(unadjustSplits(points, [{ date: "2024-06-10T13:30:00Z", numerator: 10, denominator: 1 }])).toEqual([["2024-06-07", 1200], ["2024-06-10", 121]]);
  });

  it("leaves prices alone without splits", () => {
    const points: [string, number][] = [["2024-01-02", 10]];
    expect(unadjustSplits(points, [])).toBe(points);
  });
});
