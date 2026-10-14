"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { completeTask, decideApproval, generateStory, saveProfile } from "@/lib/futureme";
import { generateDaily } from "@/lib/daily";
import { db } from "@/lib/server-db";

// Single-user MVP: no auth yet. Every action validates its input before touching data.

export async function saveProfileAction(formData: FormData) {
  saveProfile(db(), Object.fromEntries(formData));
  redirect("/future");
}

export async function generateStoryAction(): Promise<{ error?: string }> {
  try {
    await generateStory(db());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the story." };
  }
  revalidatePath("/future");
  return {};
}

// Called after a streamed chat turn so the Plan page shows any new proposals.
export async function refreshPlanAction() {
  revalidatePath("/plan");
}

export async function decideApprovalAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Invalid approval id.");
  decideApproval(db(), id, formData.get("decision") === "approve");
  revalidatePath("/plan");
}

export async function completeTaskAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) throw new Error("Invalid task id.");
  completeTask(db(), id);
  revalidatePath("/plan");
}

export async function generateDailyAction(): Promise<{ error?: string }> {
  try {
    await generateDaily(db());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not print today's issue." };
  }
  revalidatePath("/daily");
  return {};
}
