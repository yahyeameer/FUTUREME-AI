import type { Db } from "@/lib/db";
import { getProfile } from "@/lib/futureme";
import { apifyConfigured, FETCHERS } from "@/lib/social/apify";
import { claims } from "@/lib/social/claims";
import { PLATFORMS } from "@/lib/social/parse";
import { personaPrompt } from "@/lib/social/persona";
import { connectedAccounts, OAUTH_PLATFORMS, oauthConfigured, PROVIDERS, type OAuthPlatform } from "@/lib/social/oauth";
import { secretKey } from "@/lib/social/secrets";
import { getPersona, socialSummary } from "@/lib/social/store";

export function connectionsState(db: Db) {
  const persona = getPersona(db);
  const connected = connectedAccounts(db);
  return {
    onboarded: !!getProfile(db),
    sources: socialSummary(db),
    persona,
    /** Exactly what the future self is told on every turn. */
    prompt: persona ? personaPrompt(persona) : null,
    oauth: Object.fromEntries(
      OAUTH_PLATFORMS.map((p) => [p, { configured: oauthConfigured(p), connected: connected[p] ?? null, reads: PROVIDERS[p].reads, scopes: PROVIDERS[p].scopes }]),
    ) as Record<OAuthPlatform, { configured: boolean; connected: { account: string | null; since: string } | null; reads: string; scopes: string[] }>,
    encryption: secretKey().source,
    /** Fetching public profiles with Apify, after an ownership check. */
    fetch: {
      configured: apifyConfigured(),
      reads: Object.fromEntries(PLATFORMS.map((p) => [p, FETCHERS[p].reads])) as Record<(typeof PLATFORMS)[number], string>,
      claims: claims(db),
    },
  };
}
export type ConnectionsState = ReturnType<typeof connectionsState>;
