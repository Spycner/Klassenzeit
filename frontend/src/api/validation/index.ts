/**
 * Validation module - Zod schemas for all API request types
 */

export { VALIDATION } from "./constants";
export {
  type CreateAvailabilityInput,
  createAvailabilitySchema,
  type UpdateAvailabilityInput,
  updateAvailabilitySchema,
} from "./schemas/availability";
export {
  type CreateLessonInput,
  createLessonSchema,
  type UpdateLessonInput,
  updateLessonSchema,
} from "./schemas/lesson";
export {
  type CreateQualificationInput,
  createQualificationSchema,
  type UpdateQualificationInput,
  updateQualificationSchema,
} from "./schemas/qualification";
export {
  type CreateRoomInput,
  createRoomSchema,
  type UpdateRoomInput,
  updateRoomSchema,
} from "./schemas/room";
export {
  type CreateSchoolInput,
  createSchoolSchema,
  type UpdateSchoolInput,
  updateSchoolSchema,
} from "./schemas/school";
export {
  type CreateSchoolClassInput,
  createSchoolClassSchema,
  type UpdateSchoolClassInput,
  updateSchoolClassSchema,
} from "./schemas/school-class";
export {
  type CreateSchoolYearInput,
  createSchoolYearSchema,
  type UpdateSchoolYearInput,
  updateSchoolYearSchema,
} from "./schemas/school-year";
export {
  type CreateSubjectInput,
  createSubjectSchema,
  type UpdateSubjectInput,
  updateSubjectSchema,
} from "./schemas/subject";
export {
  type CreateTeacherInput,
  createTeacherSchema,
  type UpdateTeacherInput,
  updateTeacherSchema,
} from "./schemas/teacher";
export {
  type CreateTermInput,
  createTermSchema,
  type UpdateTermInput,
  updateTermSchema,
} from "./schemas/term";
export {
  type CreateTimeSlotInput,
  createTimeSlotSchema,
  type UpdateTimeSlotInput,
  updateTimeSlotSchema,
} from "./schemas/time-slot";
export {
  intRange,
  optionalEmail,
  optionalIntMin,
  optionalIntRange,
  optionalString,
  optionalUuid,
  requiredDate,
  requiredString,
  requiredTime,
  requiredUuid,
} from "./utils";
export {
  type ValidateOptions,
  ValidationError,
  type ValidationResult,
  validate,
  withValidation,
} from "./validate";
