export const libraryImportFormatVersion = 1;

export const libraryImportLimits = {
  fileBytes: 512 * 1024,
  exercises: 500,
  workouts: 200,
  plans: 50,
  blocksPerWorkout: 30,
  itemsPerBlock: 50,
  scheduleSlotsPerPlan: 300,
  diagnostics: 200,
} as const;

export const libraryImportSchemaPath = "/schemas/library-import/v1.json";

export const libraryImportConflictStrategies = ["skip", "fail"] as const;

export type LibraryImportConflictStrategy =
  (typeof libraryImportConflictStrategies)[number];

/** Matches the case-insensitive `lower(name)` partial unique indexes in Postgres. */
export function normalizeImportName(name: string): string {
  return name.trim().toLowerCase();
}
