import type { ApiClient } from "@/lib/api-client";

export type EntityKind =
  | "teachers"
  | "subjects"
  | "rooms"
  | "classes"
  | "timeslots"
  | "curriculum";

export type RowAction = "create" | "update" | "unchanged" | "invalid";

export interface PreviewRow {
  line: number;
  action: RowAction;
  natural_key: string;
  data?: Record<string, unknown>;
  diff?: Record<string, [unknown, unknown]>;
  errors?: string[];
  warnings?: string[];
}

export interface PreviewSummary {
  create: number;
  update: number;
  unchanged: number;
  invalid: number;
}

export interface PreviewResponse {
  token: string;
  entity: EntityKind;
  summary: PreviewSummary;
  file_warnings?: string[];
  rows: PreviewRow[];
}

export function exportUrl(
  schoolId: string,
  entity: EntityKind,
  termId?: string,
): string {
  const base = `/api/schools/${schoolId}/export/${entity}`;
  return termId ? `${base}?term_id=${termId}` : base;
}

export async function uploadPreview(
  apiClient: ApiClient,
  schoolId: string,
  entity: EntityKind,
  file: File,
  termId?: string,
): Promise<PreviewResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const path = `/api/schools/${schoolId}/import/${entity}/preview${
    termId ? `?term_id=${termId}` : ""
  }`;
  return apiClient.postForm<PreviewResponse>(path, fd);
}

export async function commitPreview(
  apiClient: ApiClient,
  schoolId: string,
  entity: EntityKind,
  token: string,
): Promise<void> {
  await apiClient.post<void>(
    `/api/schools/${schoolId}/import/${entity}/commit`,
    { token },
  );
}
