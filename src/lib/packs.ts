import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { getSetting, setSetting, type Db } from "./db";

// Persona packs: standalone Docker Agent files in agents/packs/ that can be pushed to and pulled from any OCI registry.
// The first paragraph of a pack's root instruction is its persona; the app adds it to the future self's prompt.

export interface Pack {
  id: string;
  name: string;
  tagline: string;
  persona: string;
  file: string;
}

interface PackFile {
  metadata?: { description?: string; readme?: string; version?: string };
  agents?: { root?: { instruction?: string } };
}

export function packsDir() {
  return path.join(process.cwd(), "agents", "packs");
}

export function listPacks(dir = packsDir()): Pack[] {
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return [];
  return fs
    .readdirSync(/*turbopackIgnore: true*/ dir)
    .filter((f) => f.endsWith(".yaml") && !f.startsWith("."))
    .sort()
    .flatMap((f): Pack[] => {
      try {
        const doc = yaml.load(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, f), "utf8")) as PackFile;
        const persona = (doc.agents?.root?.instruction ?? "").trim().split(/\n\s*\n/)[0]?.trim();
        // Packs can come from anyone's registry, so only a short persona paragraph is used.
        if (!persona || persona.length > 900) return [];
        const id = f.replace(/\.yaml$/, "");
        const name = doc.metadata?.readme?.match(/^#\s+(.+)$/m)?.[1].trim() ?? id;
        return [{ id, name, tagline: doc.metadata?.description ?? "", persona, file: `agents/packs/${f}` }];
      } catch {
        return [];
      }
    });
}

export function activePack(db: Db): Pack | null {
  const id = getSetting(db, "active_pack");
  return id ? (listPacks().find((p) => p.id === id) ?? null) : null;
}

export function setActivePack(db: Db, id: string | null) {
  if (id !== null && !listPacks().some((p) => p.id === id)) throw new Error(`No persona pack "${id}".`);
  setSetting(db, "active_pack", id);
}
