/**
 * Armazenamento seguro do token de sessão.
 * - Nativo (iOS/Android): expo-secure-store (Keychain / Keystore).
 * - Web (para testar no navegador): localStorage.
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const isWeb = Platform.OS === "web";

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
