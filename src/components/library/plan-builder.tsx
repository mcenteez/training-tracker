"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, CirclePlus, Save, Trash2 } from "lucide-react";

import type { PlanActionState } from "@/app/(app)/app/library/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { PlanInput } from "@/modules/plans/application/plan-input";
import { planDaysOfWeek } from "@/modules/plans/db/schema";

type BuilderScheduleSlot = PlanInput["scheduleSlots"][number] & {
  key: string;
};

interface PlanBuilderProps {
  action: (
    state: PlanActionState,
    formData: FormData,
  ) => Promise<PlanActionState>;
  workouts: {
    id: string;
    name: string;
    status: "draft" | "active" | "archived";
  }[];
  plan?: {
    id: string;
    name: string;
    description: string | null;
    version: number;
    scheduleSlots: PlanInput["scheduleSlots"];
  };
}

const initialState: PlanActionState = {};

const emptySlot = (workoutId = ""): BuilderScheduleSlot => ({
  key: crypto.randomUUID(),
  workoutId,
  cycleWeek: 1,
  dayOfWeek: "monday",
  label: null,
});

function dayLabel(day: (typeof planDaysOfWeek)[number]) {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

export function PlanBuilder({ action, workouts, plan }: PlanBuilderProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [scheduleSlots, setScheduleSlots] = useState<BuilderScheduleSlot[]>(
    () =>
      plan?.scheduleSlots.map((slot) => ({
        ...slot,
        key: crypto.randomUUID(),
      })) ?? [],
  );

  const graph: PlanInput = {
    name,
    description: description.trim() || null,
    scheduleSlots: scheduleSlots.map((slot) => ({
      workoutId: slot.workoutId,
      cycleWeek: slot.cycleWeek,
      dayOfWeek: slot.dayOfWeek,
      label: slot.label,
    })),
  };

  function updateScheduleSlot(
    index: number,
    update: Partial<BuilderScheduleSlot>,
  ) {
    setScheduleSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...update } : slot,
      ),
    );
  }

  function moveScheduleSlot(index: number, offset: number) {
    setScheduleSlots((current) => {
      const next = [...current];
      const target = index + offset;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-7">
      <input type="hidden" name="graph" value={JSON.stringify(graph)} />
      {plan ? (
        <>
          <input type="hidden" name="planId" value={plan.id} />
          <input type="hidden" name="version" value={plan.version} />
        </>
      ) : null}
      {state.message ? (
        <p
          role="alert"
          className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="plan-name" className="text-sm font-medium">
            Plan name
          </label>
          <Input
            id="plan-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="plan-description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="plan-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Scheduled sessions</h3>
            <p className="text-sm text-muted-foreground">
              Build a weekly cadence by placing workout templates on cycle days.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setScheduleSlots((current) => [
                ...current,
                emptySlot(workouts[0]?.id ?? ""),
              ])
            }
            disabled={!workouts.length}
          >
            <CirclePlus aria-hidden="true" /> Add session
          </Button>
        </div>

        {scheduleSlots.length === 0 ? (
          <div className="border border-dashed border-border px-5 py-7 text-sm text-muted-foreground">
            Add the first scheduled session to begin shaping this plan.
          </div>
        ) : (
          <div className="space-y-3">
            {scheduleSlots.map((slot, slotIndex) => (
              <section
                key={slot.key}
                className="grid gap-2 border border-border bg-muted/15 p-3 md:grid-cols-[7rem_10rem_minmax(14rem,1fr)_minmax(10rem,1fr)_auto]"
                aria-label={`Scheduled session ${slotIndex + 1}`}
              >
                <Input
                  aria-label="Cycle week"
                  type="number"
                  min={1}
                  max={52}
                  value={slot.cycleWeek}
                  onChange={(event) =>
                    updateScheduleSlot(slotIndex, {
                      cycleWeek: Number(event.target.value),
                    })
                  }
                />
                <NativeSelect
                  aria-label="Day of week"
                  value={slot.dayOfWeek}
                  onChange={(event) =>
                    updateScheduleSlot(slotIndex, {
                      dayOfWeek: event.target
                        .value as BuilderScheduleSlot["dayOfWeek"],
                    })
                  }
                >
                  {planDaysOfWeek.map((day) => (
                    <option key={day} value={day}>
                      {dayLabel(day)}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label="Workout template"
                  value={slot.workoutId}
                  onChange={(event) =>
                    updateScheduleSlot(slotIndex, {
                      workoutId: event.target.value,
                    })
                  }
                  required
                >
                  <option value="">Choose workout</option>
                  {workouts.map((workout) => (
                    <option key={workout.id} value={workout.id}>
                      {workout.name}
                      {workout.status !== "active"
                        ? ` (${workout.status})`
                        : ""}
                    </option>
                  ))}
                </NativeSelect>
                <Input
                  aria-label="Session label"
                  placeholder="Session label"
                  value={slot.label ?? ""}
                  onChange={(event) =>
                    updateScheduleSlot(slotIndex, {
                      label: event.target.value || null,
                    })
                  }
                />
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Move session up"
                    disabled={slotIndex === 0}
                    onClick={() => moveScheduleSlot(slotIndex, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Move session down"
                    disabled={slotIndex === scheduleSlots.length - 1}
                    onClick={() => moveScheduleSlot(slotIndex, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Remove session"
                    onClick={() =>
                      setScheduleSlots((current) =>
                        current.filter((_, index) => index !== slotIndex),
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
        <Button
          type="submit"
          name="intent"
          value="draft"
          variant="outline"
          disabled={pending}
        >
          <Save aria-hidden="true" /> Save draft
        </Button>
        <Button type="submit" name="intent" value="activate" disabled={pending}>
          Activate plan
        </Button>
      </div>
    </form>
  );
}
