import { getSetting, setSetting, type Db } from "./db";
import { formatCost, formatSpan, toPaths, type RawPath } from "./simulator-paths";
import type { Situation } from "@/types";

// The road the user chose in the Future Simulator. Once chosen, every agent that reasons about the user (the future
// self, the council, missions, helpers, the night shift and the simulator itself) reads it with their profile, so
// advice follows the road they actually picked. It stays a conditional scenario: agents are told to check its
// assumptions, not to treat it as their future.

const KEY = "chosen_road";

export interface ChosenRoadRecord {
  simulationId: number;
  /** The road's position in the simulation's own (model) order. */
  index: number;
  goal: string;
  path: RawPath;
  situation: Situation | null;
  notePath: string | null;
  chosenAt: string;
}

export function getChosenRoad(db: Db): ChosenRoadRecord | null {
  const raw = getSetting(db, KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChosenRoadRecord;
  } catch {
    return null;
  }
}

export function setChosenRoad(db: Db, road: ChosenRoadRecord | null) {
  setSetting(db, KEY, road ? JSON.stringify(road) : null);
}

/** The block agents read next to the profile. Null when no road is chosen. */
export function chosenRoadBlock(db: Db): string | null {
  const road = getChosenRoad(db);
  if (!road) return null;
  const [p] = toPaths([road.path]);
  return [
    `The road they chose in the Future Simulator for "${road.goal}" (a conditional scenario they picked, not a prediction): ${p.name}. ${p.summary}`,
    `- Time ${formatSpan(p.months)}, about ${p.hoursPerWeek} hours a week; cost ${formatCost(p.cost)}${p.keepsIncome ? "; they keep earning" : "; they stop earning for a while"}.`,
    `- It holds only if: ${p.assumptions.join("; ")}.`,
    p.firstSteps.length > 0 && `- First steps: ${p.firstSteps.join("; ")}.`,
    "Fit your advice and plans to this road. If something they say breaks one of its assumptions, name the assumption and suggest comparing roads again in the Future Simulator.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The profile context plus the chosen road, for agents that reason about the user. */
export function withChosenRoad(db: Db, context: string): string {
  const road = chosenRoadBlock(db);
  return road ? `${context}\n${road}` : context;
}
