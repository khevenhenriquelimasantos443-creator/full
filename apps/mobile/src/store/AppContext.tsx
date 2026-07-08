/**
 * Estado global do app: sessão (token guardado no SecureStore), conta ativa e
 * o cliente de API. Expõe login/logout e a troca de conta (Multi-Conta §4.3).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getItem, setItem, deleteItem } from "../lib/storage";
import { ApiClient } from "../api/client";
import type { Account } from "../api/types";

const SESSION_KEY = "coletafull.session";
const ACTIVE_ACCOUNT_KEY = "coletafull.activeAccount";

interface AppState {
  ready: boolean;
  token: string | null;
  accounts: Account[];
  activeAccount: Account | null;
  api: ApiClient;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  setActiveAccount: (account: Account) => Promise<void>;
  refreshAccounts: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccountState] = useState<Account | null>(null);

  const api = useMemo(
    () =>
      new ApiClient(token, () => {
        // 401 ⇒ derruba a sessão para forçar reconexão.
        void deleteItem(SESSION_KEY);
        setToken(null);
      }),
    [token],
  );

  const refreshAccounts = useCallback(async () => {
    if (!token) return;
    const { accounts: list } = await api.listAccounts();
    setAccounts(list);
    setActiveAccountState((current) => {
      if (current && list.some((a) => a.id === current.id)) return current;
      return list[0] ?? null;
    });
  }, [api, token]);

  // Bootstrap: recupera sessão salva.
  useEffect(() => {
    (async () => {
      const saved = await getItem(SESSION_KEY);
      if (saved) setToken(saved);
      setReady(true);
    })();
  }, []);

  // Ao ter token, carrega contas e a conta ativa persistida.
  useEffect(() => {
    if (!token) {
      setAccounts([]);
      setActiveAccountState(null);
      return;
    }
    (async () => {
      const { accounts: list } = await api.listAccounts();
      setAccounts(list);
      const savedId = await getItem(ACTIVE_ACCOUNT_KEY);
      setActiveAccountState(
        list.find((a) => a.id === savedId) ?? list[0] ?? null,
      );
    })().catch(() => {
      /* silencioso: telas tratam erros de carga */
    });
  }, [token, api]);

  const signIn = useCallback(async (newToken: string) => {
    await setItem(SESSION_KEY, newToken);
    setToken(newToken);
  }, []);

  const signOut = useCallback(async () => {
    await deleteItem(SESSION_KEY);
    await deleteItem(ACTIVE_ACCOUNT_KEY);
    setToken(null);
    setAccounts([]);
    setActiveAccountState(null);
  }, []);

  const setActiveAccount = useCallback(async (account: Account) => {
    await setItem(ACTIVE_ACCOUNT_KEY, account.id);
    setActiveAccountState(account);
  }, []);

  const value: AppState = {
    ready,
    token,
    accounts,
    activeAccount,
    api,
    signIn,
    signOut,
    setActiveAccount,
    refreshAccounts,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp deve ser usado dentro de AppProvider");
  return ctx;
}
