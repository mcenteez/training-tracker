"use client";

import { useActionState } from "react";
import { MessageSquarePlus } from "lucide-react";

import type { StaffSessionCommentActionState } from "./actions";
import { appendStaffSessionCommentAction } from "./actions";

const initialState: StaffSessionCommentActionState = {};

export function StaffSessionCommentForm(props: {
  teamId: string;
  assignmentId: string;
  sessionId: string;
}) {
  const [state, formAction, pending] = useActionState(
    appendStaffSessionCommentAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="teamId" value={props.teamId} />
      <input type="hidden" name="assignmentId" value={props.assignmentId} />
      <input type="hidden" name="sessionId" value={props.sessionId} />
      <div className="space-y-2">
        <label htmlFor="session-comment" className="text-sm font-medium">
          Add staff comment
        </label>
        <textarea
          id="session-comment"
          name="body"
          rows={4}
          required
          maxLength={2000}
          aria-describedby="session-comment-help session-comment-error"
          className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p id="session-comment-help" className="text-xs text-muted-foreground">
          Staff comments are permanent and visible to authorized staff.
        </p>
        {state.errors?.body?.[0] ? (
          <p id="session-comment-error" className="text-sm text-destructive">
            {state.errors.body[0]}
          </p>
        ) : null}
      </div>
      {state.message ? (
        <p
          role={state.success ? "status" : "alert"}
          className={
            state.success
              ? "text-sm text-muted-foreground"
              : "text-sm text-destructive"
          }
        >
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
      >
        <MessageSquarePlus aria-hidden="true" className="size-4" />
        {pending ? "Adding..." : "Add comment"}
      </button>
    </form>
  );
}
