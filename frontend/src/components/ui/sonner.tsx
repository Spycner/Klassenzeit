import { useTheme } from "next-themes";
import { useEffect } from "react";
import { Toaster as SonnerToaster, type ToasterProps, toast } from "sonner";

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();

  useEffect(() => {
    function dismissOnToastClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const toastEl = target.closest<HTMLElement>("[data-sonner-toast]");
      if (!toastEl) return;
      // Let clicks on interactive children (action/cancel/close buttons, links)
      // run their own handlers without dismissing the toast first.
      const interactive = target.closest("button, a, [role='button']");
      if (interactive && toastEl.contains(interactive)) return;
      const id = toastEl.dataset.id;
      if (id) toast.dismiss(id);
    }
    document.addEventListener("click", dismissOnToastClick);
    return () => document.removeEventListener("click", dismissOnToastClick);
  }, []);

  return (
    <SonnerToaster
      theme={(theme as ToasterProps["theme"]) ?? "system"}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast cursor-pointer group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-md",
          title: "group-[.toast]:text-sm group-[.toast]:font-medium",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-md",
          success: "group-[.toast]:text-foreground",
          info: "group-[.toast]:text-foreground",
          error: "group-[.toast]:text-destructive",
          warning: "group-[.toast]:text-foreground",
        },
      }}
      {...props}
    />
  );
}
