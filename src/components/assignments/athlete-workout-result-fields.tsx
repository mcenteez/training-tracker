import { Input } from "@/components/ui/input";
import type {
  AthleteSessionResultItem,
  AthleteWorkoutItemSnapshot,
} from "@/modules/assignments/db/queries";

interface AthleteWorkoutResultFieldsProps {
  item: AthleteWorkoutItemSnapshot;
  result?: AthleteSessionResultItem;
  disabled: boolean;
}

export function AthleteWorkoutResultFields({
  item,
  result,
  disabled,
}: AthleteWorkoutResultFieldsProps) {
  const showReps = item.reps !== null || result?.reps != null;
  const showLoad = item.load !== null || result?.load != null;
  const showDuration =
    item.durationSeconds !== null || result?.durationSeconds != null;
  const showDistance =
    item.distanceMeters !== null || result?.distanceMeters != null;

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {showReps && (
        <label className="grid gap-1 text-xs">
          Reps
          <Input
            name={`result:${item.id}:reps`}
            defaultValue={
              result?.reps?.toString() ?? item.reps?.toString() ?? ""
            }
            inputMode="numeric"
            disabled={disabled}
          />
        </label>
      )}
      {showLoad && (
        <label className="grid gap-1 text-xs">
          Load
          <Input
            name={`result:${item.id}:load`}
            defaultValue={result?.load ?? item.load ?? ""}
            disabled={disabled}
          />
        </label>
      )}
      {showDuration && (
        <label className="grid gap-1 text-xs">
          Duration Seconds
          <Input
            name={`result:${item.id}:durationSeconds`}
            defaultValue={
              result?.durationSeconds?.toString() ??
              item.durationSeconds?.toString() ??
              ""
            }
            inputMode="numeric"
            disabled={disabled}
          />
        </label>
      )}
      {showDistance && (
        <label className="grid gap-1 text-xs">
          Distance Meters
          <Input
            name={`result:${item.id}:distanceMeters`}
            defaultValue={
              result?.distanceMeters?.toString() ??
              item.distanceMeters?.toString() ??
              ""
            }
            inputMode="numeric"
            disabled={disabled}
          />
        </label>
      )}
      <label className="grid gap-1 text-xs sm:col-span-2">
        Notes
        <Input
          name={`result:${item.id}:notes`}
          defaultValue={result?.notes ?? item.notes ?? ""}
          disabled={disabled}
        />
      </label>
    </div>
  );
}
