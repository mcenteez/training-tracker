"use client";

import { useState } from "react";

import { updateTeamMemberAction } from "@/app/(app)/app/teams/[teamId]/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
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
import type { TeamRole } from "@/modules/access-control/roles";

export function UpdateTeamMemberRoleDialog({
  teamId,
  userId,
  displayName,
  currentRole,
  disabled = false,
}: {
  teamId: string;
  userId: string;
  displayName: string;
  currentRole: TeamRole;
  disabled?: boolean;
}) {
  const [role, setRole] = useState<TeamRole>(currentRole);

  return (
    <div className="flex gap-2">
      <label className="sr-only" htmlFor={`role-${userId}`}>
        Team role for {displayName}
      </label>
      <NativeSelect
        id={`role-${userId}`}
        value={role}
        onChange={(event) => setRole(event.target.value as TeamRole)}
        disabled={disabled}
        className="h-8 min-w-28 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="athlete">Athlete</option>
        <option value="viewer">Viewer</option>
        <option value="manager">Manager</option>
      </NativeSelect>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || role === currentRole}
          >
            Review role
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change {displayName}&apos;s Team role?</DialogTitle>
            <DialogDescription>
              Their Team role will change from {currentRole} to {role}. Their
              organization role and access remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <form action={updateTeamMemberAction}>
              <input type="hidden" name="teamId" value={teamId} />
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="role" value={role} />
              <Button type="submit">Confirm role change</Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
