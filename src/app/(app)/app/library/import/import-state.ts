import type { ImportDiagnostic } from "@/modules/library-import/application/diagnostics";
import type { PlannedAction } from "@/modules/library-import/application/import-plan";

export interface LibraryImportEntry {
  entity: "exercise" | "workout" | "plan";
  name: string;
  action: PlannedAction;
}

export interface LibraryImportState {
  status: "idle" | "rejected" | "previewed" | "imported";
  message?: string;
  diagnostics: ImportDiagnostic[];
  entries: LibraryImportEntry[];
  canCommit: boolean;
  /** Validated source, replayed to the commit action so the user need not re-upload. */
  source?: string;
  created?: { exercises: number; workouts: number; plans: number };
}

export const initialLibraryImportState: LibraryImportState = {
  status: "idle",
  diagnostics: [],
  entries: [],
  canCommit: false,
};
