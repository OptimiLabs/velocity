import type { Metadata } from "next";
import "./globals.css";
import { LayoutShell } from "@/components/layout/LayoutShell";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ConsoleProvider } from "@/components/providers/ConsoleProvider";
import { KeyboardShortcuts } from "@/components/providers/KeyboardShortcuts";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/hooks/useConfirm";

export const metadata: Metadata = {
  title: "Velocity",
  description: "Local control center for Claude Code sessions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <QueryProvider>
            <ConsoleProvider>
              <ConfirmProvider>
                <TooltipProvider delayDuration={200}>
                  <KeyboardShortcuts />
                  <Toaster />
                  <LayoutShell>{children}</LayoutShell>
                </TooltipProvider>
              </ConfirmProvider>
            </ConsoleProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
