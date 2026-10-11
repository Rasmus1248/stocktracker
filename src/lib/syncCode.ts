// Sync codes are the only credential for a synced portfolio, so they're long and random:
// 20 characters from a 31-letter alphabet ≈ 99 bits. Ambiguous characters (0/o, 1/l/i) are left out.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const CODE_PATTERN = /^[a-z0-9]{4}(-[a-z0-9]{4}){4}$/;

export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return chars.match(/.{4}/g)!.join("-");
}

/** Accepts codes typed with spaces, without dashes, in upper case, or as a full sync link. */
export function normalizeCode(input: string): string | null {
  const fromLink = input.match(/sync=([a-z0-9-]+)/i)?.[1] ?? input;
  const raw = fromLink.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (raw.length !== 20) return null;
  const code = raw.match(/.{4}/g)!.join("-");
  return CODE_PATTERN.test(code) ? code : null;
}

export const syncLink = (code: string) => `${location.origin}${location.pathname}#sync=${code}`;
