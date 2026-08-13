"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  AthleteSessionResultItem,
  AthleteWorkoutItemSnapshot,
} from "@/modules/assignments/db/queries";

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
    item.durationSeconds !== null ||
    item.distanceMeters !== null ||
    item.restSeconds !== null ||
    item.tempo !== null ||
    item.notes !== null;
  const hasStoredActuals =
    (result !== undefined && item.reps !== null && result.reps !== null) ||
    (result !== undefined && item.load !== null && result.load !== null) ||
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
            {item.load !== null ? <span>Load {item.load}</span> : null}
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
              {item.load !== null ? (
                <label className="grid gap-1 text-xs">
                  Actual load
                  <Input
                    name={`result:${item.id}:load`}
                    defaultValue={result?.load ?? item.load ?? ""}
                    disabled={disabled}
                  />
                </label>
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
