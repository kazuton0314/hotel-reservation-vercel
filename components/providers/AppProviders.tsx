import { AppToaster } from "@/components/providers/AppToaster";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { NotificationCenter } from "@/components/providers/NotificationCenter";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <AppToaster />
      <NotificationCenter />
    </ThemeProvider>
  );
}
