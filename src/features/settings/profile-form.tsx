"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TONES } from "@/features/assistant/tone";
import { cn } from "@/lib/utils";
import type { CoachingStyle, Profile } from "@/types";

const thisYear = new Date().getFullYear();

export const ProfileSchema = z.object({
  name: z.string().trim().min(1, "Tell TOMORA what to call you.").max(60),
  dream: z.string().trim().min(10, "Describe your ambition in a sentence or two.").max(1000),
  horizonYear: z.coerce
    .number<number>({ message: "Enter a year." })
    .int("Enter a whole year.")
    .min(thisYear + 1, `Pick a year after ${thisYear}.`)
    .max(thisYear + 30, `Pick a year before ${thisYear + 31}.`),
  current: z.string().trim().max(2000),
  resources: z.string().trim().max(2000),
  challenges: z.string().trim().max(2000),
  values: z.string().trim().max(300),
  style: z.enum(["reflective", "strategic", "encouraging", "analytical"]),
});
export type ProfileValues = z.infer<typeof ProfileSchema>;

export function toValues(p: Profile | null): ProfileValues {
  return {
    name: p?.name ?? "",
    dream: p?.dream ?? "",
    horizonYear: p?.horizonYear ?? thisYear + 10,
    current: p?.current ?? "",
    resources: p?.resources ?? "",
    challenges: p?.challenges ?? "",
    values: p?.values.join(", ") ?? "",
    style: p?.style ?? "reflective",
  };
}

export function toProfile(v: ProfileValues): Profile {
  return {
    ...v,
    values: v.values
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function useProfileForm(profile: Profile | null) {
  return useForm<ProfileValues>({ resolver: zodResolver(ProfileSchema), defaultValues: toValues(profile), mode: "onTouched" });
}

type Form = UseFormReturn<ProfileValues>;
type TextField = Exclude<keyof ProfileValues, "style" | "horizonYear">;

export function Field({ form, name, label, hint, multiline, rows = 3, placeholder }: { form: Form; name: TextField | "horizonYear"; label: string; hint?: string; multiline?: boolean; rows?: number; placeholder?: string }) {
  const err = form.formState.errors[name]?.message;
  const id = `pf-${name}`;
  const describedBy = [hint && `${id}-hint`, err && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea id={id} rows={rows} placeholder={placeholder} {...form.register(name)} aria-invalid={!!err} aria-describedby={describedBy} />
      ) : (
        <Input id={id} placeholder={placeholder} inputMode={name === "horizonYear" ? "numeric" : undefined} {...form.register(name)} aria-invalid={!!err} aria-describedby={describedBy} />
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-[12px] text-subtle">
          {hint}
        </p>
      )}
      {err && (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {err}
        </p>
      )}
    </div>
  );
}

const PLAN_LENGTHS = [3, 5, 10, 15];

/** Quick picks for how far ahead the plan reaches. They fill in the horizon year, which can still be typed. */
export function PlanLengthField({ form }: { form: Form }) {
  const year = Number(useWatch({ control: form.control, name: "horizonYear" }));
  return (
    <div role="group" aria-label="Plan length" className="flex flex-wrap gap-1.5">
      {PLAN_LENGTHS.map((n) => {
        const on = year === thisYear + n;
        return (
          <button
            key={n}
            type="button"
            aria-pressed={on}
            onClick={() => form.setValue("horizonYear", thisYear + n, { shouldDirty: true, shouldValidate: true })}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] transition-colors",
              on ? "border-accent/50 bg-accent-wash text-accent-ink" : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            In {n} years
          </button>
        );
      })}
    </div>
  );
}

export function StylePicker({ value, onChange, name = "style" }: { value: CoachingStyle; onChange: (v: CoachingStyle) => void; name?: string }) {
  return (
    <div role="radiogroup" aria-label="Coaching style" className="grid gap-2 sm:grid-cols-2">
      {TONES.map((t) => {
        const on = value === t.value;
        return (
          <label
            key={t.value}
            className={cn(
              "flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3.5 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              on ? "border-accent/50 bg-accent-wash" : "border-border bg-surface-2 hover:border-border-strong",
            )}
          >
            <input type="radio" name={name} value={t.value} checked={on} onChange={() => onChange(t.value)} className="sr-only" />
            <span className={cn("text-[13px] font-medium", on && "text-accent-ink")}>{t.label}</span>
            <span className="text-[12px] text-muted-foreground">{t.hint}</span>
          </label>
        );
      })}
    </div>
  );
}

export function StyleField({ form }: { form: Form }) {
  return <Controller control={form.control} name="style" render={({ field }) => <StylePicker value={field.value} onChange={field.onChange} />} />;
}
