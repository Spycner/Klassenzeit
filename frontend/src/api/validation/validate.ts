/**
 * Validation function with toast integration
 */

import { toast } from "sonner";
import type { z } from "zod";

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

export interface ValidateOptions {
  /** Whether to show a toast on validation failure (default: true) */
  showToast?: boolean;
}

/**
 * Validate data against a Zod schema.
 * Shows a toast notification on validation failure by default.
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  options: ValidateOptions = {},
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((e) => e.message);

  if (options.showToast !== false) {
    toast.error("Validation Error", {
      description: errors[0],
      duration: 5000,
    });
  }

  return { success: false, errors };
}

/**
 * Create a validated mutation function.
 * Wraps an API call with validation, throwing ValidationError on failure.
 */
export function withValidation<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
  mutationFn: (data: TInput) => Promise<TOutput>,
): (data: TInput) => Promise<TOutput> {
  return async (data: TInput) => {
    const result = validate(schema, data);
    if (!result.success) {
      throw new ValidationError(result.errors);
    }
    return mutationFn(result.data);
  };
}

/** Custom error for validation failures */
export class ValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors[0]);
    this.name = "ValidationError";
  }
}
