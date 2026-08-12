import { describe, expect, it } from "vitest";

import { libraryImportLimits } from "./format";
import { parseLibraryImportBundle } from "./parse-bundle";

function bundle(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    formatVersion: 1,
    exercises: [{ name: "Back Squat", category: "strength" }],
    ...overrides,
  });
}

function codes(result: ReturnType<typeof parseLibraryImportBundle>) {
  return result.ok ? [] : result.diagnostics.map((entry) => entry.code);
}

describe("parseLibraryImportBundle", () => {
  it("accepts a minimal bundle and applies defaults", () => {
    const result = parseLibraryImportBundle(bundle());

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.bundle.exercises[0]).toMatchObject({
      name: "Back Squat",
      category: "strength",
      instructions: null,
      videoUrl: null,
      equipment: [],
    });
    expect(result.bundle.workouts).toEqual([]);
    expect(result.bundle.plans).toEqual([]);
  });

  it("ignores a byte order mark and a $schema key", () => {
    const result = parseLibraryImportBundle(
      `\uFEFF${bundle({ $schema: "https://example.com/v1.json" })}`,
    );

    expect(result.ok).toBe(true);
  });

  it("reports malformed JSON as a single diagnostic", () => {
    const result = parseLibraryImportBundle('{ "formatVersion": 1, }');

    expect(codes(result)).toEqual(["invalid_json"]);
  });

  it("rejects a non-object root", () => {
    expect(codes(parseLibraryImportBundle("[]"))).toEqual(["invalid_root"]);
  });

  it("rejects an empty source", () => {
    expect(codes(parseLibraryImportBundle("   "))).toEqual(["empty_source"]);
  });

  it("rejects an unsupported format version with an explicit message", () => {
    const result = parseLibraryImportBundle(
      JSON.stringify({ formatVersion: 2, exercises: [] }),
    );

    expect(codes(result)).toEqual(["unsupported_format_version"]);
  });

  it("rejects a bundle with no entities", () => {
    const result = parseLibraryImportBundle(
      JSON.stringify({ formatVersion: 1, exercises: [] }),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects unknown keys so invented fields are not silently dropped", () => {
    const result = parseLibraryImportBundle(
      JSON.stringify({
        formatVersion: 1,
        exercises: [{ name: "Back Squat", category: "strength", sets: 5 }],
      }),
    );

    expect(result.ok).toBe(false);

    if (result.ok) return;

    expect(result.diagnostics[0]?.location).toBe("exercises[0]");
    expect(result.diagnostics[0]?.entity).toBe("exercise");
  });

  it("reports nested problems with a JSON path", () => {
    const result = parseLibraryImportBundle(
      JSON.stringify({
        formatVersion: 1,
        workouts: [
          {
            name: "Lower Body A",
            blocks: [{ items: [{ exercise: "Back Squat", reps: -1 }] }],
          },
        ],
      }),
    );

    expect(result.ok).toBe(false);

    if (result.ok) return;

    expect(result.diagnostics[0]?.location).toBe(
      "workouts[0].blocks[0].items[0].reps",
    );
    expect(result.diagnostics[0]?.entity).toBe("workout");
  });

  it("requires a prescription or note on every workout item", () => {
    const result = parseLibraryImportBundle(
      JSON.stringify({
        formatVersion: 1,
        workouts: [
          {
            name: "Lower Body A",
            blocks: [{ items: [{ exercise: "Back Squat" }] }],
          },
        ],
      }),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects a non-http video url", () => {
    const result = parseLibraryImportBundle(
      bundle({
        exercises: [
          {
            name: "Back Squat",
            category: "strength",
            videoUrl: "javascript:alert(1)",
          },
        ],
      }),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects a plan slot that mixes both scheduling modes", () => {
    const result = parseLibraryImportBundle(
      JSON.stringify({
        formatVersion: 1,
        plans: [
          {
            name: "Offseason Base",
            scheduleSlots: [
              {
                scheduleType: "fixed_day",
                workout: "Lower Body A",
                dayOfWeek: "monday",
                targetSessionsPerWeek: 2,
              },
            ],
          },
        ],
      }),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects a payload over the byte cap", () => {
    const filler = "x".repeat(libraryImportLimits.fileBytes);
    const result = parseLibraryImportBundle(
      bundle({
        exercises: [
          { name: "Back Squat", category: "strength", instructions: filler },
        ],
      }),
    );

    expect(codes(result)).toEqual(["too_large"]);
  });
});
