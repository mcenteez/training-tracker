"use client";

import { removeTeamMemberAction } from "@/app/(app)/app/teams/[teamId]/actions";
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

export function RemoveTeamMemberDialog({
  teamId,
  userId,
  displayName,
  disabled = false,
}: {
  teamId: string;
  userId: string;
  displayName: string;
  disabled?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={disabled}
        >
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {displayName} from this team?</DialogTitle>
          <DialogDescription>
            Their organization membership remains active, but team access is
            removed immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <form action={removeTeamMemberAction}>
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="userId" value={userId} />
            <Button type="submit" variant="destructive">
              Confirm removal
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
