import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { accessCode } from "@/lib/access";
import { multiUser } from "@/lib/workspace-id";
import { SignIn } from "./sign-in";

export const metadata: Metadata = { title: "Sign in" };

// Read per request: the sign-in shows the access code only when FUTUREME_SHOW_CODE=1 (a demo or judging server that
// wants visitors to get in with one click), and that setting is a runtime one, so the page can't be built ahead of time.
async function Form() {
  await connection();
  const shown = process.env.FUTUREME_SHOW_CODE === "1" ? accessCode() : null;
  return <SignIn shownCode={shown} workspaces={multiUser()} />;
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <Suspense>
        <Form />
      </Suspense>
    </main>
  );
}
