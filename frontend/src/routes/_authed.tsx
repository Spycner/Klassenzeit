import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ApiError } from "@/lib/api-client";
import { fetchMe, meQueryKey } from "@/lib/auth";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: meQueryKey,
        queryFn: fetchMe,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw redirect({
          to: "/login",
          search: { next: location.href },
        });
      }
      throw err;
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
