import { after, connection } from "next/server";
import { z } from "zod";
import { runCouncil, saveCouncilBrief } from "@/lib/council";
import { warmDockerMcp } from "@/lib/docker-mcp";
import { decideDockerRequest } from "@/lib/docker-tools";
import { startMission } from "@/lib/missions";
import { runNightShift } from "@/lib/night-shift";
import { setActivePack } from "@/lib/packs";
import { runResearch } from "@/lib/research";
import { db } from "@/lib/server-db";
import { chooseRoad, clearRoad, saveSimulation, simulatePaths } from "@/lib/simulator";
import { verifyMessage } from "@/lib/verify";
import {
  buildWorkspace,
  createMemory,
  decide,
  deleteMemories,
  generateReflection,
  markTaskDone,
  publishEdition,
  saveProfileFromUi,
  setStyle,
  updateMemory,
} from "@/lib/workspace-server";

// The live service's endpoint. GET returns the whole workspace; POST runs one action and returns the new workspace.
// Chat streams through POST /api/chat.

export async function GET() {
  await connection();
  // Lists the Docker MCP Gateway's tools for the Agent page; gives up quickly when Docker isn't running.
  await warmDockerMcp();
  return Response.json(buildWorkspace(db()), { headers: { "Cache-Control": "no-store" } });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveProfile"), profile: z.unknown() }),
  z.object({ action: z.literal("setStyle"), style: z.string() }),
  z.object({ action: z.literal("decide"), id: z.coerce.number().int(), decision: z.enum(["approve", "reject"]), plan: z.unknown().optional() }),
  z.object({ action: z.literal("completeTask"), id: z.string().regex(/^task-\d+$/) }),
  z.object({ action: z.literal("createMemory"), memory: z.unknown() }),
  z.object({ action: z.literal("updateMemory"), id: z.string(), patch: z.unknown() }),
  z.object({ action: z.literal("deleteMemories"), ids: z.array(z.string()) }),
  z.object({ action: z.literal("generateReflection") }),
  z.object({ action: z.literal("publishEdition") }),
  z.object({ action: z.literal("askCouncil"), question: z.string().min(3).max(600) }),
  z.object({ action: z.literal("saveCouncil"), id: z.coerce.number().int() }),
  z.object({ action: z.literal("verifyMessage"), id: z.string().regex(/^msg-\d+$/) }),
  z.object({ action: z.literal("runResearch"), topic: z.string().min(3).max(300) }),
  z.object({ action: z.literal("runNightShift") }),
  z.object({ action: z.literal("setPack"), id: z.string().max(80).nullable() }),
  z.object({ action: z.literal("decideDockerTool"), id: z.coerce.number().int(), decision: z.enum(["approve", "reject"]) }),
  z.object({ action: z.literal("startMission"), goal: z.string().min(5).max(400) }),
  z.object({ action: z.literal("simulatePaths"), goal: z.string().min(5).max(300), situation: z.unknown().optional() }),
  z.object({ action: z.literal("saveSimulation"), id: z.coerce.number().int() }),
  z.object({ action: z.literal("chooseRoad"), id: z.coerce.number().int(), index: z.number().int().min(0).max(20) }),
  z.object({ action: z.literal("clearRoad") }),
]);

export async function POST(request: Request) {
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const a = parsed.data;
  const d = db();
  try {
    switch (a.action) {
      case "saveProfile":
        saveProfileFromUi(d, a.profile);
        break;
      case "setStyle":
        setStyle(d, a.style);
        break;
      case "decide":
        decide(d, a.id, a.decision, a.plan);
        break;
      case "completeTask":
        markTaskDone(d, Number(a.id.slice(5)));
        break;
      case "createMemory":
        createMemory(a.memory);
        break;
      case "updateMemory":
        updateMemory(a.id, a.patch);
        break;
      case "deleteMemories":
        deleteMemories(a.ids);
        break;
      case "generateReflection":
        await generateReflection(d);
        break;
      case "publishEdition":
        await publishEdition(d);
        break;
      case "askCouncil":
        await runCouncil(d, a.question);
        break;
      case "saveCouncil":
        saveCouncilBrief(d, a.id);
        break;
      case "verifyMessage":
        await verifyMessage(d, Number(a.id.slice(4)));
        break;
      case "runResearch":
        await runResearch(d, a.topic);
        break;
      case "runNightShift":
        await runNightShift(d, "manual");
        break;
      case "setPack":
        setActivePack(d, a.id);
        break;
      case "decideDockerTool":
        await decideDockerRequest(d, a.id, a.decision === "approve");
        break;
      case "simulatePaths":
        await simulatePaths(d, a.goal, a.situation ?? null);
        break;
      case "saveSimulation":
        saveSimulation(d, a.id);
        break;
      case "chooseRoad":
        chooseRoad(d, a.id, a.index);
        break;
      case "clearRoad":
        clearRoad(d);
        break;
      case "startMission": {
        // The mission keeps working after this response; the app polls the workspace until it finishes.
        const { done } = startMission(d, a.goal);
        after(() => done);
        break;
      }
    }
  } catch (err) {
    const message = err instanceof z.ZodError ? "Some fields are missing or too long." : err instanceof Error ? err.message : "Something went wrong.";
    return Response.json({ error: message }, { status: 422 });
  }
  return Response.json(buildWorkspace(d), { headers: { "Cache-Control": "no-store" } });
}
