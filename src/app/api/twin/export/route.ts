import { connection } from "next/server";
import { db } from "@/lib/server-db";
import { exportTwinData } from "@/lib/twin-data";

// Everything the voice twin holds, as one JSON download (Settings, "Download twin data").

export async function GET() {
  await connection();
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(exportTwinData(db()), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="futureme-twin-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
