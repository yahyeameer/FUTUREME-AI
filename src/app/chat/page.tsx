import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { chatHistory, getProfile } from "@/lib/futureme";
import { db } from "@/lib/server-db";
import { ChatClient } from "./chat-client";

async function Chat() {
  await connection();
  const profile = getProfile(db());
  if (!profile) {
    return (
      <p>
        <Link href="/onboarding" className="underline">
          Tell me about yourself first.
        </Link>
      </p>
    );
  }
  return <ChatClient name={profile.name} initial={chatHistory(db()).map(({ role, content, citations }) => ({ role, content, citations }))} />;
}

export default function ChatPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader eyebrow="Step 3" title="Chat with your future self">
        They remember what you&apos;ve told them and can propose plans. Nothing is saved until you approve it.
      </PageHeader>
      <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
        <Chat />
      </Suspense>
    </div>
  );
}
