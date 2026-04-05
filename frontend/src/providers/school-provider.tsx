"use client";

import {
  createContext,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";

export interface SchoolContextValue {
  selectedSchoolId: string | null;
  selectSchool: (id: string | null) => void;
}

export const SchoolContext = createContext<SchoolContextValue>({
  selectedSchoolId: null,
  selectSchool: () => {},
});

export function SchoolProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<string | null>(null);
  const listenersRef = useRef(new Set<() => void>());

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const getSnapshot = useCallback(() => storeRef.current, []);

  const selectedSchoolId = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  const selectSchool = useCallback((id: string | null) => {
    if (storeRef.current === id) return;
    storeRef.current = id;
    for (const listener of listenersRef.current) {
      listener();
    }
  }, []);

  return (
    <SchoolContext value={{ selectedSchoolId, selectSchool }}>
      {children}
    </SchoolContext>
  );
}
