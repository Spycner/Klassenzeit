import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  /** Message to display alongside the spinner */
  message?: string;
  /** Number of skeleton rows to display */
  rows?: number;
  /** Additional CSS classes */
  className?: string;
}

export function LoadingState({ message, rows, className }: LoadingStateProps) {
  const { t } = useTranslation("common");
  const displayMessage = message ?? t("loading");

  return (
    <output
      className={cn(
        "flex flex-col items-center justify-center py-8",
        className,
      )}
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span>{displayMessage}</span>
      </div>
      {rows && rows > 0 && (
        <div className="mt-6 w-full max-w-md space-y-3">
          {Array.from({ length: rows }).map((_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Skeleton rows are static placeholders without identity
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      )}
    </output>
  );
}
