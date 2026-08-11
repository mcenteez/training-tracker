interface TargetOption {
  id: string;
  label: string;
}

interface AssignmentTargetFieldsProps {
  teams: readonly TargetOption[];
  athletes: readonly TargetOption[];
  selectedTeamIds?: readonly string[];
  selectedAthleteIds?: readonly string[];
  disabled?: boolean;
}

interface TargetGroupProps {
  legend: string;
  name: "teamIds" | "athleteUserIds";
  options: readonly TargetOption[];
  selectedIds: ReadonlySet<string>;
  emptyMessage: string;
  disabled: boolean;
}

function TargetGroup({
  legend,
  name,
  options,
  selectedIds,
  emptyMessage,
  disabled,
}: TargetGroupProps) {
  return (
    <fieldset className="grid min-w-0 gap-1.5" disabled={disabled}>
      <legend className="text-sm">{legend}</legend>
      <div className="max-h-44 min-h-11 overflow-y-auto rounded-lg border border-input bg-background p-1.5">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <div className="grid gap-0.5">
            {options.map((option) => (
              <label
                key={option.id}
                className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted has-checked:bg-secondary has-disabled:cursor-not-allowed has-disabled:opacity-50"
              >
                <input
                  type="checkbox"
                  name={name}
                  value={option.id}
                  defaultChecked={selectedIds.has(option.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 truncate">{option.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </fieldset>
  );
}

export function AssignmentTargetFields({
  teams,
  athletes,
  selectedTeamIds = [],
  selectedAthleteIds = [],
  disabled = false,
}: AssignmentTargetFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TargetGroup
        legend="Teams"
        name="teamIds"
        options={teams}
        selectedIds={new Set(selectedTeamIds)}
        emptyMessage="No teams available"
        disabled={disabled}
      />
      <TargetGroup
        legend="Athletes"
        name="athleteUserIds"
        options={athletes}
        selectedIds={new Set(selectedAthleteIds)}
        emptyMessage="No athletes available"
        disabled={disabled}
      />
    </div>
  );
}
