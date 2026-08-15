import { z } from "zod";

export const resistanceTypes = [
  "fixed_weight",
  "percent_1rm",
  "bodyweight",
  "band",
  "rpe",
  "rir",
  "free_text",
] as const;

export const resultResistanceTypes = [
  "fixed_weight",
  "bodyweight",
  "band",
  "free_text",
] as const;

const fixedWeightResistanceSchema = z
  .object({
    type: z.literal("fixed_weight"),
    value: z.number().finite().positive(),
    unit: z.enum(["kg", "lb"]),
  })
  .strict();

const percentOneRepMaxResistanceSchema = z
  .object({
    type: z.literal("percent_1rm"),
    percentage: z.number().finite().positive().max(200),
  })
  .strict();

const bodyweightResistanceSchema = z
  .object({ type: z.literal("bodyweight") })
  .strict();

const bandResistanceSchema = z
  .object({
    type: z.literal("band"),
    description: z.string().trim().min(1).max(80),
  })
  .strict();

const rpeResistanceSchema = z
  .object({
    type: z.literal("rpe"),
    target: z.number().finite().min(1).max(10).multipleOf(0.5),
  })
  .strict();

const rirResistanceSchema = z
  .object({
    type: z.literal("rir"),
    target: z.number().int().min(0).max(10),
  })
  .strict();

const freeTextResistanceSchema = z
  .object({
    type: z.literal("free_text"),
    description: z.string().trim().min(1).max(80),
  })
  .strict();

export const resistanceSchema = z.discriminatedUnion("type", [
  fixedWeightResistanceSchema,
  percentOneRepMaxResistanceSchema,
  bodyweightResistanceSchema,
  bandResistanceSchema,
  rpeResistanceSchema,
  rirResistanceSchema,
  freeTextResistanceSchema,
]);

export const resultResistanceSchema = z.discriminatedUnion("type", [
  fixedWeightResistanceSchema,
  bodyweightResistanceSchema,
  bandResistanceSchema,
  freeTextResistanceSchema,
]);

export type Resistance = z.infer<typeof resistanceSchema>;
export type ResultResistance = z.infer<typeof resultResistanceSchema>;
export type FixedWeightResistance = Extract<
  Resistance,
  { type: "fixed_weight" }
>;
export type ResistanceUnit = FixedWeightResistance["unit"];

export interface NormalizedFixedWeightResistance extends FixedWeightResistance {
  normalizedWeightKg: number;
}

export type ResistanceMetricUnavailableReason =
  | "missing_resistance"
  | "relative_resistance"
  | "non_weight_resistance"
  | "legacy_resistance";

export type ResistanceMetricEligibility =
  | { eligible: true; normalizedWeightKg: number }
  | { eligible: false; reason: ResistanceMetricUnavailableReason };

export type ResistanceSource = "structured" | "legacy_numeric" | "legacy_text";

export interface AdaptedResistance {
  resistance: Resistance | null;
  normalizedWeightKg: number | null;
  source: ResistanceSource | null;
}

const POUNDS_TO_KILOGRAMS = 0.45359237;

export function normalizeFixedWeightResistance(
  resistance: FixedWeightResistance,
): NormalizedFixedWeightResistance {
  return {
    ...resistance,
    normalizedWeightKg:
      resistance.unit === "lb"
        ? resistance.value * POUNDS_TO_KILOGRAMS
        : resistance.value,
  };
}

export function formatResistance(resistance: Resistance): string {
  switch (resistance.type) {
    case "fixed_weight":
      return `${resistance.value} ${resistance.unit}`;
    case "percent_1rm":
      return `${resistance.percentage}% 1RM`;
    case "bodyweight":
      return "Bodyweight";
    case "band":
    case "free_text":
      return resistance.description;
    case "rpe":
      return `RPE ${resistance.target}`;
    case "rir":
      return `${resistance.target} RIR`;
  }
}

export function resistanceMetricEligibility(
  resistance: Resistance | null,
  source: ResistanceSource = "structured",
): ResistanceMetricEligibility {
  if (!resistance) return { eligible: false, reason: "missing_resistance" };
  if (source === "legacy_text") {
    return { eligible: false, reason: "legacy_resistance" };
  }
  if (resistance.type === "fixed_weight") {
    return {
      eligible: true,
      normalizedWeightKg:
        normalizeFixedWeightResistance(resistance).normalizedWeightKg,
    };
  }
  if (resistance.type === "percent_1rm") {
    return { eligible: false, reason: "relative_resistance" };
  }
  return { eligible: false, reason: "non_weight_resistance" };
}

export function adaptResistance(input: {
  resistance: Resistance | null;
  legacyLoad: string | null;
  legacyLoadValue: string | null;
  legacyLoadUnit: ResistanceUnit | null;
  legacyNormalizedLoadKg: string | null;
}): AdaptedResistance {
  if (input.resistance) {
    const eligibility = resistanceMetricEligibility(input.resistance);
    return {
      resistance: input.resistance,
      normalizedWeightKg: eligibility.eligible
        ? eligibility.normalizedWeightKg
        : null,
      source: "structured",
    };
  }

  const value = Number(input.legacyLoadValue);
  const normalizedWeightKg = Number(input.legacyNormalizedLoadKg);
  if (
    input.legacyLoadValue !== null &&
    input.legacyLoadUnit !== null &&
    input.legacyNormalizedLoadKg !== null &&
    Number.isFinite(value) &&
    value > 0 &&
    Number.isFinite(normalizedWeightKg) &&
    normalizedWeightKg > 0
  ) {
    return {
      resistance: {
        type: "fixed_weight",
        value,
        unit: input.legacyLoadUnit,
      },
      normalizedWeightKg,
      source: "legacy_numeric",
    };
  }

  if (input.legacyLoad?.trim()) {
    return {
      resistance: {
        type: "free_text",
        description: input.legacyLoad,
      },
      normalizedWeightKg: null,
      source: "legacy_text",
    };
  }

  return { resistance: null, normalizedWeightKg: null, source: null };
}
