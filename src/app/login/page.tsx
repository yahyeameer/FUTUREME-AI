import type { Metadata } from "next";
import { Suspense } from "react";
import { SignIn } from "./sign-in";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <Suspense>
        <SignIn />
      </Suspense>
    </main>
  );
}
