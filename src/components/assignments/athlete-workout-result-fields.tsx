"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AthleteSessionResultItem,
  AthleteWorkoutItemSnapshot,
} from "@/modules/assignments/db/queries";
import {
  formatResistance,
  type ResultResistance,
} from "@/modules/resistance/application/resistance";

interface AthleteWorkoutResultFieldsProps {
  item: AthleteWorkoutItemSnapshot;
  result?: AthleteSessionResultItem;
  disabled: boolean;
}

export function AthleteWorkoutResultFields({
  item,
  result,
  disabled,
}: AthleteWorkoutResultFieldsProps) {
  const [completedAt, setCompletedAt] = useState<Date | null>(
    result?.completedAt ?? null,
  );
  const hasPrescribedMetrics =
    item.reps !== null ||
    item.load !== null ||
    item.resistance !== null ||
    item.durationSeconds !== null ||
    item.distanceMeters !== null ||
    item.restSeconds !== null ||
    item.tempo !== null ||
    item.notes !== null;
  const hasStoredActuals =
    (result !== undefined && item.reps !== null && result.reps !== null) ||
    (result !== undefined && item.load !== null && result.load !== null) ||
    result?.resistance != null ||
    (result !== undefined &&
      item.durationSeconds !== null &&
      result.durationSeconds !== null) ||
    (result !== undefined &&
      item.distanceMeters !== null &&
      result.distanceMeters !== null) ||
    Boolean(result?.notes);
  const drawerId = `actuals-${item.id}`;
  const completeLabel = completedAt ? "Completed" : "Complete";

  return (
    <div className="mt-3 space-y-3">
      {hasPrescribedMetrics ? (
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground/80">Target</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {item.reps !== null ? <span>Reps {item.reps}</span> : null}
            {item.resistance !== null ? (
              <span>Resistance {formatResistance(item.resistance)}</span>
            ) : item.load !== null ? (
              <span>Resistance {item.load}</span>
            ) : null}
            {item.durationSeconds !== null ? (
              <span>Duration {item.durationSeconds}s</span>
            ) : null}
            {item.distanceMeters !== null ? (
              <span>Distance {item.distanceMeters}m</span>
            ) : null}
            {item.restSeconds !== null ? (
              <span>Rest {item.restSeconds}s</span>
            ) : null}
            {item.tempo !== null ? <span>Tempo {item.tempo}</span> : null}
            {item.notes !== null ? (
              <span className="basis-full">Notes {item.notes}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <input
        type="hidden"
        name={`result:${item.id}:completedAt`}
        value={completedAt?.toISOString() ?? ""}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={completedAt ? "secondary" : "default"}
          disabled={disabled}
          onClick={() =>
            setCompletedAt((current) => (current ? null : new Date()))
          }
        >
          {completeLabel}
        </Button>
        {hasPrescribedMetrics ? (
          <details open={hasStoredActuals} className="w-full space-y-3">
            <summary
              className="cursor-pointer text-xs font-medium text-muted-foreground"
              aria-controls={drawerId}
            >
              Actuals and notes
            </summary>
            <div id={drawerId} className="grid gap-3 sm:grid-cols-2">
              {item.reps !== null ? (
                <label className="grid gap-1 text-xs">
                  Actual reps
                  <Input
                    name={`result:${item.id}:reps`}
                    defaultValue={
                      result?.reps?.toString() ?? item.reps?.toString() ?? ""
                    }
                    inputMode="numeric"
                    disabled={disabled}
                  />
                </label>
              ) : null}
              {item.resistance !== null || item.load !== null ? (
                <ResultResistanceFields
                  itemSnapshotId={item.id}
                  result={result?.resistance ?? null}
                  disabled={disabled}
                />
              ) : null}
              {item.durationSeconds !== null ? (
                <label className="grid gap-1 text-xs">
                  Actual duration seconds
                  <Input
                    name={`result:${item.id}:durationSeconds`}
                    defaultValue={
                      result?.durationSeconds?.toString() ??
                      item.durationSeconds?.toString() ??
                      ""
                    }
                    inputMode="numeric"
                    disabled={disabled}
                  />
                </label>
              ) : null}
              {item.distanceMeters !== null ? (
                <label className="grid gap-1 text-xs">
                  Actual distance meters
                  <Input
                    name={`result:${item.id}:distanceMeters`}
                    defaultValue={
                      result?.distanceMeters?.toString() ??
                      item.distanceMeters?.toString() ??
                      ""
                    }
                    inputMode="numeric"
                    disabled={disabled}
                  />
                </label>
              ) : null}
              <label className="grid gap-1 text-xs sm:col-span-2">
                Notes
                <Input
                  name={`result:${item.id}:notes`}
                  defaultValue={result?.notes ?? item.notes ?? ""}
                  disabled={disabled}
                />
              </label>
            </div>
          </details>
        ) : (
          <label className="grid gap-1 text-xs sm:w-full">
            Notes
            <Input
              name={`result:${item.id}:notes`}
              defaultValue={result?.notes ?? item.notes ?? ""}
              disabled={disabled}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function ResultResistanceFields({
  itemSnapshotId,
  result,
  disabled,
}: {
  itemSnapshotId: string;
  result: ResultResistance | null;
  disabled: boolean;
}) {
  const [resistance, setResistance] = useState<ResultResistance | null>(result);
  const prefix = `result:${itemSnapshotId}`;

  function changeType(type: string) {
    switch (type) {
      case "fixed_weight":
        setResistance({ type, value: 1, unit: "lb" });
        break;
      case "bodyweight":
        setResistance({ type });
        break;
      case "band":
        setResistance({ type, description: "Band" });
        break;
      case "free_text":
        setResistance({ type, description: "Resistance" });
        break;
      default:
        setResistance(null);
    }
  }

  return (
    <fieldset className="grid gap-2 text-xs sm:col-span-2">
      <legend>Resistance used</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1">
          Type
          <Select
            name={`${prefix}:resistanceType`}
            value={resistance?.type ?? "none"}
            onValueChange={changeType}
            disabled={disabled}
          >
            <SelectTrigger aria-label="Resistance used type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not recorded</SelectItem>
              <SelectItem value="fixed_weight">Fixed weight</SelectItem>
              <SelectItem value="bodyweight">Bodyweight</SelectItem>
              <SelectItem value="band">Band</SelectItem>
              <SelectItem value="free_text">Free text</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {resistance?.type === "fixed_weight" ? (
          <>
            <label className="grid gap-1">
              Weight value
              <Input
                name={`${prefix}:resistanceValue`}
                aria-label="Resistance used weight value"
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
                disabled={disabled}
              />
            </label>
            <label className="grid gap-1">
              Weight unit
              <Select
                name={`${prefix}:resistanceUnit`}
                value={resistance.unit}
                onValueChange={(unit: "kg" | "lb") =>
                  setResistance({ ...resistance, unit })
                }
                disabled={disabled}
              >
                <SelectTrigger aria-label="Resistance used weight unit">
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
        {resistance?.type === "band" || resistance?.type === "free_text" ? (
          <label className="grid gap-1 sm:col-span-2">
            Description
            <Input
              name={`${prefix}:resistanceDescription`}
              aria-label="Resistance used description"
              maxLength={80}
              value={resistance.description}
              onChange={(event) =>
                setResistance({
                  ...resistance,
                  description: event.target.value,
                })
              }
              disabled={disabled}
            />
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}
