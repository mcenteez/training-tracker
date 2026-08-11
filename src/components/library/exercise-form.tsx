"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import type { ExerciseActionState } from "@/app/(app)/app/library/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { exerciseCategories } from "@/modules/exercises/db/schema";

const initialState: ExerciseActionState = {};

type ExerciseFormAction = (
  state: ExerciseActionState,
  formData: FormData,
) => Promise<ExerciseActionState>;

interface ExerciseFormProps {
  action: ExerciseFormAction;
  exercise?: {
    id: string;
    name: string;
    instructions: string | null;
    category: (typeof exerciseCategories)[number];
    equipment: string[];
    videoUrl: string | null;
    version: number;
  };
}

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? (
    <p className="text-sm text-destructive">{errors[0]}</p>
  ) : null;
}

export function ExerciseForm({ action, exercise }: ExerciseFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {exercise ? (
        <>
          <input type="hidden" name="exerciseId" value={exercise.id} />
          <input type="hidden" name="version" value={exercise.version} />
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
          <label htmlFor="name" className="text-sm font-medium">
            Exercise name
          </label>
          <Input
            id="name"
            name="name"
            defaultValue={exercise?.name}
            required
            maxLength={120}
            aria-describedby="name-error"
          />
          <div id="name-error">
            <FieldError errors={state.errors?.name} />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="category" className="text-sm font-medium">
            Category
          </label>
          <NativeSelect
            id="category"
            name="category"
            defaultValue={exercise?.category ?? "strength"}
          >
            {exerciseCategories.map((category) => (
              <option key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </option>
            ))}
          </NativeSelect>
          <FieldError errors={state.errors?.category} />
        </div>

        <div className="space-y-2">
          <label htmlFor="equipment" className="text-sm font-medium">
            Equipment
          </label>
          <Input
            id="equipment"
            name="equipment"
            defaultValue={exercise?.equipment.join(", ")}
            placeholder="barbell, rack, plates"
          />
          <p className="text-xs text-muted-foreground">
            Separate equipment with commas.
          </p>
          <FieldError errors={state.errors?.equipment} />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="instructions" className="text-sm font-medium">
            Coaching instructions
          </label>
          <textarea
            id="instructions"
            name="instructions"
            defaultValue={exercise?.instructions ?? ""}
            rows={7}
            maxLength={4000}
            className="w-full resize-y border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <FieldError errors={state.errors?.instructions} />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="videoUrl" className="text-sm font-medium">
            Demonstration video URL
          </label>
          <Input
            id="videoUrl"
            name="videoUrl"
            type="url"
            defaultValue={exercise?.videoUrl ?? ""}
            placeholder="https://"
          />
          <FieldError errors={state.errors?.videoUrl} />
        </div>
      </div>

      <div className="flex justify-end border-t border-border pt-5">
        <Button type="submit" disabled={pending}>
          <Save aria-hidden="true" />
          {pending
            ? "Saving..."
            : exercise
              ? "Save changes"
              : "Create exercise"}
        </Button>
      </div>
    </form>
  );
}
