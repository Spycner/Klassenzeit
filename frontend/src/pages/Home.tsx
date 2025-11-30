import { Button } from "@/components/ui/button";

export function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">Klassenzeit</h1>
      <p className="text-muted-foreground">Timetabler for schools</p>
      <Button>Get Started</Button>
    </div>
  );
}
