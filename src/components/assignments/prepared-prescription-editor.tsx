import { savePreparedPrescriptionAction } from "@/app/(app)/app/assignments/actions";
import { ClearPreparedPrescriptionButton } from "@/components/assignments/clear-prepared-prescription-button";
import { Button } from "@/components/ui/button";
import type { TeamAthletePrescriptionItem } from "@/modules/assignments/db/athlete-prescription-queries";

export function PreparedPrescriptionEditor({
  assignmentId,
  recipientId,
  athleteUserId,
  items,
}: {
  assignmentId: string;
  recipientId: string;
  athleteUserId: string;
  items: TeamAthletePrescriptionItem[];
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const overridden = new Set(item.overriddenFields ?? []);
        return (
          <form
            key={`${item.itemSnapshotId}:${item.planSlotSnapshotId ?? "assignment"}`}
            action={savePreparedPrescriptionAction}
            className="grid gap-3 border-t pt-4 first:border-t-0 first:pt-0 sm:grid-cols-2"
          >
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <input type="hidden" name="recipientId" value={recipientId} />
            <input type="hidden" name="athleteUserId" value={athleteUserId} />
            <input
              type="hidden"
              name="itemSnapshotId"
              value={item.itemSnapshotId}
            />
            <input
              type="hidden"
              name="planSlotSnapshotId"
              value={item.planSlotSnapshotId ?? ""}
            />
            {item.overrideVersion !== null ? (
              <input
                type="hidden"
                name="expectedVersion"
                value={item.overrideVersion}
              />
            ) : null}

            <div className="space-y-1 sm:col-span-2">
              <p className="font-medium">
                {item.exerciseName}
                {item.planSlotSnapshotId
                  ? ` - ${item.planSlotLabel || (item.scheduleType === "fixed_day" ? "Fixed session" : "Weekly session")}`
                  : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Check only the fields this athlete should not inherit from the
                shared base prescription.
              </p>
            </div>

            <PrescriptionNumberField
              name="reps"
              label="Reps"
              baseValue={item.reps}
              overrideValue={item.overrideReps}
              checked={overridden.has("reps")}
            />
            <label className="grid gap-1 text-xs">
              <span>
                <input
                  type="checkbox"
                  name="overriddenFields"
                  value="load"
                  defaultChecked={overridden.has("load")}
                />{" "}
                Load (base {item.load ?? "-"})
              </span>
              <span className="flex gap-2">
                <input
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                  name="loadValue"
                  type="number"
                  min="0"
                  step="any"
                  defaultValue={item.overrideLoadValue ?? ""}
                />
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  name="loadUnit"
                  defaultValue={item.overrideLoadUnit ?? ""}
                >
                  <option value="">Unit</option>
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </span>
              <input
                type="hidden"
                name="load"
                value={item.overrideLoad ?? ""}
              />
            </label>
            <PrescriptionNumberField
              name="durationSeconds"
              label="Duration seconds"
              baseValue={item.durationSeconds}
              overrideValue={item.overrideDurationSeconds}
              checked={overridden.has("durationSeconds")}
            />
            <PrescriptionNumberField
              name="distanceMeters"
              label="Distance meters"
              baseValue={item.distanceMeters}
              overrideValue={item.overrideDistanceMeters}
              checked={overridden.has("distanceMeters")}
            />
            <PrescriptionNumberField
              name="restSeconds"
              label="Rest seconds"
              baseValue={item.restSeconds}
              overrideValue={item.overrideRestSeconds}
              checked={overridden.has("restSeconds")}
            />
            <PrescriptionTextField
              name="tempo"
              label="Tempo"
              baseValue={item.tempo}
              overrideValue={item.overrideTempo}
              checked={overridden.has("tempo")}
            />
            <PrescriptionTextField
              name="notes"
              label="Notes"
              baseValue={item.notes}
              overrideValue={item.overrideNotes}
              checked={overridden.has("notes")}
            />
            <label className="grid gap-1 text-xs sm:col-span-2">
              Reason
              <input
                className="h-9 rounded-md border bg-background px-2 text-sm"
                name="reason"
                placeholder="Optional coaching context"
              />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" size="sm">
                Save prescription
              </Button>
              {item.overrideVersion !== null ? (
                <ClearPreparedPrescriptionButton
                  exerciseName={item.exerciseName}
                />
              ) : null}
            </div>
          </form>
        );
      })}
    </div>
  );
}

function PrescriptionNumberField({
  name,
  label,
  baseValue,
  overrideValue,
  checked,
}: {
  name: string;
  label: string;
  baseValue: number | null;
  overrideValue: number | null;
  checked: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs">
      <span>
        <input
          type="checkbox"
          name="overriddenFields"
          value={name}
          defaultChecked={checked}
        />{" "}
        {label} (base {baseValue ?? "-"})
      </span>
      <input
        className="h-9 rounded-md border bg-background px-2 text-sm"
        name={name}
        type="number"
        min="0"
        defaultValue={overrideValue ?? baseValue ?? ""}
      />
    </label>
  );
}

function PrescriptionTextField({
  name,
  label,
  baseValue,
  overrideValue,
  checked,
}: {
  name: string;
  label: string;
  baseValue: string | null;
  overrideValue: string | null;
  checked: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs">
      <span>
        <input
          type="checkbox"
          name="overriddenFields"
          value={name}
          defaultChecked={checked}
        />{" "}
        {label} (base {baseValue ?? "-"})
      </span>
      <input
        className="h-9 rounded-md border bg-background px-2 text-sm"
        name={name}
        defaultValue={overrideValue ?? baseValue ?? ""}
      />
    </label>
  );
}
