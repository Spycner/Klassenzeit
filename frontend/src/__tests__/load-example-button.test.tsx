import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/hooks/use-api-client", () => ({
  useApiClient: () => mockApiClient,
}));

vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { LoadExampleButton } from "@/components/onboarding/load-example-button";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoadExampleButton", () => {
  it("POSTs to /load-example, toasts success, and calls onLoaded", async () => {
    mockApiClient.post.mockResolvedValue(undefined);
    const onLoaded = vi.fn().mockResolvedValue(undefined);

    render(<LoadExampleButton schoolId="s1" onLoaded={onLoaded} />);

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(mockApiClient.post).toHaveBeenCalledTimes(1));
    expect(mockApiClient.post).toHaveBeenCalledWith(
      "/api/schools/s1/load-example",
      undefined,
    );
    await waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows the alreadyHasData toast on 409 Conflict", async () => {
    mockApiClient.post.mockRejectedValue(new Error("409 Conflict"));
    const onLoaded = vi.fn();

    render(<LoadExampleButton schoolId="s1" onLoaded={onLoaded} />);
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith("alreadyHasData");
    expect(onLoaded).not.toHaveBeenCalled();
  });

  it("shows a generic error toast on other failures", async () => {
    mockApiClient.post.mockRejectedValue(
      new Error("500 Internal Server Error"),
    );
    const onLoaded = vi.fn();

    render(<LoadExampleButton schoolId="s1" onLoaded={onLoaded} />);
    await userEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith("500 Internal Server Error");
    expect(onLoaded).not.toHaveBeenCalled();
  });
});
