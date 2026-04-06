"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiClient } from "@/hooks/use-api-client";

type Props = {
  schoolId: string;
  onLoaded: () => Promise<void> | void;
};

export function LoadExampleButton({ schoolId, onLoaded }: Props) {
  const t = useTranslations("onboarding.exampleData");
  const apiClient = useApiClient();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await apiClient.post(`/api/schools/${schoolId}/load-example`, undefined);
      toast.success(t("success"));
      await onLoaded();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // api-client throws `new Error(`${status} ${statusText}`)` for non-2xx,
      // so a 409 Conflict surfaces as a message starting with "409".
      if (msg.startsWith("409") || msg.toLowerCase().includes("conflict")) {
        toast.error(t("alreadyHasData"));
      } else {
        toast.error(msg || t("genericError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" onClick={handleClick} disabled={loading}>
      <Sparkles className="mr-2 h-4 w-4" />
      {loading ? t("loading") : t("button")}
    </Button>
  );
}
