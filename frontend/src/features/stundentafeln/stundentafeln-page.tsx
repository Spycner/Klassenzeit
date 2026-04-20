import { useSearch } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type Stundentafel, useStundentafeln } from "./hooks";
import {
  DeleteStundentafelDialog,
  StundentafelEditDialog,
  StundentafelFormDialog,
} from "./stundentafeln-dialogs";

export function StundentafelnPage() {
  const { t } = useTranslation();
  const stundentafeln = useStundentafeln();
  const search = useSearch({ strict: false }) as { create?: string };

  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(() => search.create === "1");
  const [editing, setEditing] = useState<Stundentafel | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Stundentafel | null>(null);

  const rows = (stundentafeln.data ?? []).filter((row) => {
    if (!q) return true;
    return row.name.toLowerCase().includes(q.toLowerCase());
  });
  const showEmpty =
    !stundentafeln.isLoading && stundentafeln.data && stundentafeln.data.length === 0 && !q;

  return (
    <div className="space-y-4">
      <StundentafelnPageHead
        title={t("stundentafeln.title")}
        subtitle={t("stundentafeln.subtitle")}
        onCreate={() => setCreating(true)}
        createLabel={t("stundentafeln.new")}
      />

      {stundentafeln.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : stundentafeln.isError ? (
        <p className="text-sm text-destructive">{t("stundentafeln.loadError")}</p>
      ) : showEmpty ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title={t("stundentafeln.empty.title")}
          body={t("stundentafeln.empty.body")}
          steps={[
            t("stundentafeln.empty.step1"),
            t("stundentafeln.empty.step2"),
            t("stundentafeln.empty.step3"),
          ]}
          onCreate={() => setCreating(true)}
          createLabel={t("stundentafeln.new")}
        />
      ) : (
        <>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={t("common.search")}
            right={
              <span className="font-mono text-xs text-muted-foreground">
                {rows.length} {t("stundentafeln.title").toLowerCase()}
              </span>
            }
          />
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">{t("stundentafeln.columns.name")}</TableHead>
                  <TableHead className="py-2 text-right">
                    {t("stundentafeln.columns.gradeLevel")}
                  </TableHead>
                  <TableHead className="w-40 py-2 text-right">
                    {t("stundentafeln.columns.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tafel) => (
                  <TableRow key={tafel.id}>
                    <TableCell className="py-1.5 font-medium">{tafel.name}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-[12.5px]">
                      {tafel.grade_level}
                    </TableCell>
                    <TableCell className="space-x-2 py-1.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(tafel)}>
                        {t("common.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setConfirmDelete(tafel)}
                      >
                        {t("common.delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <StundentafelFormDialog open={creating} onOpenChange={setCreating} />
      {editing ? (
        <StundentafelEditDialog stundentafel={editing} onClose={() => setEditing(null)} />
      ) : null}
      {confirmDelete ? (
        <DeleteStundentafelDialog
          stundentafel={confirmDelete}
          onClose={() => setConfirmDelete(null)}
        />
      ) : null}
    </div>
  );
}

function StundentafelnPageHead({
  title,
  subtitle,
  onCreate,
  createLabel,
}: {
  title: string;
  subtitle: string;
  onCreate: () => void;
  createLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled title={t("sidebar.comingSoon")}>
          {t("common.import")}
        </Button>
        <Button onClick={onCreate}>{createLabel}</Button>
      </div>
    </div>
  );
}
