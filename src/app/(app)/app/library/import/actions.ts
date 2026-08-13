"use server";

import { revalidatePath } from "next/cache";

import { withDatabase } from "@/db/client";
import { loadLibraryAppContext } from "@/lib/library-context";
import { AuthorizationError } from "@/modules/access-control/errors";
import { libraryImportLimits } from "@/modules/library-import/application/format";
import {
  commitLibraryImport,
  previewLibraryImport,
  type LibraryImportMode,
} from "@/modules/library-import/application/import-service";
import type { PlannedAction } from "@/modules/library-import/application/import-plan";
import { parseLibraryImportBundle } from "@/modules/library-import/application/parse-bundle";
import { createLibraryImportUnitOfWork } from "@/modules/library-import/db/unit-of-work";

import {
  initialLibraryImportState,
  type LibraryImportEntry,
  type LibraryImportState,
} from "./import-state";

function failed(message: string, code: string): LibraryImportState {
  return {
    ...initialLibraryImportState,
    status: "rejected",
    message,
    diagnostics: [
      {
        severity: "error",
        entity: "bundle",
        location: "(root)",
        code,
        message,
      },
    ],
  };
}

async function readSource(
  formData: FormData,
): Promise<
  { ok: true; source: string } | { ok: false; state: LibraryImportState }
> {
  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "").trim();
  const hasFile = file instanceof File && file.size > 0;

  if (hasFile && pasted) {
    return {
      ok: false,
      state: failed(
        "Choose a file or paste JSON, not both.",
        "ambiguous_source",
      ),
    };
  }

  if (!hasFile && !pasted) {
    return {
      ok: false,
      state: failed("Choose a JSON file or paste JSON.", "missing_source"),
    };
  }

  if (hasFile && file.size > libraryImportLimits.fileBytes) {
    return {
      ok: false,
      state: failed(
        `Imports are limited to ${Math.floor(libraryImportLimits.fileBytes / 1024)} KB.`,
        "too_large",
      ),
    };
  }

  return { ok: true, source: hasFile ? await file.text() : pasted };
}

function entriesFrom(plan: {
  exercises: { name: string; action: PlannedAction }[];
  workouts: { name: string; action: PlannedAction }[];
  plans: { name: string; action: PlannedAction }[];
}): LibraryImportEntry[] {
  return [
    ...plan.exercises.map((entry) => ({
      entity: "exercise" as const,
      ...entry,
    })),
    ...plan.workouts.map((entry) => ({ entity: "workout" as const, ...entry })),
    ...plan.plans.map((entry) => ({ entity: "plan" as const, ...entry })),
  ];
}

function readMode(formData: FormData): LibraryImportMode {
  return formData.get("mode") === "activate" ? "activate" : "draft";
}

export async function previewLibraryImportAction(
  _previousState: LibraryImportState,
  formData: FormData,
): Promise<LibraryImportState> {
  const source = await readSource(formData);

  if (!source.ok) return source.state;

  const parsed = parseLibraryImportBundle(source.source);
  const mode = readMode(formData);

  if (!parsed.ok) {
    return {
      ...initialLibraryImportState,
      status: "rejected",
      message: "This file could not be read.",
      diagnostics: parsed.diagnostics,
    };
  }

  const context = await loadLibraryAppContext();

  try {
    const plan = await withDatabase((database) =>
      previewLibraryImport(createLibraryImportUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        bundle: parsed.bundle,
        mode,
      }),
    );

    return {
      status: plan.canCommit ? "previewed" : "rejected",
      message: plan.canCommit
        ? undefined
        : "Nothing can be imported from this file yet.",
      diagnostics: plan.diagnostics,
      entries: entriesFrom(plan),
      canCommit: plan.canCommit,
      source: plan.canCommit ? source.source : undefined,
      mode,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return failed("You cannot import into this library.", "forbidden");
    }

    throw error;
  }
}

export async function commitLibraryImportAction(
  _previousState: LibraryImportState,
  formData: FormData,
): Promise<LibraryImportState> {
  const parsed = parseLibraryImportBundle(String(formData.get("source") ?? ""));
  const mode = readMode(formData);

  if (!parsed.ok) {
    return {
      ...initialLibraryImportState,
      status: "rejected",
      message: "This file could not be read.",
      diagnostics: parsed.diagnostics,
    };
  }

  const context = await loadLibraryAppContext();

  try {
    const result = await withDatabase((database) =>
      commitLibraryImport(createLibraryImportUnitOfWork(database), {
        organizationId: context.membership.organizationId,
        actorUserId: context.user.id,
        bundle: parsed.bundle,
        mode,
      }),
    );

    if (result.status === "rejected") {
      return {
        status: "rejected",
        message:
          "Your library changed while you were reviewing. Nothing was imported.",
        diagnostics: result.plan.diagnostics,
        entries: entriesFrom(result.plan),
        canCommit: false,
      };
    }

    revalidatePath("/app/library/exercises");
    revalidatePath("/app/library/workouts");
    revalidatePath("/app/library/plans");

    return {
      status: "imported",
      diagnostics: result.plan.diagnostics,
      entries: entriesFrom(result.plan),
      canCommit: false,
      created: result.created,
      mode,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return failed("You cannot import into this library.", "forbidden");
    }

    throw error;
  }
}
