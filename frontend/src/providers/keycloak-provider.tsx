"use client";

import type Keycloak from "keycloak-js";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import {
  type AuthContextValue,
  type AuthUser,
  createKeycloak,
  parseAuthUser,
} from "@/lib/keycloak";

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isAuthenticated: false,
  logout: () => {},
});

type InitState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export function KeycloakProvider({ children }: { children: React.ReactNode }) {
  const keycloakRef = useRef<Keycloak | null>(null);
  const didInit = useRef(false);
  const [initState, setInitState] = useState<InitState>({ status: "loading" });
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const t = useTranslations("auth");

  const updateAuthState = useCallback((kc: Keycloak) => {
    setToken(kc.token ?? null);
    setUser(parseAuthUser(kc));
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const kc = createKeycloak();
    keycloakRef.current = kc;

    kc.onTokenExpired = () => {
      kc.updateToken(30).catch(() => {
        kc.login();
      });
    };

    kc.onAuthRefreshSuccess = () => {
      updateAuthState(kc);
    };

    kc.init({
      onLoad: "login-required",
      pkceMethod: "S256",
      checkLoginIframe: false,
    })
      .then((authenticated) => {
        if (authenticated) {
          updateAuthState(kc);
          setInitState({ status: "ready" });
        } else {
          kc.login();
        }
      })
      .catch((err) => {
        setInitState({
          status: "error",
          message: err instanceof Error ? err.message : t("connectionError"),
        });
      });
  }, [updateAuthState, t]);

  const logout = useCallback(() => {
    keycloakRef.current?.logout({ redirectUri: window.location.origin });
  }, []);

  if (initState.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-gray-500">{t("loading")}</p>
      </div>
    );
  }

  if (initState.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-red-600">{t("error")}</p>
          <p className="mt-2 text-sm text-gray-500">{initState.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext value={{ user, token, isAuthenticated: true, logout }}>
      {children}
    </AuthContext>
  );
}
