import { z } from "zod";

import { libraryImportBundleSchema } from "./bundle-input";
import {
  libraryImportSchemaPath,
  structuredResistanceImportSchemaPath,
} from "./format";

export function buildLibraryImportJsonSchema(
  origin: string,
  formatVersion: 1 | 2 = 1,
): Record<string, unknown> {
  const generated = z.toJSONSchema(libraryImportBundleSchema, {
    target: "draft-2020-12",
    io: "input",
  }) as Record<string, unknown>;

  const definitions = generated.$defs as
    Record<string, { properties?: Record<string, unknown> }> | undefined;
  const itemProperties = definitions?.ImportWorkoutItem?.properties;
  if (itemProperties) {
    delete itemProperties[formatVersion === 1 ? "resistance" : "load"];
  }
  const properties = generated.properties as Record<string, unknown>;
  properties.formatVersion = { type: "number", const: formatVersion };
  const schemaPath =
    formatVersion === 1
      ? libraryImportSchemaPath
      : structuredResistanceImportSchemaPath;

  return {
    ...generated,
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${origin}${schemaPath}`,
    title: "Training Tracker library import bundle",
    description: `Bulk import format version ${formatVersion} for exercises, workouts, and plans. Workout items reference an exercise by name and plan slots reference a workout by name; each name must be defined in the same file or already exist in the organization's library. Rules that JSON Schema cannot express are enforced on import, including non-empty programming and bundles.`,
  };
}
