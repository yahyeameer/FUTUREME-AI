import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow && (
          <p className="t-label flex items-center gap-2">
            <span aria-hidden className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[2.1rem] leading-[1.02] tracking-[-0.015em] text-balance sm:text-[2.6rem]">{title}</h1>
        <span aria-hidden className="title-rule mt-3 mb-1" />
        {description && <p className="max-w-2xl pt-1 text-[13.5px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionHeading({ children, action, className, id }: { children: React.ReactNode; action?: React.ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 id={id} className="t-label">
        {children}
      </h2>
      {action}
    </div>
  );
}
