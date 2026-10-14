"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { chat, completeTask, decideApproval, generateStory, saveProfile, type ChatTurn } from "@/lib/futureme";
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

export async function sendMessageAction(text: string): Promise<ChatTurn | { error: string }> {
  if (typeof text !== "string" || text.length > 4000) return { error: "Message is too long." };
  try {
    const turn = await chat(db(), text);
    revalidatePath("/plan");
    return turn;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Your future self couldn't answer just now." };
  }
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
