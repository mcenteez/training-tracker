import type { LibraryImportBundle } from "./bundle-input";
import {
  libraryImportLimits,
  structuredResistanceImportFormatVersion,
} from "./format";

export const libraryImportExample = {
  $schema: "https://example.com/schemas/library-import/v2.json",
  formatVersion: structuredResistanceImportFormatVersion,
  exercises: [
    {
      name: "Back Squat",
      instructions: "Brace, sit between the hips, drive through midfoot.",
      category: "strength",
      equipment: ["barbell", "rack"],
      videoUrl: "https://example.com/back-squat",
    },
    {
      name: "Tempo Run",
      category: "conditioning",
      equipment: [],
    },
  ],
  workouts: [
    {
      name: "Lower Body A",
      description: "Week 1 primary lower session.",
      blocks: [
        {
          type: "straight",
          label: "Primary",
          rounds: 1,
          items: [
            {
              exercise: "Back Squat",
              reps: 5,
              resistance: { type: "percent_1rm", percentage: 75 },
              restSeconds: 180,
              tempo: "31X1",
            },
          ],
        },
      ],
    },
    {
      name: "Conditioning A",
      blocks: [
        {
          type: "straight",
          rounds: 1,
          items: [{ exercise: "Tempo Run", durationSeconds: 1200 }],
        },
      ],
    },
  ],
  plans: [
    {
      name: "Offseason Base",
      description: "Four-week base block.",
      scheduleSlots: [
        {
          scheduleType: "fixed_day",
          workout: "Lower Body A",
          dayOfWeek: "monday",
          label: "Main lift day",
        },
        {
          scheduleType: "weekly_frequency",
          workout: "Conditioning A",
          targetSessionsPerWeek: 2,
        },
      ],
    },
  ],
} satisfies Record<string, unknown>;

export function buildLibraryImportPrompt(schemaUrl: string): string {
  return [
    "Generate a strength and conditioning program as a single JSON document.",
    "",
    `Follow this JSON Schema exactly: ${schemaUrl}`,
    "Fetch the schema and validate your output against it before replying. Return only the JSON document, with no commentary or code fence.",
    "",
    "Rules the schema cannot express:",
    "- Every workout item needs programming such as reps, structured resistance, durationSeconds, distanceMeters, restSeconds, tempo, or notes.",
    "- Choose exactly one resistance type when resistance is prescribed: fixed_weight, percent_1rm, bodyweight, band, rpe, rir, or free_text.",
    "- Do not invent a fixed weight when athlete-specific strength context is unavailable; use percent_1rm, rpe, rir, bodyweight, band, or free_text as appropriate.",
    "- Workout items reference an exercise by its exact name, and plan slots reference a workout by its exact name. Every referenced name must be defined in the same document.",
    "- Names are unique per type, ignoring case.",
    '- A plan slot uses either scheduleType "fixed_day" with dayOfWeek, or scheduleType "weekly_frequency" with targetSessionsPerWeek. Never both.',
    "",
    "Limits:",
    `- Up to ${libraryImportLimits.exercises} exercises, ${libraryImportLimits.workouts} workouts, and ${libraryImportLimits.plans} plans.`,
    `- Up to ${libraryImportLimits.blocksPerWorkout} blocks per workout and ${libraryImportLimits.itemsPerBlock} items per block.`,
    `- The whole document must stay under ${Math.floor(libraryImportLimits.fileBytes / 1024)} KB.`,
    "",
    "Now generate a program for: <describe the sport, athletes, training block, and weekly structure here>.",
  ].join("\n");
}

export const libraryImportExampleJson = JSON.stringify(
  libraryImportExample,
  null,
  2,
) satisfies string;

export type LibraryImportExample = typeof libraryImportExample &
  Partial<LibraryImportBundle>;
