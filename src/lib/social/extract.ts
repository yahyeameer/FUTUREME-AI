import { parseExport, wantedFile, type ExportFile, type SocialImport } from "./parse";
import { listEntries, readEntry, type Inflate, type ZipSource } from "./zip";

// Picks the few files TOMORA reads out of whatever the person chose: whole archives (.zip) or loose export files.
// In the browser this runs before anything is sent, so messages, contacts and photos never leave the device.

const MAX_ENTRY_BYTES = 400 * 1024 * 1024;

export interface PickedFile {
  name: string;
  source: ZipSource;
}

export async function collectExportFiles(items: PickedFile[], inflate: Inflate): Promise<{ files: ExportFile[]; skipped: number }> {
  const decoder = new TextDecoder();
  const files: ExportFile[] = [];
  let skipped = 0;
  let htmlPosts = false;
  for (const item of items) {
    if (item.name.toLowerCase().endsWith(".zip")) {
      for (const entry of await listEntries(item.source)) {
        if (!wantedFile(entry.name)) {
          if (/your_posts[^/]*\.html$/i.test(entry.name)) htmlPosts = true;
          skipped++;
          continue;
        }
        if (entry.size > MAX_ENTRY_BYTES) throw new Error(`${entry.name} is too large to read in the browser.`);
        files.push({ name: entry.name, text: decoder.decode(await readEntry(item.source, entry, inflate)) });
      }
    } else if (wantedFile(item.name)) {
      files.push({ name: item.name, text: decoder.decode(await item.source.read(0, item.source.size)) });
    } else {
      if (/your_posts[^/]*\.html$/i.test(item.name)) htmlPosts = true;
      skipped++;
    }
  }
  if (!files.length && htmlPosts) throw new Error("This Facebook download is in HTML. Download it again and choose the JSON format.");
  return { files, skipped };
}

/** Reads and parses in one go. Throws a readable error when nothing usable was found. */
export async function readExports(items: PickedFile[], inflate: Inflate): Promise<SocialImport[]> {
  const { files, skipped } = await collectExportFiles(items, inflate);
  const imports = parseExport(files, skipped);
  if (!imports.length) {
    throw new Error("No profile or posts found. Pick the .zip you downloaded from LinkedIn, X or Facebook, or files from inside it.");
  }
  return imports;
}
