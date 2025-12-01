/**
 * API Module - Main entry point for API functionality
 *
 * Usage:
 *
 * ```tsx
 * // Import types
 * import type { SchoolResponse, TeacherSummary } from "@/api";
 *
 * // Import hooks
 * import { useSchools, useCreateTeacher, queryClient } from "@/api";
 *
 * // Import services for direct API calls (if needed)
 * import { schoolsApi, teachersApi } from "@/api/services";
 * ```
 */

// Re-export API client and error types
export { ApiClientError, type ApiError, apiClient } from "./client";

// Re-export all hooks
export * from "./hooks";
// Re-export all types
export * from "./types";
