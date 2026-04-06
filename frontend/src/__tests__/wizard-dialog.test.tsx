import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApiClient = {
  get: vi.fn().mockResolvedValue([]),
  post: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/hooks/use-api-client", () => ({
  useApiClient: () => mockApiClient,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "school-1", locale: "en" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const tCache = new Map<
  string,
  (key: string, vars?: Record<string, unknown>) => string
>();
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => {
    let fn = tCache.get(ns);
    if (!fn) {
      fn = (key: string, vars?: Record<string, unknown>) => {
        if (vars) {
          return `${ns}.${key}(${Object.entries(vars)
            .map(([k, v]) => `${k}=${v}`)
            .join(",")})`;
        }
        return `${ns}.${key}`;
      };
      tCache.set(ns, fn);
    }
    return fn;
  },
  useLocale: () => "en",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { WizardDialog } from "@/components/onboarding/wizard-dialog";

beforeEach(() => {
  vi.clearAllMocks();
  tCache.clear();
  mockApiClient.get.mockResolvedValue([]);
});

describe("WizardDialog", () => {
  it("renders the title for the initial step (term)", async () => {
    render(
      <WizardDialog
        schoolId="school-1"
        open
        initialStep={0}
        onClose={() => {}}
        onProgressChange={async () => {}}
      />,
    );
    expect(
      screen.getByText(/onboarding\.wizard\.stepCounter\(current=1,total=7\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("onboarding.steps.term.title")).toBeInTheDocument();
  });

  it("disables Back on the first step", () => {
    render(
      <WizardDialog
        schoolId="school-1"
        open
        initialStep={0}
        onClose={() => {}}
        onProgressChange={async () => {}}
      />,
    );
    const back = screen.getByRole("button", {
      name: "onboarding.buttons.back",
    });
    expect(back).toBeDisabled();
  });

  it("advances to the next step on Skip", async () => {
    const onProgressChange = vi.fn().mockResolvedValue(undefined);
    render(
      <WizardDialog
        schoolId="school-1"
        open
        initialStep={0}
        onClose={() => {}}
        onProgressChange={onProgressChange}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "onboarding.buttons.skip" }),
    );
    expect(
      screen.getByText(/onboarding\.wizard\.stepCounter\(current=2,total=7\)/),
    ).toBeInTheDocument();
    expect(onProgressChange).toHaveBeenCalled();
  });

  it("calls onClose when Finish is clicked on the last step", async () => {
    const onClose = vi.fn();
    render(
      <WizardDialog
        schoolId="school-1"
        open
        initialStep={6}
        onClose={onClose}
        onProgressChange={async () => {}}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "onboarding.buttons.finish" }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
