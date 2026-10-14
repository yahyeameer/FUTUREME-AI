import { describe, expect, it } from "vitest";
import { openDb } from "../src/lib/db";

describe("db", () => {
  it("creates the schema and stores a goal with tasks", () => {
    const db = openDb(":memory:");
    const goal = db.prepare("INSERT INTO goals (title) VALUES (?)").run("Ship FutureMe");
    db.prepare("INSERT INTO tasks (goal_id, title) VALUES (?, ?)").run(goal.lastInsertRowid, "Scaffold repo");
    const row = db.prepare("SELECT t.title, t.status FROM tasks t WHERE goal_id = ?").get(goal.lastInsertRowid);
    expect(row).toEqual({ title: "Scaffold repo", status: "todo" });
  });
});
