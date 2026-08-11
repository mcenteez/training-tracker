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
}

export function PublishAssignmentDialog({
  assignmentId,
  version,
  recipientEstimate,
}: PublishAssignmentDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button">Publish Assignment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish this assignment?</DialogTitle>
          <DialogDescription>
            This will deliver the assignment to {recipientEstimate} unique
            {recipientEstimate === 1 ? " athlete" : " athletes"}. The current
            programming will be preserved as an immutable snapshot.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          Athletes will be able to see the assignment after publication, and its
          source and targets can no longer be edited.
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Keep as Draft
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
