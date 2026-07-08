/**
 * Login: dispara o fluxo OAuth do Mercado Livre num in-app browser.
 * O backend faz o Authorization Code + PKCE e devolve o app session token via
 * deep link `coletafull://auth?session=...` (§4.3). O app nunca vê senha do ML.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useApp } from "../store/AppContext";
import { colors, radius, spacing } from "../theme";

const REDIRECT = "coletafull://auth";

export function LoginScreen() {
  const { api, signIn } = useApp();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    if (!email.includes("@")) {
      setError("Informe um e-mail válido.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        api.authorizeUrl(email),
        REDIRECT,
      );
      if (result.type === "success") {
        const url = new URL(result.url);
        const session = url.searchParams.get("session");
        if (session) {
          await signIn(session);
          return;
        }
        setError("Não recebemos o token de sessão. Tente de novo.");
      } else if (result.type === "cancel") {
        setError(null);
      }
    } catch {
      setError("Falha ao conectar com o Mercado Livre.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.logo}>Coleta Full</Text>
        <Text style={styles.subtitle}>
          Seus envios Full do dia e o código de autorização, sempre à mão.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="seu@email.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={connect} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.buttonText}>Conectar conta Mercado Livre</Text>
          )}
        </Pressable>

        <Text style={styles.legal}>
          Você autoriza o acesso à sua própria conta via OAuth oficial do
          Mercado Livre. Não pedimos sua senha.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: "center", padding: spacing.xl },
  logo: { color: colors.text, fontSize: 34, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 15, marginTop: spacing.sm, marginBottom: spacing.xl },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  error: { color: colors.danger, marginTop: spacing.md },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
  legal: { color: colors.textMuted, fontSize: 12, marginTop: spacing.lg, lineHeight: 17 },
});
