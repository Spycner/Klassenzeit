"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PreviewResponse, RowAction } from "@/lib/import-export";

interface Props {
  open: boolean;
  preview: PreviewResponse;
  onCancel: () => void;
  onConfirm: (token: string) => void;
}

const actionTone: Record<RowAction, string> = {
  create: "bg-green-100 text-green-900",
  update: "bg-blue-100 text-blue-900",
  unchanged: "bg-gray-100 text-gray-700",
  invalid: "bg-red-100 text-red-900",
};

export function ImportPreviewDialog({
  open,
  preview,
  onCancel,
  onConfirm,
}: Props) {
  const t = useTranslations("importExport.preview");
  const ts = useTranslations("importExport.preview.summary");
  const tIe = useTranslations("importExport");
  const disabled = preview.summary.invalid > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Badge className="bg-green-100 text-green-900">
            {ts("create")} {preview.summary.create}
          </Badge>
          <Badge className="bg-blue-100 text-blue-900">
            {ts("update")} {preview.summary.update}
          </Badge>
          <Badge className="bg-gray-100 text-gray-700">
            {ts("unchanged")} {preview.summary.unchanged}
          </Badge>
          <Badge className="bg-red-100 text-red-900">
            {ts("invalid")} {preview.summary.invalid}
          </Badge>
        </div>

        {preview.file_warnings && preview.file_warnings.length > 0 && (
          <div className="rounded border border-yellow-300 bg-yellow-50 p-2 text-sm">
            <p className="font-semibold">{t("fileWarnings")}</p>
            <ul className="list-disc pl-5">
              {preview.file_warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="max-h-96 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("lineColumn")}</TableHead>
                <TableHead>{t("actionColumn")}</TableHead>
                <TableHead>{t("keyColumn")}</TableHead>
                <TableHead>{t("errorsColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((r) => (
                <TableRow key={`${r.line}-${r.natural_key}`}>
                  <TableCell>{r.line}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${actionTone[r.action]}`}
                    >
                      {r.action}
                    </span>
                  </TableCell>
                  <TableCell>{r.natural_key || "—"}</TableCell>
                  <TableCell>
                    {r.errors && r.errors.length > 0 ? (
                      <ul className="text-sm text-red-700">
                        {r.errors.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {tIe("cancel")}
          </Button>
          <Button
            disabled={disabled}
            title={disabled ? t("invalidDisabled") : undefined}
            onClick={() => onConfirm(preview.token)}
          >
            {tIe("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
