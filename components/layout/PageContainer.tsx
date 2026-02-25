import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  fullHeight?: boolean;
}

export function PageContainer({
  children,
  className,
  fullHeight,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "w-full p-4 sm:p-6 lg:p-8",
        fullHeight ? "h-full flex flex-col gap-6" : "min-h-full space-y-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
