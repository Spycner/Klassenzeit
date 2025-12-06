import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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
 * A field that searches for users by email and allows selection.
 */
export function UserSearchField({
  label,
  value,
  onSelect,
  required = false,
  disabled = false,
}: UserSearchFieldProps) {
  const { t } = useTranslation("pages");
  const [email, setEmail] = useState("");
  const [debouncedEmail, setDebouncedEmail] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // Debounce email input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEmail(email.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [email]);

  const { data: user, isLoading, isFetched } = useUserSearch(debouncedEmail);

  const handleSelect = () => {
    if (user) {
      onSelect(user.id, user.displayName);
      setSelectedName(user.displayName);
      setEmail("");
    }
  };

  const handleClear = () => {
    onSelect(null, null);
    setSelectedName(null);
    setEmail("");
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

  const showNotFound = isFetched && !user && debouncedEmail.length >= 3;
  const showUserFound = user && !value;

  return (
    <div className="space-y-2">
      <Label htmlFor="admin-search">
        {label} {required && "*"}
      </Label>
      <div className="flex gap-2">
        <Input
          id="admin-search"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("schools.form.admin.searchPlaceholder")}
          disabled={disabled}
          className="flex-1"
        />
        {showUserFound && (
          <Button
            type="button"
            variant="outline"
            onClick={handleSelect}
            disabled={disabled}
          >
            {t("schools.form.admin.select")}
          </Button>
        )}
      </div>

      {isLoading && debouncedEmail.length >= 3 && (
        <p className="text-sm text-muted-foreground">
          {t("schools.form.admin.searching")}
        </p>
      )}

      {showUserFound && (
        <div className="rounded-md border bg-muted/50 p-3">
          <p className="font-medium">{user.displayName}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
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
