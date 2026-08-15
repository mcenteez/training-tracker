"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function LoadUnitSelect({
  defaultValue,
  triggerClassName,
}: {
  defaultValue: "kg" | "lb" | null;
  triggerClassName?: string;
}) {
  return (
    <Select name="loadUnit" defaultValue={defaultValue ?? undefined}>
      <SelectTrigger
        className={cn("min-w-20", triggerClassName)}
        aria-label="Load unit"
      >
        <SelectValue placeholder="Unit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="lb">lb</SelectItem>
        <SelectItem value="kg">kg</SelectItem>
      </SelectContent>
    </Select>
  );
}
