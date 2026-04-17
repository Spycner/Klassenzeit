import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import i18n from "@/i18n/init";
import { ApiError, client } from "@/lib/api-client";
import { meQueryKey } from "@/lib/auth";

const LoginSchema = z.object({
  email: z.string().email({ message: i18n.t("auth.login.errors.invalidEmail") }),
  password: z.string().min(1, { message: i18n.t("auth.login.errors.passwordRequired") }),
});

type LoginValues = z.infer<typeof LoginSchema>;

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();

  const form = useForm<LoginValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: async (values: LoginValues) => {
      await client.POST("/auth/login", { body: values });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      navigate({ to: search.next ?? "/" });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        form.setError("password", { message: t("auth.login.errors.invalidCredentials") });
        return;
      }
      form.setError("root", {
        message: err instanceof Error ? err.message : t("auth.login.errors.generic"),
      });
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-background p-6 shadow-sm">
        <div className="flex items-center justify-end gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">{t("auth.login.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("auth.login.subtitle")}</p>
        </div>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => login.mutate(values))}
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.login.email")}</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("auth.login.password")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? t("auth.login.submitPending") : t("auth.login.submit")}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
