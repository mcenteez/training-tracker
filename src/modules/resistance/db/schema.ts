import { sql } from "drizzle-orm";
import { pgEnum, type AnyPgColumn } from "drizzle-orm/pg-core";

import { resistanceTypes } from "@/modules/resistance/application/resistance";

export const resistanceUnits = ["kg", "lb"] as const;

export const resistanceType = pgEnum("resistance_type", resistanceTypes);
export const resistanceUnit = pgEnum("resistance_unit", resistanceUnits);

export function resistanceShapeSql(table: {
  resistanceType: AnyPgColumn;
  resistanceValue: AnyPgColumn;
  resistanceUnit: AnyPgColumn;
  resistancePercentage: AnyPgColumn;
  resistanceTarget: AnyPgColumn;
  resistanceDescription: AnyPgColumn;
  normalizedResistanceKg: AnyPgColumn;
}) {
  return sql`(
		${table.resistanceType} IS NULL
		AND ${table.resistanceValue} IS NULL
		AND ${table.resistanceUnit} IS NULL
		AND ${table.resistancePercentage} IS NULL
		AND ${table.resistanceTarget} IS NULL
		AND ${table.resistanceDescription} IS NULL
		AND ${table.normalizedResistanceKg} IS NULL
	) OR (
		${table.resistanceType} = 'fixed_weight'
		AND ${table.resistanceValue} > 0
		AND ${table.resistanceUnit} IS NOT NULL
		AND ${table.normalizedResistanceKg} > 0
		AND ${table.resistancePercentage} IS NULL
		AND ${table.resistanceTarget} IS NULL
		AND ${table.resistanceDescription} IS NULL
	) OR (
		${table.resistanceType} = 'percent_1rm'
		AND ${table.resistancePercentage} > 0
		AND ${table.resistancePercentage} <= 200
		AND ${table.resistanceValue} IS NULL
		AND ${table.resistanceUnit} IS NULL
		AND ${table.resistanceTarget} IS NULL
		AND ${table.resistanceDescription} IS NULL
		AND ${table.normalizedResistanceKg} IS NULL
	) OR (
		${table.resistanceType} = 'bodyweight'
		AND ${table.resistanceValue} IS NULL
		AND ${table.resistanceUnit} IS NULL
		AND ${table.resistancePercentage} IS NULL
		AND ${table.resistanceTarget} IS NULL
		AND ${table.resistanceDescription} IS NULL
		AND ${table.normalizedResistanceKg} IS NULL
	) OR (
		${table.resistanceType} IN ('band', 'free_text')
		AND length(trim(${table.resistanceDescription})) > 0
		AND ${table.resistanceValue} IS NULL
		AND ${table.resistanceUnit} IS NULL
		AND ${table.resistancePercentage} IS NULL
		AND ${table.resistanceTarget} IS NULL
		AND ${table.normalizedResistanceKg} IS NULL
	) OR (
		${table.resistanceType} = 'rpe'
		AND ${table.resistanceTarget} >= 1
		AND ${table.resistanceTarget} <= 10
		AND mod(${table.resistanceTarget} * 2, 1) = 0
		AND ${table.resistanceValue} IS NULL
		AND ${table.resistanceUnit} IS NULL
		AND ${table.resistancePercentage} IS NULL
		AND ${table.resistanceDescription} IS NULL
		AND ${table.normalizedResistanceKg} IS NULL
	) OR (
		${table.resistanceType} = 'rir'
		AND ${table.resistanceTarget} >= 0
		AND ${table.resistanceTarget} <= 10
		AND mod(${table.resistanceTarget}, 1) = 0
		AND ${table.resistanceValue} IS NULL
		AND ${table.resistanceUnit} IS NULL
		AND ${table.resistancePercentage} IS NULL
		AND ${table.resistanceDescription} IS NULL
		AND ${table.normalizedResistanceKg} IS NULL
	)`;
}
