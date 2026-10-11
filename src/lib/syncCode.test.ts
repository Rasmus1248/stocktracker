import { describe, expect, it } from "vitest";
import { CODE_PATTERN, generateCode, normalizeCode } from "./syncCode";

describe("sync codes", () => {
  it("generates well-formed, unique codes", () => {
    const a = generateCode();
    expect(a).toMatch(CODE_PATTERN);
    expect(generateCode()).not.toBe(a);
  });

  it("normalizes typed codes and links", () => {
    const code = "abcd-efgh-jkmn-pqrs-tuvw";
    expect(normalizeCode("ABCD EFGH JKMN PQRS TUVW")).toBe(code);
    expect(normalizeCode("abcdefghjkmnpqrstuvw")).toBe(code);
    expect(normalizeCode(`https://example.com/#sync=${code}`)).toBe(code);
    expect(normalizeCode("too-short")).toBeNull();
  });
});
