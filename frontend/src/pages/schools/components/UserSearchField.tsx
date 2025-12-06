import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { UserSearchResult } from "@/api";
import { useUserSearch } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UserSearchFieldProps {
  /** Label for the input field */
  label: string;
  /** Currently selected user ID */
  value: string | null;
  /** Called when a user is selected */
  onSelect: (userId: string | null, displayName: string | null) => void;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
}

/**
 * A field that searches for users by email or name and allows selection.
 */
export function UserSearchField({
  label,
  value,
  onSelect,
  required = false,
  disabled = false,
}: UserSearchFieldProps) {
  const { t } = useTranslation("pages");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // Debounce query input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: users, isLoading, isFetched } = useUserSearch(debouncedQuery);

  const handleSelect = (user: UserSearchResult) => {
    onSelect(user.id, user.displayName);
    setSelectedName(user.displayName);
    setQuery("");
  };

  const handleClear = () => {
    onSelect(null, null);
    setSelectedName(null);
    setQuery("");
  };

  // If a user is already selected, show their info
  if (value && selectedName) {
    return (
      <div className="space-y-2">
        <Label>
          {label} {required && "*"}
        </Label>
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
          <div className="flex-1">
            <p className="font-medium">{selectedName}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
          >
            {t("schools.form.admin.change")}
          </Button>
        </div>
      </div>
    );
  }

  const hasResults = users && users.length > 0;
  const showNotFound =
    isFetched && (!users || users.length === 0) && debouncedQuery.length >= 2;

  return (
    <div className="space-y-2">
      <Label htmlFor="admin-search">
        {label} {required && "*"}
      </Label>
      <Input
        id="admin-search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("schools.form.admin.searchPlaceholder")}
        disabled={disabled}
      />

      {isLoading && debouncedQuery.length >= 2 && (
        <p className="text-sm text-muted-foreground">
          {t("schools.form.admin.searching")}
        </p>
      )}

      {hasResults && (
        <div className="space-y-1 rounded-md border bg-muted/50 p-2">
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => handleSelect(user)}
              disabled={disabled}
              className="flex w-full items-center justify-between rounded-md p-2 text-left hover:bg-muted"
            >
              <div>
                <p className="font-medium">{user.displayName}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              <span className="text-sm text-primary">
                {t("schools.form.admin.select")}
              </span>
            </button>
          ))}
        </div>
      )}

      {showNotFound && (
        <p className="text-sm text-destructive">
          {t("schools.form.admin.notFound")}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {t("schools.form.admin.help")}
      </p>
    </div>
  );
}
