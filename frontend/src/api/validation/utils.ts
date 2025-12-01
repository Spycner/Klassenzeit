/**
 * Schema builder utilities for common validation patterns
 */

import { z } from "zod";

/** Create required string schema with length limits */
export function requiredString(max: number, fieldName: string) {
  return z
    .string({ required_error: `${fieldName} is required` })
    .min(1, `${fieldName} is required`)
    .max(max, `${fieldName} must be at most ${max} characters`);
}

/** Create optional string schema with length limits */
export function optionalString(max: number, fieldName: string) {
  return z
    .string()
    .max(max, `${fieldName} must be at most ${max} characters`)
    .optional();
}

/** Email schema (optional, validates format when provided) */
export function optionalEmail(max = 255) {
  return z
    .string()
    .max(max, `Email must be at most ${max} characters`)
    .email("Invalid email format")
    .optional()
    .or(z.literal(""));
}

/** Integer range schema */
export function intRange(min: number, max: number, fieldName: string) {
  return z
    .number({ required_error: `${fieldName} is required` })
    .int(`${fieldName} must be a whole number`)
    .min(min, `${fieldName} must be at least ${min}`)
    .max(max, `${fieldName} must be at most ${max}`);
}

/** Optional integer with minimum */
export function optionalIntMin(min: number, fieldName: string) {
  return z
    .number()
    .int(`${fieldName} must be a whole number`)
    .min(min, `${fieldName} must be at least ${min}`)
    .optional();
}

/** Optional integer with range */
export function optionalIntRange(min: number, max: number, fieldName: string) {
  return z
    .number()
    .int(`${fieldName} must be a whole number`)
    .min(min, `${fieldName} must be at least ${min}`)
    .max(max, `${fieldName} must be at most ${max}`)
    .optional();
}

/** Required UUID string */
export function requiredUuid(fieldName: string) {
  return z
    .string({ required_error: `${fieldName} is required` })
    .uuid(`${fieldName} must be a valid UUID`);
}

/** Optional UUID string */
export function optionalUuid(fieldName: string) {
  return z.string().uuid(`${fieldName} must be a valid UUID`).optional();
}

/** Required ISO date string (YYYY-MM-DD) */
export function requiredDate(fieldName: string) {
  return z
    .string({ required_error: `${fieldName} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${fieldName} must be in YYYY-MM-DD format`);
}

/** Required time string (HH:mm or HH:mm:ss) */
export function requiredTime(fieldName: string) {
  return z
    .string({ required_error: `${fieldName} is required` })
    .regex(
      /^\d{2}:\d{2}(:\d{2})?$/,
      `${fieldName} must be in HH:mm or HH:mm:ss format`,
    );
}
