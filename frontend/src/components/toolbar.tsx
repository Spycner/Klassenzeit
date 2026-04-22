import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

export interface ToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  right?: ReactNode;
}

export function Toolbar({ search, onSearch, placeholder, right }: ToolbarProps) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
      <div className="flex h-8 min-w-[220px] items-center gap-1.5 rounded-md bg-input px-2.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={placeholder}
          className="h-6 border-0 bg-transparent p-0 text-sm shadow-none focus:placeholder:text-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      <div className="flex-1" />
      {right}
    </div>
  );
}
