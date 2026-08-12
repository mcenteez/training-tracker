import { z } from "zod";

import { libraryImportBundleSchema } from "./bundle-input";
import { libraryImportSchemaPath } from "./format";

export function buildLibraryImportJsonSchema(
  origin: string,
): Record<string, unknown> {
  const generated = z.toJSONSchema(libraryImportBundleSchema, {
    target: "draft-2020-12",
    io: "input",
  }) as Record<string, unknown>;

  return {
    ...generated,
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${origin}${libraryImportSchemaPath}`,
    title: "Training Tracker library import bundle",
    description:
      "Bulk import format for exercises, workouts, and plans. Workout items reference an exercise by name and plan slots reference a workout by name; each name must be defined in the same file or already exist in the organization's library. Two rules cannot be expressed in JSON Schema and are enforced on import: every workout item needs at least one of reps, load, durationSeconds, distanceMeters, restSeconds, tempo, or notes; and the bundle must contain at least one exercise, workout, or plan.",
  };
}
