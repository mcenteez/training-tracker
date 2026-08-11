"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

interface SourceOption {
  id: string;
  name: string;
}

interface AssignmentSourceFieldsProps {
  plans: readonly SourceOption[];
  workouts: readonly SourceOption[];
  initialSourceType?: "plan" | "workout";
  initialPlanId?: string;
  initialWorkoutId?: string;
  initialScheduledDate?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  disabled?: boolean;
}

export function AssignmentSourceFields({
  plans,
  workouts,
  initialSourceType = "plan",
  initialPlanId = "",
  initialWorkoutId = "",
  initialScheduledDate = "",
  initialStartDate = "",
  initialEndDate = "",
  disabled = false,
}: AssignmentSourceFieldsProps) {
  const [sourceType, setSourceType] = useState(initialSourceType);
  const planSelected = sourceType === "plan";

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-1.5" disabled={disabled}>
        <legend className="text-sm">Source type</legend>
        <div className="grid w-full max-w-sm grid-cols-2 rounded-lg border border-input bg-background p-1">
          {(["plan", "workout"] as const).map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="sourceType"
                value={value}
                aria-label={`Assign a ${value}`}
                checked={sourceType === value}
                onChange={() => setSourceType(value)}
                className="peer sr-only"
              />
              <span className="flex h-7 items-center justify-center rounded-md px-3 text-sm font-medium capitalize text-muted-foreground transition-colors peer-checked:bg-secondary peer-checked:text-secondary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                {value}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div hidden={!planSelected} className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          Choose a plan
          <NativeSelect
            name="sourcePlanId"
            defaultValue={initialPlanId}
            disabled={disabled || !planSelected}
            required={!disabled && planSelected}
          >
            <option value="" disabled>
              {plans.length === 0 ? "No active plans" : "Select plan..."}
            </option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </NativeSelect>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1.5 text-sm">
            Start date
            <Input
              type="date"
              name="startDate"
              defaultValue={initialStartDate}
              disabled={disabled || !planSelected}
              required={!disabled && planSelected}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            End date
            <Input
              type="date"
              name="endDate"
              defaultValue={initialEndDate}
              disabled={disabled || !planSelected}
              required={!disabled && planSelected}
            />
          </label>
        </div>
      </div>

      <div hidden={planSelected} className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          Choose a workout
          <NativeSelect
            name="sourceWorkoutId"
            defaultValue={initialWorkoutId}
            disabled={disabled || planSelected}
            required={!disabled && !planSelected}
          >
            <option value="" disabled>
              {workouts.length === 0
                ? "No active workouts"
                : "Select workout..."}
            </option>
            {workouts.map((workout) => (
              <option key={workout.id} value={workout.id}>
                {workout.name}
              </option>
            ))}
          </NativeSelect>
        </label>

        <label className="grid gap-1.5 text-sm">
          Scheduled date
          <Input
            type="date"
            name="scheduledDate"
            defaultValue={initialScheduledDate}
            disabled={disabled || planSelected}
            required={!disabled && !planSelected}
          />
        </label>
      </div>
    </div>
  );
}
