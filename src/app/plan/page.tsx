import { connection } from "next/server";
import { Suspense } from "react";
import { completeTaskAction, decideApprovalAction } from "@/app/actions";
import { ghostButton, PageHeader, primaryButton } from "@/components/ui";
import { goalsWithTasks, pendingApprovals, type MemoryProposal, type PlanProposal } from "@/lib/futureme";
import { db } from "@/lib/server-db";

async function Approvals() {
  await connection();
  const items = pendingApprovals(db());
  if (!items.length) return null;
  return (
    <section className="mb-10 space-y-4">
      <h2 className="text-lg font-semibold">Waiting for your approval</h2>
      {items.map((a) => (
        <div key={a.id} className="rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/30">
          {a.kind === "plan" ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-amber-800 dark:text-amber-300">Proposed plan</p>
              <p className="mt-1 font-semibold">{(a.payload as PlanProposal).goal}</p>
              {(a.payload as PlanProposal).why && <p className="text-sm text-stone-600 dark:text-stone-400">{(a.payload as PlanProposal).why}</p>}
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {(a.payload as PlanProposal).tasks.map((t, i) => (
                  <li key={i}>
                    {t.title}
                    {t.due_in_days !== undefined && <span className="text-stone-500"> · in {t.due_in_days} days</span>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-amber-800 dark:text-amber-300">Remember this?</p>
              <p className="mt-1 font-semibold">{(a.payload as MemoryProposal).title}</p>
              <p className="text-sm">{(a.payload as MemoryProposal).body}</p>
            </>
          )}
          <form action={decideApprovalAction} className="mt-4 flex gap-2">
            <input type="hidden" name="id" value={a.id} />
            <button name="decision" value="approve" className={primaryButton}>
              Approve
            </button>
            <button name="decision" value="reject" className={ghostButton}>
              Not now
            </button>
          </form>
        </div>
      ))}
    </section>
  );
}

async function Goals() {
  await connection();
  const goals = goalsWithTasks(db());
  if (!goals.length) return <p className="text-stone-500">No goals yet. Ask your future self to help you plan one.</p>;
  return (
    <section className="space-y-6">
      {goals.map((g) => {
        const done = g.tasks.filter((t) => t.status === "done").length;
        return (
          <div key={g.id} className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-semibold">{g.title}</h2>
              <span className="text-xs text-stone-500">
                {done}/{g.tasks.length} done
              </span>
            </div>
            <ul className="mt-3 divide-y divide-stone-100 dark:divide-stone-800">
              {g.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span className={t.status === "done" ? "text-stone-400 line-through" : ""}>
                    {t.title}
                    {t.due_date && t.status !== "done" && <span className="text-stone-500"> · due {t.due_date}</span>}
                  </span>
                  {t.status === "done" ? (
                    <span className="text-xs text-green-700 dark:text-green-400">Done</span>
                  ) : (
                    <form action={completeTaskAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className={ghostButton}>Mark done</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

export default function PlanPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader eyebrow="Step 4" title="Your plan">
        Approved plans become goals and tasks in the app and notes in your vault.
      </PageHeader>
      <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
        <Approvals />
        <Goals />
      </Suspense>
    </div>
  );
}
