"use client";

import { useRecoverFromDeploy } from "./recover";

/** The last line of defence, used only if the root layout itself fails. It brings its own <html>, so it's styled inline. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const updating = useRecoverFromDeploy(error);
  const button = { padding: "10px 18px", borderRadius: 10, border: "1px solid #C8B78F", cursor: "pointer", font: "inherit" };
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0B0C10", color: "#F3F0E8", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <main>
          <h1 style={{ fontWeight: 500 }}>{updating ? "TOMORA just updated" : "TOMORA hit a snag"}</h1>
          <p style={{ opacity: 0.65 }}>{updating ? "Loading the new version…" : "Your notes and chats are safe."}</p>
          {!updating && (
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
              <button style={{ ...button, background: "#C8B78F", color: "#14120D" }} onClick={() => retry()}>
                Try again
              </button>
              <button style={{ ...button, background: "transparent", color: "#F3F0E8" }} onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          )}
        </main>
      </body>
    </html>
  );
}
