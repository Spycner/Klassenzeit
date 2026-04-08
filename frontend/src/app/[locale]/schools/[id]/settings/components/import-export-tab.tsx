"use client";

import { Download, Upload } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImportPreviewDialog } from "@/components/import-preview-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiClient } from "@/hooks/use-api-client";
import {
  commitPreview,
  type EntityKind,
  exportUrl,
  type PreviewResponse,
  uploadPreview,
} from "@/lib/import-export";
import type { TermResponse } from "@/lib/types";

const ENTITIES: EntityKind[] = [
  "teachers",
  "subjects",
  "rooms",
  "classes",
  "timeslots",
  "curriculum",
];

export function ImportExportTab() {
  const { id: schoolId } = useParams<{ id: string }>();
  const apiClient = useApiClient();
  const t = useTranslations("importExport");

  const [terms, setTerms] = useState<TermResponse[]>([]);
  const [termId, setTermId] = useState<string | undefined>();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const inputRefs = useRef<Record<EntityKind, HTMLInputElement | null>>(
    {} as Record<EntityKind, HTMLInputElement | null>,
  );

  useEffect(() => {
    apiClient
      .get<TermResponse[]>(`/api/schools/${schoolId}/terms`)
      .then((ts) => {
        setTerms(ts);
        if (ts.length > 0) setTermId(ts[0].id);
      })
      .catch(() => {});
  }, [apiClient, schoolId]);

  const handleExport = (entity: EntityKind) => {
    if (entity === "curriculum" && !termId) {
      toast.error(t("termRequired"));
      return;
    }
    window.location.href = exportUrl(
      schoolId,
      entity,
      entity === "curriculum" ? termId : undefined,
    );
  };

  const handleFile = async (entity: EntityKind, file: File) => {
    if (entity === "curriculum" && !termId) {
      toast.error(t("termRequired"));
      return;
    }
    try {
      const resp = await uploadPreview(
        apiClient,
        schoolId,
        entity,
        file,
        entity === "curriculum" ? termId : undefined,
      );
      setPreview(resp);
    } catch {
      toast.error(t("toast.commitFailed"));
    }
  };

  const handleConfirm = async (token: string) => {
    if (!preview) return;
    try {
      await commitPreview(apiClient, schoolId, preview.entity, token);
      toast.success(t("toast.importSuccess"));
      setPreview(null);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 410) {
        toast.error(t("toast.previewExpired"));
      } else {
        toast.error(t("toast.commitFailed"));
      }
      setPreview(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("tab.description")}</p>

      {ENTITIES.map((entity) => (
        <div key={entity} className="flex flex-col gap-2 rounded border p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">{t(`entities.${entity}.title`)}</h3>
            <p className="text-xs text-muted-foreground">
              {t(`entities.${entity}.description`)}
            </p>
          </div>

          {entity === "curriculum" && (
            <div className="max-w-xs">
              <Select value={termId} onValueChange={setTermId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((term) => (
                    <SelectItem key={term.id} value={term.id}>
                      {term.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport(entity)}
            >
              <Download className="mr-1 size-4" />
              {t("export")}
            </Button>
            <Button
              size="sm"
              onClick={() => inputRefs.current[entity]?.click()}
            >
              <Upload className="mr-1 size-4" />
              {t("import")}
            </Button>
            <input
              ref={(el) => {
                inputRefs.current[entity] = el;
              }}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(entity, f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      ))}

      {preview && (
        <ImportPreviewDialog
          open
          preview={preview}
          onCancel={() => setPreview(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
