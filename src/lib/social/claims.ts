import crypto from "node:crypto";
import type { Db } from "../db";
import type { LlmProvider } from "../llm";
import { FETCHERS, FetchRefused, parseTarget, type ApifyRunner } from "./apify";
import { PLATFORM_NAMES, SocialImportSchema, type Platform, type SocialImport } from "./parse";
import { importSocial } from "./store";

// Proving an account is yours before FutureMe fetches it. Anyone can type someone else's username, so a fetch only
// counts when a one-time code FutureMe made up is visible on the account itself (its bio, About, channel description or
// a new post), which only the account's owner can put there. Until the code is found nothing fetched is kept or shown:
// the run's results are thrown away. Codes expire after a day and allow a few checks, so they can't be guessed.

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_TTL_MS = 24 * 3600_000;
/** How long a verified account can be fetched again without a new code. */
export const VERIFIED_TTL_MS = 30 * 24 * 3600_000;
export const MAX_CHECKS = 5;
export const MAX_CLAIMS_PER_DAY = 5;

type Status = "pending" | "verified";

interface ClaimRow {
  id: string;
  platform: Platform;
  handle: string;
  code: string;
  status: Status;
  checks: number;
  consent_at: string;
  data: string | null;
  created_at: string;
  verified_at: string | null;
}

export interface Claim {
  id: string;
  platform: Platform;
  handle: string;
  code: string;
  status: Status;
  checksLeft: number;
  where: string;
  expiresAt: string;
  /** Fetched and waiting for the person to import it (only once verified). */
  ready: { posts: number; roles: number; skills: number; name?: string; sample?: string } | null;
}

const now = () => Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function newCode(): string {
  const bytes = crypto.randomBytes(6);
  return `FM-${[...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("")}`;
}

function toClaim(r: ClaimRow): Claim {
  const data = r.data ? (JSON.parse(r.data) as SocialImport) : null;
  const expires = r.status === "verified" ? Date.parse(r.verified_at!) + VERIFIED_TTL_MS : Date.parse(r.created_at) + CODE_TTL_MS;
  return {
    id: r.id,
    platform: r.platform,
    handle: r.handle,
    code: r.code,
    status: r.status,
    checksLeft: Math.max(0, MAX_CHECKS - r.checks),
    where: FETCHERS[r.platform].where,
    expiresAt: iso(expires),
    ready: data && {
      posts: data.posts.length,
      roles: data.positions.length,
      skills: data.skills.length,
      name: data.account.name ?? data.account.handle,
      sample: data.posts[0]?.text.slice(0, 200),
    },
  };
}

const expired = (r: ClaimRow) => (r.status === "verified" ? Date.parse(r.verified_at!) + VERIFIED_TTL_MS : Date.parse(r.created_at) + CODE_TTL_MS) < now();

/** The live claim for each platform (at most one), dropping expired ones. */
export function claims(db: Db): Claim[] {
  const rows = db.prepare("SELECT * FROM social_claims").all() as ClaimRow[];
  for (const r of rows.filter(expired)) db.prepare("DELETE FROM social_claims WHERE id = ?").run(r.id);
  return rows.filter((r) => !expired(r)).map(toClaim);
}

const getRow = (db: Db, id: string) => db.prepare("SELECT * FROM social_claims WHERE id = ?").get(id) as ClaimRow | undefined;

/** Step 1: the person names their account and agrees. Returns the code to put on it. */
export function startClaim(db: Db, platform: Platform, input: string, consent: boolean): Claim {
  if (!consent) throw new Error("Agree first, so FutureMe knows this is your own account.");
  const target = parseTarget(platform, input);
  const recent = (db.prepare("SELECT COUNT(*) AS n FROM social_claim_log WHERE platform = ? AND created_at > ?").get(platform, iso(now() - 24 * 3600_000)) as { n: number }).n;
  if (recent >= MAX_CLAIMS_PER_DAY) throw new Error(`Too many ${PLATFORM_NAMES[platform]} accounts tried today. Try again tomorrow.`);
  const row: ClaimRow = {
    id: crypto.randomUUID(),
    platform,
    handle: target.handle,
    code: newCode(),
    status: "pending",
    checks: 0,
    consent_at: iso(now()),
    data: null,
    created_at: iso(now()),
    verified_at: null,
  };
  // One claim per platform: naming a different account starts over.
  db.prepare("DELETE FROM social_claims WHERE platform = ?").run(platform);
  db.prepare(
    "INSERT INTO social_claims (id, platform, handle, code, status, checks, consent_at, data, created_at, verified_at) VALUES (@id, @platform, @handle, @code, @status, @checks, @consent_at, @data, @created_at, @verified_at)",
  ).run(row);
  db.prepare("INSERT INTO social_claim_log (platform, handle, created_at) VALUES (?, ?, ?)").run(platform, target.handle, row.created_at);
  return toClaim(row);
}

const codeIn = (code: string, texts: string[]) => texts.some((t) => t.toUpperCase().replace(/\s+/g, "").includes(code));

/** Removes the verification code from what's imported, so it doesn't end up in the persona. */
function withoutCode(imp: SocialImport, code: string): SocialImport {
  const strip = (t: string | undefined) => t?.replace(new RegExp(`\\s*${code}\\s*`, "gi"), " ").trim() || undefined;
  return {
    ...imp,
    account: { ...imp.account, bio: strip(imp.account.bio), headline: strip(imp.account.headline) },
    posts: imp.posts.flatMap((p) => {
      const text = strip(p.text);
      return text ? [{ ...p, text }] : [];
    }),
  };
}

export type CheckResult = { verified: true; claim: Claim } | { verified: false; claim: Claim; reason: string };

/**
 * Step 2: fetch the account and look for the code. Found: the account is verified and what was fetched is kept for the
 * person to review and import. Not found: everything fetched is dropped. A verified account can be fetched again for
 * 30 days without the code.
 */
export async function checkClaim(db: Db, id: string, runner: ApifyRunner): Promise<CheckResult> {
  const row = getRow(db, id);
  if (!row || expired(row)) throw new Error("That code has expired. Start again for a new one.");
  if (row.status === "pending" && row.checks >= MAX_CHECKS) throw new Error("That code has been checked too many times. Start again for a new one.");
  db.prepare("UPDATE social_claims SET checks = checks + 1 WHERE id = ?").run(id);
  const fetcher = FETCHERS[row.platform];
  const target = parseTarget(row.platform, row.handle);

  let fetched;
  try {
    fetched = fetcher.profile.map((await runner.run(fetcher.profile.id, fetcher.profile.input(target), fetcher.profile.limits)) as Record<string, unknown>[], target);
  } catch (err) {
    if (err instanceof FetchRefused) return { verified: false, claim: toClaim(getRow(db, id)!), reason: err.message };
    throw err;
  }

  if (row.status === "pending" && !codeIn(row.code, fetched.proof)) {
    return {
      verified: false,
      claim: toClaim(getRow(db, id)!),
      reason: `${row.code} wasn't found on ${PLATFORM_NAMES[row.platform]} ${row.handle}. Add it to ${fetcher.where}, wait a minute for it to show publicly, then check again. Nothing was kept.`,
    };
  }

  // Verified: only now is anything more fetched (LinkedIn's posts) or kept.
  const imp = fetched.import;
  if (fetcher.more) fetcher.more.add((await runner.run(fetcher.more.id, fetcher.more.input(target), fetcher.more.limits).catch(() => [])) as Record<string, unknown>[], imp, target);
  const clean = SocialImportSchema.parse(withoutCode(imp, row.code));
  db.prepare("UPDATE social_claims SET status = 'verified', verified_at = COALESCE(verified_at, ?), data = ? WHERE id = ?").run(iso(now()), JSON.stringify(clean), id);
  return { verified: true, claim: toClaim(getRow(db, id)!) };
}

/** Step 3: the person has seen what was fetched and imports it. Only a verified claim's own data can be imported. */
export async function importClaim(db: Db, id: string, consent: boolean, provider?: LlmProvider) {
  const row = getRow(db, id);
  if (!row || expired(row) || row.status !== "verified" || !row.data) throw new Error("Verify the account first.");
  const result = await importSocial(db, JSON.parse(row.data), { method: "apify", consent, consentAt: row.consent_at, provider });
  db.prepare("UPDATE social_claims SET data = NULL WHERE id = ?").run(id);
  return result;
}

export function dropClaims(db: Db, platform?: Platform) {
  if (platform) db.prepare("DELETE FROM social_claims WHERE platform = ?").run(platform);
  else db.prepare("DELETE FROM social_claims").run();
}
