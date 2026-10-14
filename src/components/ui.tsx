export const input =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 dark:border-stone-700 dark:bg-stone-900";
export const primaryButton =
  "rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300";
export const ghostButton =
  "rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200/60 dark:text-stone-400 dark:hover:bg-stone-800";

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 space-y-2">
      <p className="text-xs font-medium uppercase tracking-widest text-amber-700 dark:text-amber-400">{eyebrow}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {children && <p className="text-stone-600 dark:text-stone-400">{children}</p>}
    </div>
  );
}
