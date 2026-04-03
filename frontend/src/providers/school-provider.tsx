"use client";

import { createContext, useCallback, useState } from "react";

export interface SchoolContextValue {
  selectedSchoolId: string | null;
  selectSchool: (id: string | null) => void;
}

export const SchoolContext = createContext<SchoolContextValue>({
  selectedSchoolId: null,
  selectSchool: () => {},
});

export function SchoolProvider({ children }: { children: React.ReactNode }) {
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);

  const selectSchool = useCallback((id: string | null) => {
    setSelectedSchoolId(id);
  }, []);

  return (
    <SchoolContext value={{ selectedSchoolId, selectSchool }}>
      {children}
    </SchoolContext>
  );
}
