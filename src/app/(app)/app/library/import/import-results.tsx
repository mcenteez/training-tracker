"use client";

import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

import type { LibraryImportState } from "./import-state";

const entityLabels = {
  exercise: "Exercise",
  workout: "Workout",
  plan: "Plan",
  bundle: "File",
} as const;

function DiagnosticList({ state }: { state: LibraryImportState }) {
  const errors = state.diagnostics.filter(
    (entry) => entry.severity === "error",
  );
  const warnings = state.diagnostics.filter(
    (entry) => entry.severity === "warning",
  );

  return (
    <>
      {errors.length ? (
        <section role="alert" aria-label="Import errors" className="space-y-2">
          <h4 className="text-sm font-semibold text-destructive">
            {errors.length} problem{errors.length === 1 ? "" : "s"} to fix
          </h4>
          <ul className="space-y-1.5 border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            {errors.map((entry, index) => (
              <li key={`${entry.location}-${index}`}>
                <code className="text-xs text-muted-foreground">
                  {entry.location}
                </code>{" "}
                {entry.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {warnings.length ? (
        <section aria-label="Import warnings" className="space-y-2">
          <h4 className="text-sm font-semibold">
            {warnings.length} item{warnings.length === 1 ? "" : "s"} already in
            your library
          </h4>
          <ul className="space-y-1.5 border border-border bg-muted/40 px-4 py-3 text-sm">
            {warnings.map((entry, index) => (
              <li key={`${entry.location}-${index}`}>{entry.message}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function ImportEntries({ state }: { state: LibraryImportState }) {
  if (!state.entries.length) return null;

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Entities found in this file</caption>
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
          <th scope="col" className="py-2 pr-4 font-medium">
            Type
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Name
          </th>
          <th scope="col" className="py-2 font-medium">
            Outcome
          </th>
        </tr>
      </thead>
      <tbody>
        {state.entries.map((entry) => (
          <tr
            key={`${entry.entity}-${entry.name}`}
            className="border-b border-border/60"
          >
            <td className="py-2 pr-4 text-muted-foreground">
              {entityLabels[entry.entity]}
            </td>
            <td className="py-2 pr-4 font-medium">{entry.name}</td>
            <td
              className={cn(
                "py-2",
                entry.action === "create"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {entry.action === "create"
                ? state.status === "imported"
                  ? "Created"
                  : "Will be created"
                : "Already exists, skipped"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ImportResults({
  state,
  children,
}: {
  state: LibraryImportState;
  children?: React.ReactNode;
}) {
  if (state.status === "idle") return null;

  return (
    <section
      aria-label="Import results"
      aria-live="polite"
      className="space-y-5 border-t border-border pt-6"
    >
      {state.created ? (
        <p className="flex items-center gap-2 border border-primary/25 bg-primary/10 px-4 py-3 text-sm">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          Imported {state.created.exercises} exercise
          {state.created.exercises === 1 ? "" : "s"}, {state.created.workouts}{" "}
          workout{state.created.workouts === 1 ? "" : "s"}, and{" "}
          {state.created.plans} plan{state.created.plans === 1 ? "" : "s"}.
          Workouts and plans were created as drafts.
        </p>
      ) : null}

      {state.message ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}

      <DiagnosticList state={state} />
      <ImportEntries state={state} />
      {children}
    </section>
  );
}
