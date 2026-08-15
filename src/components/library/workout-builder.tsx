"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, CirclePlus, Save, Trash2 } from "lucide-react";

import type { WorkoutActionState } from "@/app/(app)/app/library/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkoutGraphInput } from "@/modules/workouts/application/workout-input";
import type { Resistance } from "@/modules/resistance/application/resistance";

type MetricField =
  | "reps"
  | "resistance"
  | "durationSeconds"
  | "distanceMeters"
  | "restSeconds"
  | "tempo"
  | "notes";

const metricOptions: {
  field: MetricField;
  label: string;
  placeholder: string;
  type: "number" | "text";
}[] = [
  { field: "reps", label: "Reps", placeholder: "Reps", type: "number" },
  {
    field: "resistance",
    label: "Resistance",
    placeholder: "Resistance",
    type: "text",
  },
  {
    field: "durationSeconds",
    label: "Duration",
    placeholder: "Duration sec",
    type: "number",
  },
  {
    field: "distanceMeters",
    label: "Distance",
    placeholder: "Distance m",
    type: "number",
  },
  {
    field: "restSeconds",
    label: "Rest",
    placeholder: "Rest sec",
    type: "number",
  },
  { field: "tempo", label: "Tempo", placeholder: "Tempo", type: "text" },
  {
    field: "notes",
    label: "Notes",
    placeholder: "Coaching notes",
    type: "text",
  },
];

type BuilderItem = WorkoutGraphInput["blocks"][number]["items"][number] & {
  key: string;
  enabledMetrics: MetricField[];
};
type BuilderBlock = Omit<WorkoutGraphInput["blocks"][number], "items"> & {
  key: string;
  items: BuilderItem[];
};

interface WorkoutBuilderProps {
  action: (
    state: WorkoutActionState,
    formData: FormData,
  ) => Promise<WorkoutActionState>;
  exercises: { id: string; name: string; status: "active" | "archived" }[];
  workout?: {
    id: string;
    name: string;
    description: string | null;
    version: number;
    blocks: WorkoutGraphInput["blocks"];
  };
}

const emptyItem = (exerciseId = ""): BuilderItem => ({
  key: crypto.randomUUID(),
  exerciseId,
  enabledMetrics: ["reps"],
  reps: null,
  load: null,
  resistance: undefined,
  durationSeconds: null,
  distanceMeters: null,
  restSeconds: null,
  tempo: null,
  notes: null,
});

function hasMetricValue(
  item: WorkoutGraphInput["blocks"][number]["items"][number],
  metric: MetricField,
): boolean {
  if (metric === "resistance") return item.resistance != null;
  const value = item[metric];
  return typeof value === "string" ? value.trim().length > 0 : value !== null;
}

function initialEnabledMetrics(
  item: WorkoutGraphInput["blocks"][number]["items"][number],
): MetricField[] {
  const enabled = metricOptions
    .filter((option) => hasMetricValue(item, option.field))
    .map((option) => option.field);
  return enabled.length ? enabled : ["reps"];
}

const initialState: WorkoutActionState = {};

export function WorkoutBuilder({
  action,
  exercises,
  workout,
}: WorkoutBuilderProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [name, setName] = useState(workout?.name ?? "");
  const [description, setDescription] = useState(workout?.description ?? "");
  const [blocks, setBlocks] = useState<BuilderBlock[]>(
    () =>
      workout?.blocks.map((block) => ({
        ...block,
        key: crypto.randomUUID(),
        items: block.items.map((item) => ({
          ...item,
          key: crypto.randomUUID(),
          enabledMetrics: initialEnabledMetrics(item),
        })),
      })) ?? [],
  );

  const graph = {
    name,
    description: description.trim() || null,
    blocks: blocks.map((block) => ({
      type: block.type,
      label: block.label,
      rounds: block.rounds,
      items: block.items.map((item) => ({
        exerciseId: item.exerciseId,
        reps: item.reps,
        load: item.load,
        resistance: item.resistance ?? null,
        durationSeconds: item.durationSeconds,
        distanceMeters: item.distanceMeters,
        restSeconds: item.restSeconds,
        tempo: item.tempo,
        notes: item.notes,
      })),
    })),
  };

  function updateBlock(index: number, update: Partial<BuilderBlock>) {
    setBlocks((current) =>
      current.map((block, blockIndex) =>
        blockIndex === index ? { ...block, ...update } : block,
      ),
    );
  }

  function moveBlock(index: number, offset: number) {
    setBlocks((current) => {
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
      {workout ? (
        <>
          <input type="hidden" name="workoutId" value={workout.id} />
          <input type="hidden" name="version" value={workout.version} />
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
          <label htmlFor="workout-name" className="text-sm font-medium">
            Workout name
          </label>
          <Input
            id="workout-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="workout-description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="workout-description"
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
            <h3 className="font-semibold">Training blocks</h3>
            <p className="text-sm text-muted-foreground">
              Order blocks and prescribe each movement.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setBlocks((current) => [
                ...current,
                {
                  key: crypto.randomUUID(),
                  type: "straight",
                  label: null,
                  rounds: 1,
                  items: [],
                },
              ])
            }
          >
            <CirclePlus aria-hidden="true" /> Add block
          </Button>
        </div>

        {blocks.map((block, blockIndex) => (
          <section
            key={block.key}
            className="space-y-4 border border-border bg-muted/15 p-4"
            aria-label={`Block ${blockIndex + 1}`}
          >
            <div className="grid gap-3 md:grid-cols-[1fr_10rem_7rem_auto]">
              <Input
                aria-label="Block label"
                placeholder={`Block ${blockIndex + 1} label`}
                value={block.label ?? ""}
                onChange={(event) =>
                  updateBlock(blockIndex, { label: event.target.value || null })
                }
              />
              <NativeSelect
                aria-label="Block type"
                value={block.type}
                onChange={(event) =>
                  updateBlock(blockIndex, {
                    type: event.target.value as BuilderBlock["type"],
                  })
                }
              >
                <option value="straight">Straight sets</option>
                <option value="circuit">Circuit</option>
                <option value="superset">Superset</option>
              </NativeSelect>
              <Input
                aria-label="Rounds"
                type="number"
                min={1}
                max={100}
                value={block.rounds}
                onChange={(event) =>
                  updateBlock(blockIndex, {
                    rounds: Number(event.target.value),
                  })
                }
              />
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="Move block up"
                  disabled={blockIndex === 0}
                  onClick={() => moveBlock(blockIndex, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="Move block down"
                  disabled={blockIndex === blocks.length - 1}
                  onClick={() => moveBlock(blockIndex, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="Remove block"
                  onClick={() =>
                    setBlocks((current) =>
                      current.filter((_, index) => index !== blockIndex),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {block.items.map((item, itemIndex) => (
                <div
                  key={item.key}
                  className="space-y-3 border-t border-border/70 pt-3"
                >
                  <div className="grid gap-2 md:grid-cols-[minmax(12rem,2fr)_auto]">
                    <NativeSelect
                      aria-label="Exercise"
                      value={item.exerciseId}
                      onChange={(event) =>
                        updateBlock(blockIndex, {
                          items: block.items.map((current, index) =>
                            index === itemIndex
                              ? { ...current, exerciseId: event.target.value }
                              : current,
                          ),
                        })
                      }
                      required
                    >
                      <option value="">Choose exercise</option>
                      {exercises.map((exercise) => (
                        <option key={exercise.id} value={exercise.id}>
                          {exercise.name}
                          {exercise.status === "archived" ? " (archived)" : ""}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Remove exercise"
                      onClick={() =>
                        updateBlock(blockIndex, {
                          items: block.items.filter(
                            (_, index) => index !== itemIndex,
                          ),
                        })
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      Fields
                    </p>
                    {metricOptions.map((metric) => {
                      const enabled = item.enabledMetrics.includes(
                        metric.field,
                      );
                      return (
                        <Button
                          key={metric.field}
                          type="button"
                          size="sm"
                          variant={enabled ? "default" : "outline"}
                          onClick={() =>
                            updateBlock(blockIndex, {
                              items: block.items.map((current, index) => {
                                if (index !== itemIndex) return current;
                                if (enabled) {
                                  return {
                                    ...current,
                                    enabledMetrics:
                                      current.enabledMetrics.filter(
                                        (field) => field !== metric.field,
                                      ),
                                    [metric.field]:
                                      metric.field === "resistance"
                                        ? undefined
                                        : null,
                                  };
                                }
                                return {
                                  ...current,
                                  enabledMetrics: [
                                    ...current.enabledMetrics,
                                    metric.field,
                                  ],
                                };
                              }),
                            })
                          }
                        >
                          {metric.label}
                        </Button>
                      );
                    })}
                  </div>

                  {item.enabledMetrics.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Select at least one field for this exercise.
                    </p>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-3">
                      {metricOptions
                        .filter((metric) =>
                          item.enabledMetrics.includes(metric.field),
                        )
                        .map((metric) =>
                          metric.field === "resistance" ? (
                            <ResistanceFields
                              key={metric.field}
                              resistance={item.resistance ?? null}
                              onChange={(resistance) =>
                                updateBlock(blockIndex, {
                                  items: block.items.map((current, index) =>
                                    index === itemIndex
                                      ? {
                                          ...current,
                                          resistance,
                                          load: null,
                                        }
                                      : current,
                                  ),
                                })
                              }
                            />
                          ) : (
                            <Input
                              key={metric.field}
                              aria-label={metric.label}
                              type={metric.type}
                              min={metric.type === "number" ? 0 : undefined}
                              placeholder={metric.placeholder}
                              className={
                                metric.field === "notes"
                                  ? "md:col-span-3"
                                  : undefined
                              }
                              value={
                                metric.type === "number"
                                  ? ((item[metric.field] as number | null) ??
                                    "")
                                  : ((item[metric.field] as string | null) ??
                                    "")
                              }
                              onChange={(event) =>
                                updateBlock(blockIndex, {
                                  items: block.items.map((current, index) => {
                                    if (index !== itemIndex) return current;
                                    if (metric.type === "number") {
                                      return {
                                        ...current,
                                        [metric.field]:
                                          event.target.value === ""
                                            ? null
                                            : Number(event.target.value),
                                      };
                                    }
                                    return {
                                      ...current,
                                      [metric.field]:
                                        event.target.value || null,
                                    };
                                  }),
                                })
                              }
                            />
                          ),
                        )}
                    </div>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  updateBlock(blockIndex, {
                    items: [...block.items, emptyItem(exercises[0]?.id)],
                  })
                }
                disabled={!exercises.length}
              >
                <CirclePlus aria-hidden="true" /> Add exercise
              </Button>
            </div>
          </section>
        ))}
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
          Activate workout
        </Button>
      </div>
    </form>
  );
}

function ResistanceFields({
  resistance,
  onChange,
}: {
  resistance: Resistance | null;
  onChange: (resistance: Resistance) => void;
}) {
  const type = resistance?.type ?? "fixed_weight";

  function changeType(nextType: Resistance["type"]) {
    const next: Record<Resistance["type"], Resistance> = {
      fixed_weight: { type: "fixed_weight", value: 1, unit: "lb" },
      percent_1rm: { type: "percent_1rm", percentage: 80 },
      bodyweight: { type: "bodyweight" },
      band: { type: "band", description: "Band" },
      rpe: { type: "rpe", target: 8 },
      rir: { type: "rir", target: 2 },
      free_text: { type: "free_text", description: "Resistance" },
    };
    onChange(next[nextType]);
  }

  return (
    <div className="grid gap-2 md:col-span-3 md:grid-cols-3">
      <label className="grid gap-1 text-sm">
        Resistance type
        <Select value={type} onValueChange={changeType}>
          <SelectTrigger className="w-full" aria-label="Resistance type">
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
      {type === "fixed_weight" ? (
        <>
          <label className="grid gap-1 text-sm">
            Weight value
            <Input
              aria-label="Weight value"
              type="number"
              min="0.01"
              step="any"
              value={resistance?.type === type ? resistance.value : 1}
              onChange={(event) =>
                onChange({
                  type,
                  value: Number(event.target.value),
                  unit: resistance?.type === type ? resistance.unit : "lb",
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            Weight unit
            <Select
              value={resistance?.type === type ? resistance.unit : "lb"}
              onValueChange={(unit: "kg" | "lb") =>
                onChange({
                  type,
                  value: resistance?.type === type ? resistance.value : 1,
                  unit,
                })
              }
            >
              <SelectTrigger className="w-full" aria-label="Weight unit">
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
      {type === "percent_1rm" ? (
        <label className="grid gap-1 text-sm">
          Percentage of 1RM
          <Input
            aria-label="Percentage of 1RM"
            type="number"
            min="0.01"
            max="200"
            step="any"
            value={resistance?.type === type ? resistance.percentage : 80}
            onChange={(event) =>
              onChange({ type, percentage: Number(event.target.value) })
            }
          />
        </label>
      ) : null}
      {type === "band" || type === "free_text" ? (
        <label className="grid gap-1 text-sm md:col-span-2">
          {type === "band" ? "Band description" : "Resistance description"}
          <Input
            aria-label={
              type === "band" ? "Band description" : "Resistance description"
            }
            maxLength={80}
            value={resistance?.type === type ? resistance.description : ""}
            onChange={(event) =>
              onChange({ type, description: event.target.value })
            }
          />
        </label>
      ) : null}
      {type === "rpe" || type === "rir" ? (
        <label className="grid gap-1 text-sm">
          {type === "rpe" ? "Target RPE" : "Target RIR"}
          <Input
            aria-label={type === "rpe" ? "Target RPE" : "Target RIR"}
            type="number"
            min={type === "rpe" ? 1 : 0}
            max={10}
            step={type === "rpe" ? 0.5 : 1}
            value={resistance?.type === type ? resistance.target : 0}
            onChange={(event) =>
              onChange({ type, target: Number(event.target.value) })
            }
          />
        </label>
      ) : null}
    </div>
  );
}
