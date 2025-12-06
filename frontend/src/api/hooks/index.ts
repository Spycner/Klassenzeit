/**
 * API Hooks - Re-export all hooks for convenient importing
 */

// Query Client
export { queryClient, queryKeys } from "./query-client";
// Access Request hooks
export {
  useAccessRequest,
  useAccessRequests,
  useCancelAccessRequest,
  useCreateAccessRequest,
  useReviewAccessRequest,
} from "./use-access-requests";
// Class hooks
export {
  useClass,
  useClasses,
  useCreateClass,
  useDeleteClass,
  useUpdateClass,
} from "./use-classes";
// Current user hook
export { useCurrentUser } from "./use-current-user";
// Lesson hooks
export {
  useCreateLesson,
  useDeleteLesson,
  useLesson,
  useLessons,
  useUpdateLesson,
} from "./use-lessons";
// Membership hooks
export {
  useCreateMembership,
  useDeleteMembership,
  useMembership,
  useMemberships,
  useUpdateMembership,
} from "./use-memberships";
// Room hooks
export {
  useCreateRoom,
  useDeleteRoom,
  useRoom,
  useRooms,
  useUpdateRoom,
} from "./use-rooms";
// School Year hooks
export {
  useCreateSchoolYear,
  useDeleteSchoolYear,
  useSchoolYear,
  useSchoolYears,
  useUpdateSchoolYear,
} from "./use-school-years";
// School hooks
export {
  useCreateSchool,
  useDeleteSchool,
  useSchool,
  useSchools,
  useUpdateSchool,
} from "./use-schools";
// Solver hooks
export {
  useApplySolution,
  useSolution,
  useSolverStatus,
  useStartSolving,
  useStopSolving,
} from "./use-solver";
// Subject hooks
export {
  useCreateSubject,
  useDeleteSubject,
  useSubject,
  useSubjects,
  useUpdateSubject,
} from "./use-subjects";
// Teacher hooks (including qualifications and availability)
export {
  useAvailability,
  useAvailabilityEntry,
  useCreateAvailability,
  useCreateQualification,
  useCreateTeacher,
  useDeleteAvailability,
  useDeleteQualification,
  useDeleteTeacher,
  useQualification,
  useQualifications,
  useTeacher,
  useTeachers,
  useUpdateAvailability,
  useUpdateQualification,
  useUpdateTeacher,
} from "./use-teachers";
// Term hooks
export {
  useCreateTerm,
  useDeleteTerm,
  useTerm,
  useTerms,
  useUpdateTerm,
} from "./use-terms";
// Time Slot hooks
export {
  useCreateTimeSlot,
  useDeleteTimeSlot,
  useTimeSlot,
  useTimeSlots,
  useUpdateTimeSlot,
} from "./use-time-slots";
