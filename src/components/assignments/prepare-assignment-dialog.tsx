"use client";

import { prepareAssignmentAction } from "@/app/(app)/app/assignments/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function PrepareAssignmentDialog({
  assignmentId,
  version,
  recipientEstimate,
}: {
  assignmentId: string;
  version: number;
  recipientEstimate: number;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button">Prepare assignment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prepare for individualization?</DialogTitle>
          <DialogDescription>
            Freeze the source, schedule, and {recipientEstimate} resolved
            {recipientEstimate === 1 ? " recipient" : " recipients"} for review.
            Athletes cannot see a prepared assignment.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          You can individualize prescriptions before publishing. Returning to
          draft later discards those prescriptions and the frozen snapshots.
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Keep editing
            </Button>
          </DialogClose>
          <form action={prepareAssignmentAction}>
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <input type="hidden" name="version" value={version} />
            <Button type="submit">Confirm preparation</Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
