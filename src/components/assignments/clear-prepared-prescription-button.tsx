"use client";

import { RotateCcw } from "lucide-react";

import { clearPreparedPrescriptionAction } from "@/app/(app)/app/assignments/actions";
import { Button } from "@/components/ui/button";

export function ClearPreparedPrescriptionButton({
  exerciseName,
}: {
  exerciseName: string;
}) {
  return (
    <Button
      type="submit"
      formAction={clearPreparedPrescriptionAction}
      variant="outline"
      size="sm"
      className="w-fit"
      onClick={(event) => {
        if (
          !window.confirm(
            `Clear the individual prescription for ${exerciseName}? The athlete will inherit every base value.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <RotateCcw aria-hidden="true" />
      Clear
    </Button>
  );
}
