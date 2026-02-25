"use client";

import { createContext, useContext } from "react";
import { useMultiConsole } from "@/hooks/useMultiConsole";

type ConsoleContextType = ReturnType<typeof useMultiConsole>;

const ConsoleContext = createContext<ConsoleContextType | null>(null);

export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const console = useMultiConsole();
  return (
    <ConsoleContext.Provider value={console}>
      {children}
    </ConsoleContext.Provider>
  );
}

export function useConsole() {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used within ConsoleProvider");
  return ctx;
}
