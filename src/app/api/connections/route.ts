import { connection } from "next/server";
import { z } from "zod";
import { compareWithSocial } from "@/lib/futureme";
import { db } from "@/lib/server-db";
import { apifyRunner } from "@/lib/social/apify";
import { checkClaim, dropClaims, importClaim, startClaim } from "@/lib/social/claims";
import { disconnect, startOAuth, syncOAuth } from "@/lib/social/oauth";
import { parseExport, PLATFORMS } from "@/lib/social/parse";
import { SAMPLE_FILES } from "@/lib/social/sample";
import { importSocial } from "@/lib/social/store";
import { errorResponse } from "../twin/state";
import { connectionsState } from "./state";

// The Connected accounts page's endpoint. GET returns what was imported; POST runs one action and returns the new state.
// Archives are read in the browser (src/lib/social/extract.ts), so `import` receives only the parsed profile and posts.
// Public profiles are fetched only after the person proves the account is theirs (claimStart → claimCheck → claimImport).
// The platforms send people back from OAuth to /api/connections/oauth/<platform>/callback.

export async function GET() {
  await connection();
  return Response.json(connectionsState(db()), { headers: { "Cache-Control": "no-store" } });
}

const platform = z.enum(PLATFORMS);
const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import"), consent: z.literal(true), imports: z.array(z.unknown()).min(1).max(3) }),
  z.object({ action: z.literal("sample"), consent: z.literal(true) }),
  z.object({ action: z.literal("delete"), platform }),
  z.object({ action: z.literal("deleteAll"), confirm: z.literal("DELETE") }),
  z.object({ action: z.literal("connect"), platform, consent: z.literal(true) }),
  z.object({ action: z.literal("sync"), platform }),
  z.object({ action: z.literal("disconnect"), platform }),
  z.object({ action: z.literal("claimStart"), platform, account: z.string().trim().min(1).max(200), consent: z.literal(true) }),
  z.object({ action: z.literal("claimCheck"), id: z.uuid() }),
  z.object({ action: z.literal("claimImport"), id: z.uuid(), consent: z.literal(true) }),
  z.object({ action: z.literal("claimCancel"), platform }),
  z.object({ action: z.literal("compare"), question: z.string().trim().min(3).max(300) }),
]);

export async function POST(request: Request) {
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const consent = parsed.error.issues.some((i) => i.path[0] === "consent");
    return Response.json({ error: consent ? "Agree to the import first." : "Invalid request." }, { status: 400 });
  }
  const a = parsed.data;
  const d = db();
  try {
    let extra: Record<string, unknown> = {};
    switch (a.action) {
      case "import":
        extra.imported = [];
        for (const imp of a.imports) (extra.imported as unknown[]).push(await importSocial(d, imp, { method: "export", consent: a.consent }));
        break;
      case "sample":
        extra.imported = [];
        for (const imp of parseExport(SAMPLE_FILES)) (extra.imported as unknown[]).push(await importSocial(d, imp, { method: "sample", consent: a.consent }));
        break;
      case "delete":
        await disconnect(d, a.platform, { deleteData: true });
        break;
      case "deleteAll":
        for (const p of PLATFORMS) await disconnect(d, p, { deleteData: true });
        break;
      case "connect":
        extra = { url: startOAuth(d, a.platform, new URL(request.url).origin, a.consent) };
        break;
      case "sync":
        extra.imported = [await syncOAuth(d, a.platform)];
        break;
      case "disconnect":
        await disconnect(d, a.platform);
        break;
      case "claimStart":
        if (!apifyRunner()) throw new Error("Fetching public profiles isn't set up on this server (APIFY_TOKEN). Import your data export instead.");
        extra = { claim: startClaim(d, a.platform, a.account, a.consent) };
        break;
      case "claimCheck": {
        const runner = apifyRunner();
        if (!runner) throw new Error("Fetching public profiles isn't set up on this server (APIFY_TOKEN).");
        extra = { check: await checkClaim(d, a.id, runner) };
        break;
      }
      case "claimImport":
        extra.imported = [await importClaim(d, a.id, a.consent)];
        break;
      case "claimCancel":
        dropClaims(d, a.platform);
        break;
      case "compare":
        extra = { comparison: await compareWithSocial(d, a.question) };
        break;
    }
    return Response.json({ ...connectionsState(d), ...extra }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
