"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatResistance,
  type Resistance,
} from "@/modules/resistance/application/resistance";

export function ResistanceOverrideFields({
  baseResistance,
  overrideResistance,
  defaultChecked,
  compact = false,
}: {
  baseResistance: Resistance | null;
  overrideResistance: Resistance | null;
  defaultChecked: boolean;
  compact?: boolean;
}) {
  const [resistance, setResistance] = useState<Resistance>(
    overrideResistance ??
      baseResistance ?? { type: "fixed_weight", value: 1, unit: "lb" },
  );
  const height = compact
    ? "data-[size=default]:h-8"
    : "data-[size=default]:h-9";

  function changeType(type: Resistance["type"]) {
    const values: Record<Resistance["type"], Resistance> = {
      fixed_weight: { type: "fixed_weight", value: 1, unit: "lb" },
      percent_1rm: { type: "percent_1rm", percentage: 80 },
      bodyweight: { type: "bodyweight" },
      band: { type: "band", description: "Band" },
      rpe: { type: "rpe", target: 8 },
      rir: { type: "rir", target: 2 },
      free_text: { type: "free_text", description: "Resistance" },
    };
    setResistance(values[type]);
  }

  return (
    <fieldset className="grid gap-2 sm:col-span-2">
      <label className="text-xs">
        <input
          type="checkbox"
          name="overriddenFields"
          value="resistance"
          defaultChecked={defaultChecked}
        />{" "}
        Resistance (base{" "}
        {baseResistance ? formatResistance(baseResistance) : "-"})
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs">
          Type
          <Select
            name="resistanceType"
            value={resistance.type}
            onValueChange={changeType}
          >
            <SelectTrigger className={height} aria-label="Resistance type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed_weight">Fixed weight</SelectItem>
              <SelectItem value="percent_1rm">% 1RM</SelectItem>
              <SelectItem value="bodyweight">Bodyweight</SelectItem>
              <SelectItem value="band">Band</SelectItem>
              <SelectItem value="rpe">Target RPE</SelectItem>
              <SelectItem value="rir">Target RIR</SelectItem>
              <SelectItem value="free_text">Free text</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {resistance.type === "fixed_weight" ? (
          <>
            <label className="grid gap-1 text-xs">
              Weight value
              <Input
                name="resistanceValue"
                aria-label="Weight value"
                className={compact ? "h-8" : "h-9"}
                type="number"
                min="0.01"
                step="any"
                value={resistance.value}
                onChange={(event) =>
                  setResistance({
                    ...resistance,
                    value: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="grid gap-1 text-xs">
              Weight unit
              <Select
                name="resistanceUnit"
                value={resistance.unit}
                onValueChange={(unit: "kg" | "lb") =>
                  setResistance({ ...resistance, unit })
                }
              >
                <SelectTrigger className={height} aria-label="Weight unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lb">lb</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </>
        ) : null}
        {resistance.type === "percent_1rm" ? (
          <label className="grid gap-1 text-xs">
            Percentage of 1RM
            <Input
              name="resistancePercentage"
              aria-label="Percentage of 1RM"
              className={compact ? "h-8" : "h-9"}
              type="number"
              min="0.01"
              max="200"
              step="any"
              value={resistance.percentage}
              onChange={(event) =>
                setResistance({
                  ...resistance,
                  percentage: Number(event.target.value),
                })
              }
            />
          </label>
        ) : null}
        {resistance.type === "band" || resistance.type === "free_text" ? (
          <label className="grid gap-1 text-xs sm:col-span-2">
            {resistance.type === "band"
              ? "Band description"
              : "Resistance description"}
            <Input
              name="resistanceDescription"
              aria-label={
                resistance.type === "band"
                  ? "Band description"
                  : "Resistance description"
              }
              className={compact ? "h-8" : "h-9"}
              maxLength={80}
              value={resistance.description}
              onChange={(event) =>
                setResistance({
                  ...resistance,
                  description: event.target.value,
                })
              }
            />
          </label>
        ) : null}
        {resistance.type === "rpe" || resistance.type === "rir" ? (
          <label className="grid gap-1 text-xs">
            {resistance.type === "rpe" ? "Target RPE" : "Target RIR"}
            <Input
              name="resistanceTarget"
              aria-label={
                resistance.type === "rpe" ? "Target RPE" : "Target RIR"
              }
              className={compact ? "h-8" : "h-9"}
              type="number"
              min={resistance.type === "rpe" ? 1 : 0}
              max="10"
              step={resistance.type === "rpe" ? 0.5 : 1}
              value={resistance.target}
              onChange={(event) =>
                setResistance({
                  ...resistance,
                  target: Number(event.target.value),
                })
              }
            />
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}
