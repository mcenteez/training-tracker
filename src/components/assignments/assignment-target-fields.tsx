"use client";

import { useDeferredValue, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Popover } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TargetOption {
  id: string;
  label: string;
  description?: string;
  keywords?: readonly string[];
  teamIds?: readonly string[];
}

interface AssignmentTargetFieldsProps {
  teams: readonly TargetOption[];
  athletes: readonly TargetOption[];
  selectedTeamIds?: readonly string[];
  selectedAthleteIds?: readonly string[];
  disabled?: boolean;
}

interface SearchableTargetSelectProps {
  label: string;
  singularLabel: string;
  name: "teamIds" | "athleteUserIds";
  options: readonly TargetOption[];
  selectedIds: ReadonlySet<string>;
  onSelectedIdsChange: (selectedIds: Set<string>) => void;
  emptyMessage: string;
  disabled: boolean;
  selectedTeamIds?: ReadonlySet<string>;
}

function SearchableTargetSelect({
  label,
  singularLabel,
  name,
  options,
  selectedIds,
  onSelectedIdsChange,
  emptyMessage,
  disabled,
  selectedTeamIds,
}: SearchableTargetSelectProps) {
  const labelId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const filteredOptions = options.filter((option) => {
    if (!deferredQuery) {
      return true;
    }

    return [option.label, option.description, ...(option.keywords ?? [])]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(deferredQuery));
  });
  const selectedCount = selectedIds.size;

  function toggleOption(optionId: string) {
    const nextSelectedIds = new Set(selectedIds);

    if (nextSelectedIds.has(optionId)) {
      nextSelectedIds.delete(optionId);
    } else {
      nextSelectedIds.add(optionId);
    }

    onSelectedIdsChange(nextSelectedIds);
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <span id={labelId} className="text-sm">
        {label}
      </span>
      <Popover.Root onOpenChange={(open) => !open && setQuery("")}>
        <Popover.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            aria-labelledby={labelId}
            disabled={disabled}
          >
            <span className={cn(!selectedCount && "text-muted-foreground")}>
              {selectedCount === 0
                ? `Select ${label.toLocaleLowerCase()}...`
                : `${selectedCount} ${selectedCount === 1 ? singularLabel : label.toLocaleLowerCase()} selected`}
            </span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              searchInputRef.current?.focus();
            }}
            className="z-50 w-(--radix-popover-trigger-width) max-w-[calc(100vw-2rem)] rounded-lg bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
          >
            <div className="relative mb-1.5">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${label.toLocaleLowerCase()}...`}
                aria-label={`Search ${label.toLocaleLowerCase()}`}
                className="pl-8"
              />
            </div>

            <div
              role="listbox"
              aria-label={label}
              aria-multiselectable="true"
              className="max-h-64 overflow-y-auto"
            >
              {filteredOptions.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  {query ? "No matching results" : emptyMessage}
                </p>
              ) : (
                filteredOptions.map((option) => {
                  const selected = selectedIds.has(option.id);
                  const includedByTeam =
                    selectedTeamIds !== undefined &&
                    option.teamIds?.some((teamId) =>
                      selectedTeamIds.has(teamId),
                    );
                  const selectionDisabled = includedByTeam && !selected;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-disabled={selectionDisabled}
                      disabled={selectionDisabled}
                      onClick={() => toggleOption(option.id)}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-input",
                          selected &&
                            "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {selected ? (
                          <Check aria-hidden="true" className="size-3" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {includedByTeam ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            Included through selected team
                          </span>
                        ) : option.description ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {selectedCount > 0 ? (
              <div className="mt-1.5 border-t border-border pt-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => onSelectedIdsChange(new Set())}
                >
                  <X aria-hidden="true" />
                  Clear selection
                </Button>
              </div>
            ) : null}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {[...selectedIds].map((selectedId) => (
        <input
          key={selectedId}
          type="hidden"
          name={name}
          value={selectedId}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

export function AssignmentTargetFields({
  teams,
  athletes,
  selectedTeamIds: initialSelectedTeamIds = [],
  selectedAthleteIds: initialSelectedAthleteIds = [],
  disabled = false,
}: AssignmentTargetFieldsProps) {
  const [selectedTeamIds, setSelectedTeamIds] = useState(
    () => new Set(initialSelectedTeamIds),
  );
  const [selectedAthleteIds, setSelectedAthleteIds] = useState(
    () => new Set(initialSelectedAthleteIds),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SearchableTargetSelect
        label="Teams"
        singularLabel="team"
        name="teamIds"
        options={teams}
        selectedIds={selectedTeamIds}
        onSelectedIdsChange={setSelectedTeamIds}
        emptyMessage="No teams available"
        disabled={disabled}
      />
      <SearchableTargetSelect
        label="Individual athletes"
        singularLabel="athlete"
        name="athleteUserIds"
        options={athletes}
        selectedIds={selectedAthleteIds}
        onSelectedIdsChange={setSelectedAthleteIds}
        emptyMessage="No athletes available"
        disabled={disabled}
        selectedTeamIds={selectedTeamIds}
      />
    </div>
  );
}
