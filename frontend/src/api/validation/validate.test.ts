import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ValidationError, validate, withValidation } from "./validate";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("validate", () => {
  const testSchema = z.object({
    name: z.string().min(1, "Name is required"),
    age: z.number().min(0, "Age must be positive"),
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns success with valid data", () => {
    const result = validate(testSchema, { name: "John", age: 25 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "John", age: 25 });
    }
  });

  it("returns failure with invalid data", () => {
    const result = validate(testSchema, { name: "", age: -1 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toContain("Name is required");
    }
  });

  it("shows toast on validation failure by default", () => {
    validate(testSchema, { name: "", age: 25 });

    expect(toast.error).toHaveBeenCalledWith("Validation Error", {
      description: "Name is required",
      duration: 5000,
    });
  });

  it("does not show toast when showToast is false", () => {
    validate(testSchema, { name: "", age: 25 }, { showToast: false });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("collects all validation errors", () => {
    const result = validate(testSchema, { name: "", age: -1 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain("Name is required");
      expect(result.errors).toContain("Age must be positive");
    }
  });
});

describe("ValidationError", () => {
  it("contains all error messages", () => {
    const error = new ValidationError(["Error 1", "Error 2"]);

    expect(error.errors).toEqual(["Error 1", "Error 2"]);
    expect(error.message).toBe("Error 1");
    expect(error.name).toBe("ValidationError");
  });

  it("is an instance of Error", () => {
    const error = new ValidationError(["Test error"]);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
  });
});

describe("withValidation", () => {
  const testSchema = z.object({
    name: z.string().min(1, "Name is required"),
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls mutation function with valid data", async () => {
    const mockMutation = vi.fn().mockResolvedValue({ id: "1", name: "Test" });
    const wrappedMutation = withValidation(testSchema, mockMutation);

    const result = await wrappedMutation({ name: "Test" });

    expect(mockMutation).toHaveBeenCalledWith({ name: "Test" });
    expect(result).toEqual({ id: "1", name: "Test" });
  });

  it("throws ValidationError with invalid data", async () => {
    const mockMutation = vi.fn();
    const wrappedMutation = withValidation(testSchema, mockMutation);

    await expect(wrappedMutation({ name: "" })).rejects.toThrow(
      ValidationError,
    );
    expect(mockMutation).not.toHaveBeenCalled();
  });

  it("shows toast when validation fails", async () => {
    const mockMutation = vi.fn();
    const wrappedMutation = withValidation(testSchema, mockMutation);

    try {
      await wrappedMutation({ name: "" });
    } catch {
      // Expected to throw
    }

    expect(toast.error).toHaveBeenCalledWith("Validation Error", {
      description: "Name is required",
      duration: 5000,
    });
  });
});
