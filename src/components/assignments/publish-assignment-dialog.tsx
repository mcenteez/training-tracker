"use client";

import { publishAssignmentAction } from "@/app/(app)/app/assignments/actions";
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

interface PublishAssignmentDialogProps {
  assignmentId: string;
  version: number;
  recipientEstimate: number;
  disabled?: boolean;
}

export function PublishAssignmentDialog({
  assignmentId,
  version,
  recipientEstimate,
  disabled = false,
}: PublishAssignmentDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          Publish Assignment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish this assignment?</DialogTitle>
          <DialogDescription>
            This will deliver the assignment to {recipientEstimate} unique
            {recipientEstimate === 1 ? " athlete" : " athletes"} using the
            effective prescriptions reviewed here.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          Athletes will be able to see the assignment after publication. Its
          prepared recipients and shared programming will remain frozen.
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Keep reviewing
            </Button>
          </DialogClose>
          <form action={publishAssignmentAction}>
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <input type="hidden" name="version" value={version} />
            <Button type="submit">Confirm Publication</Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
