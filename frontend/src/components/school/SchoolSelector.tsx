import { Building2, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSchoolContext } from "@/contexts/SchoolContext";

/**
 * Dropdown for selecting the current school.
 * Only shows as a dropdown for users with multiple schools.
 * Shows just the school name for single-school users.
 */
export function SchoolSelector() {
  const { t } = useTranslation("auth");
  const { currentSchool, setCurrentSchool, userSchools } = useSchoolContext();

  // Don't render anything if no schools
  if (userSchools.length === 0) {
    return null;
  }

  // For single-school users, just show the school name
  if (userSchools.length === 1) {
    return (
      <span className="text-sm text-muted-foreground">
        {currentSchool?.schoolName}
      </span>
    );
  }

  // For multi-school users, show a dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Building2 className="h-4 w-4" />
          <span className="max-w-[150px] truncate">
            {currentSchool?.schoolName ?? t("selectSchool", "Select school")}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {t("yourSchools", "Your schools")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {userSchools.map((school) => (
          <DropdownMenuItem
            key={school.schoolId}
            onClick={() => setCurrentSchool(school)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{school.schoolName}</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {school.role}
              </Badge>
              {currentSchool?.schoolId === school.schoolId && (
                <Check className="h-4 w-4" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
