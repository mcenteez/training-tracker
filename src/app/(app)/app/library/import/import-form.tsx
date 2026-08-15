"use client";

import { useActionState, useState } from "react";
import { FileJson, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  commitLibraryImportAction,
  previewLibraryImportAction,
} from "./actions";
import { ImportResults } from "./import-results";
import { initialLibraryImportState } from "./import-state";

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
  const showCommit =
    previewState.canCommit && commitState.status !== "imported";

  return (
    <div className="space-y-8">
      <form action={previewAction} className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Imported content status
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer gap-3 border border-border bg-card px-3 py-3 text-sm has-checked:border-primary has-checked:bg-primary/5">
              <input
                type="radio"
                name="mode"
                value="draft"
                defaultChecked
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">Import as drafts</span>
                <span className="text-xs text-muted-foreground">
                  Review workouts and plans before activating them.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 border border-border bg-card px-3 py-3 text-sm has-checked:border-primary has-checked:bg-primary/5">
              <input
                type="radio"
                name="mode"
                value="activate"
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">Import and activate</span>
                <span className="text-xs text-muted-foreground">
                  Requires complete workouts and plans with active workout
                  references.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

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
            placeholder='{ "formatVersion": 2, "exercises": [] }'
            className="w-full border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>

        <Button type="submit" disabled={previewPending}>
          <Upload aria-hidden="true" />
          {previewPending ? "Checking..." : "Check this import"}
        </Button>
      </form>

      <ImportResults state={state}>
        {showCommit ? (
          <form action={commitAction}>
            <input type="hidden" name="source" value={previewState.source} />
            <input
              type="hidden"
              name="mode"
              value={previewState.mode ?? "draft"}
            />
            <Button type="submit" disabled={commitPending}>
              <FileJson aria-hidden="true" />
              {commitPending ? "Importing..." : "Import into my library"}
            </Button>
          </form>
        ) : null}
      </ImportResults>
    </div>
  );
}
