import { Suspense } from "react";
import { AppToaster } from "@/components/providers/AppToaster";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { NotificationCenter } from "@/components/providers/NotificationCenter";
import { NavigationMemory } from "@/components/nav/NavigationMemory";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <Suspense fallback={null}>
        <NavigationMemory />
      </Suspense>
      {children}
      <AppToaster />
      <NotificationCenter />
    </ThemeProvider>
  );
}
