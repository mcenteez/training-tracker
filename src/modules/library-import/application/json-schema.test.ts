import { describe, expect, it } from "vitest";

import { buildLibraryImportJsonSchema } from "./json-schema";

interface JsonSchemaNode {
  [key: string]: unknown;
  properties?: Record<string, JsonSchemaNode>;
  $defs?: Record<string, JsonSchemaNode>;
  oneOf?: JsonSchemaNode[];
  required?: string[];
}

const schema = buildLibraryImportJsonSchema(
  "https://example.test",
) as JsonSchemaNode;

function definition(name: string): JsonSchemaNode {
  const found = schema.$defs?.[name];

  if (!found) {
    throw new Error(`Missing definition ${name}`);
  }

  return found;
}

describe("buildLibraryImportJsonSchema", () => {
  it("publishes a draft 2020-12 document at the versioned id", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe(
      "https://example.test/schemas/library-import/v1.json",
    );
  });

  it("describes the three top-level collections", () => {
    expect(Object.keys(schema.properties ?? {})).toEqual(
      expect.arrayContaining([
        "formatVersion",
        "exercises",
        "workouts",
        "plans",
      ]),
    );
    expect(schema.properties?.exercises?.type).toBe("array");
    expect(schema.properties?.formatVersion?.const).toBe(1);
    expect(schema.required).toEqual(["formatVersion"]);
  });

  it("allows $schema so an annotated file still validates", () => {
    expect(schema.properties?.$schema).toBeDefined();
    expect(schema.additionalProperties).toBe(false);
  });

  it("names the reference fields so an agent knows they are not identifiers", () => {
    const item = definition("ImportWorkoutItem");
    const slot = definition("ImportPlanScheduleSlot");

    expect(item.properties?.exercise?.description).toContain("Name of an");
    expect(slot.oneOf?.[0]?.properties?.workout?.description).toContain(
      "Name of a workout",
    );
  });

  it("converts the plan slot discriminated union to two exclusive branches", () => {
    const branches = definition("ImportPlanScheduleSlot").oneOf ?? [];

    expect(branches).toHaveLength(2);
    expect(
      branches.map((branch) => branch.properties?.scheduleType?.const),
    ).toEqual(["fixed_day", "weekly_frequency"]);
    expect(branches[0]?.properties?.targetSessionsPerWeek).toBeUndefined();
    expect(branches[1]?.properties?.dayOfWeek).toBeUndefined();
  });

  it("documents input shape rather than post-transform output", () => {
    const exercise = definition("ImportExercise");

    expect(exercise.required).toEqual(["name"]);
    expect(exercise.properties?.category?.enum).toContain("strength");
    expect(exercise.additionalProperties).toBe(false);
  });

  it("carries the limits the importer enforces", () => {
    expect(schema.properties?.exercises?.maxItems).toBe(500);
    expect(definition("ImportWorkout").properties?.blocks?.maxItems).toBe(30);
    expect(definition("ImportWorkoutBlock").properties?.items?.maxItems).toBe(
      50,
    );
  });

  it("documents the rules JSON Schema cannot express", () => {
    expect(String(schema.description)).toContain("enforced on import");
  });
});
