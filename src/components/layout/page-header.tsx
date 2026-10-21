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
          <p className="t-label flex animate-[settle_0.5s_cubic-bezier(0.2,0.7,0.2,1)_both] items-center gap-2">
            {/* A tiny dial, the logo's motif: a turning ring with a light on it. */}
            <span aria-hidden className="relative flex size-3.5 items-center justify-center">
              <span className="absolute inset-0 animate-[orbit_6s_linear_infinite] rounded-full border border-dashed border-accent/70" />
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
            </span>
            {eyebrow}
          </p>
        )}
        <h1 className="animate-[title-in_0.8s_cubic-bezier(0.2,0.7,0.2,1)_0.05s_both] font-display text-[2.1rem] leading-[1.02] tracking-[-0.015em] text-balance sm:text-[2.6rem]">{title}</h1>
        <span aria-hidden className="title-rule mt-3 mb-1" />
        {description && <p className="max-w-2xl animate-[settle_0.6s_cubic-bezier(0.2,0.7,0.2,1)_0.2s_both] pt-1 text-[13.5px] leading-relaxed text-muted-foreground">{description}</p>}
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
