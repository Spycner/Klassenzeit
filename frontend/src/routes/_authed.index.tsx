import { createFileRoute } from "@tanstack/react-router";
import { useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authed/")({
  component: Dashboard,
});

function Dashboard() {
  const me = useMe();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-muted-foreground">
        Welcome{me.data ? `, ${me.data.email}` : ""}. Choose an entity from the sidebar to manage.
      </p>
    </div>
  );
}
