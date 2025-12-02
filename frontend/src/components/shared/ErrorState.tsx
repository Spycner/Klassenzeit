import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  /** Error object to display */
  error: Error;
  /** Callback when retry is clicked */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
}

export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  const { t } = useTranslation("common");

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        className,
      )}
      role="alert"
    >
      <div className="mb-4 rounded-full bg-destructive/10 p-4">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold">{t("errorOccurred")}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {error.message}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-4">
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
