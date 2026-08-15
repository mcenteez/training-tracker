"use client";

import { Undo2 } from "lucide-react";

import { returnAssignmentToDraftAction } from "@/app/(app)/app/assignments/actions";
import { Button } from "@/components/ui/button";

export function ReturnAssignmentToDraftButton({
  assignmentId,
  version,
  hasOverrides,
}: {
  assignmentId: string;
  version: number;
  hasOverrides: boolean;
}) {
  return (
    <form action={returnAssignmentToDraftAction}>
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="version" value={version} />
      <Button
        type="submit"
        variant="outline"
        onClick={(event) => {
          const detail = hasOverrides
            ? " This will permanently discard every individual prescription."
            : "";
          if (
            !window.confirm(
              `Return this assignment to draft? Frozen recipients and programming will be discarded.${detail}`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <Undo2 aria-hidden="true" />
        Return to draft
      </Button>
    </form>
  );
}
