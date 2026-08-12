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

      <ImportResults state={state}>
        {showCommit ? (
          <form action={commitAction}>
            <input type="hidden" name="source" value={previewState.source} />
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
