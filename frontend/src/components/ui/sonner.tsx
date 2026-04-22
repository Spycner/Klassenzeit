import { useTheme } from "next-themes";
import { useEffect } from "react";
import { Toaster as SonnerToaster, type ToasterProps, toast } from "sonner";

const TOAST_DISMISS_DURATION_MS = 2000;

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();

  useEffect(() => {
    function dismissOnToastClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const toastEl = target.closest<HTMLElement>("[data-sonner-toast]");
      if (!toastEl) return;
      const id = toastEl.dataset.id;
      if (id) toast.dismiss(id);
    }
    document.addEventListener("click", dismissOnToastClick);
    return () => document.removeEventListener("click", dismissOnToastClick);
  }, []);

  return (
    <SonnerToaster
      theme={(theme as ToasterProps["theme"]) ?? "system"}
      duration={TOAST_DISMISS_DURATION_MS}
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
