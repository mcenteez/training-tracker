"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, FileJson, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  commitLibraryImportAction,
  initialLibraryImportState,
  previewLibraryImportAction,
  type LibraryImportState,
} from "./actions";

const entityLabels = {
  exercise: "Exercise",
  workout: "Workout",
  plan: "Plan",
  bundle: "File",
} as const;

function DiagnosticList({ state }: { state: LibraryImportState }) {
  if (!state.diagnostics.length) return null;

  const errors = state.diagnostics.filter(
    (entry) => entry.severity === "error",
  );
  const warnings = state.diagnostics.filter(
    (entry) => entry.severity === "warning",
  );

  return (
    <div className="space-y-4">
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
    </div>
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

export function LibraryImportForm() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewLibraryImportAction,
    initialLibraryImportState,
  );
  const [commitState, commitAction, commitPending] = useActionState(
    commitLibraryImportAction,
    initialLibraryImportState,
  );
  const [pasted, setPasted] = useState("");

  const state = commitState.status === "idle" ? previewState : commitState;
  const created = commitState.created;

  return (
    <div className="space-y-8">
      <form action={previewAction} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="file" className="text-sm font-medium">
            Upload a JSON file
          </label>
          <Input
            id="file"
            name="file"
            type="file"
            accept="application/json,.json"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-2">
          <label htmlFor="pasted" className="text-sm font-medium">
            Paste JSON
          </label>
          <textarea
            id="pasted"
            name="pasted"
            rows={8}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder='{ "formatVersion": 1, "exercises": [] }'
            className="w-full border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>

        <Button type="submit" disabled={previewPending}>
          <Upload aria-hidden="true" />
          {previewPending ? "Checking..." : "Check this import"}
        </Button>
      </form>

      {state.status !== "idle" ? (
        <section
          aria-label="Import results"
          aria-live="polite"
          className="space-y-5 border-t border-border pt-6"
        >
          {created ? (
            <p className="flex items-center gap-2 border border-primary/25 bg-primary/10 px-4 py-3 text-sm">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Imported {created.exercises} exercise
              {created.exercises === 1 ? "" : "s"}, {created.workouts} workout
              {created.workouts === 1 ? "" : "s"}, and {created.plans} plan
              {created.plans === 1 ? "" : "s"}. Workouts and plans were created
              as drafts.
            </p>
          ) : null}

          {state.message ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {state.message}
            </p>
          ) : null}

          <DiagnosticList state={state} />
          <ImportEntries state={state} />

          {previewState.canCommit && commitState.status !== "imported" ? (
            <form action={commitAction}>
              <input type="hidden" name="source" value={previewState.source} />
              <Button type="submit" disabled={commitPending}>
                <FileJson aria-hidden="true" />
                {commitPending ? "Importing..." : "Import into my library"}
              </Button>
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
