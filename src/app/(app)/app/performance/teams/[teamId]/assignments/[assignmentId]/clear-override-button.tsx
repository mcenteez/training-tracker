"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

import { clearAthletePrescriptionOverrideAction } from "./prescription-actions";

interface ClearOverrideButtonProps {
  exerciseName: string;
}

export function ClearOverrideButton({
  exerciseName,
}: ClearOverrideButtonProps) {
  return (
    <Button
      type="submit"
      formAction={clearAthletePrescriptionOverrideAction}
      variant="outline"
      size="sm"
      className="w-fit"
      onClick={(event) => {
        if (
          !window.confirm(
            `Clear the individual prescription for ${exerciseName}? Future unstarted sessions will inherit the shared prescription.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <RotateCcw aria-hidden="true" />
      Clear override
    </Button>
  );
}
