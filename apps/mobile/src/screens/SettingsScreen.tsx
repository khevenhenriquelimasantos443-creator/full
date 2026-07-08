/** Configurações (§4.5): contas conectadas, adicionar conta e sair. */

import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useApp } from "../store/AppContext";
import { colors, radius, spacing } from "../theme";

export function SettingsScreen() {
  const { api, accounts, refreshAccounts, signOut, signIn } = useApp();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    refreshAccounts().catch(() => {});
  }, [refreshAccounts]);

  const addAccount = async () => {
    // Reusa o e-mail da 1ª conta como identidade do usuário do app.
    const identity = email ?? accounts[0]?.nickname ?? "operador@coleta-full.app";
    const result = await WebBrowser.openAuthSessionAsync(
      api.authorizeUrl(identity),
      "coletafull://auth",
    );
    if (result.type === "success") {
      const session = new URL(result.url).searchParams.get("session");
      if (session) {
        await signIn(session);
        await refreshAccounts();
      }
    }
  };

  const remove = (id: string, label: string) => {
    Alert.alert("Remover conta", `Desconectar ${label}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          await api.removeAccount(id);
          await refreshAccounts();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.section}>Contas conectadas</Text>
      {accounts.map((a) => (
        <View key={a.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{a.nickname ?? a.mlUserId}</Text>
            <Text style={styles.rowMeta}>
              {a.siteId} · {a.status}
            </Text>
          </View>
          <Pressable onPress={() => remove(a.id, a.nickname ?? a.mlUserId)}>
            <Text style={styles.remove}>Remover</Text>
          </Pressable>
        </View>
      ))}

      <Pressable style={styles.addBtn} onPress={addAccount}>
        <Text style={styles.addText}>+ Conectar outra conta</Text>
      </Pressable>

      <Text style={styles.section}>Sessão</Text>
      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sair</Text>
      </Pressable>

      <Text style={styles.hint} onPress={() => setEmail(null)}>
        O código de autorização e os dados de coleta (motorista, placa) são do
        Módulo Beta — obtidos de forma não-oficial e sujeitos a mudanças na
        plataforma.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  section: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  rowMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  remove: { color: colors.danger, fontWeight: "600" },
  addBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  addText: { color: colors.primary, fontWeight: "700" },
  signOut: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  signOutText: { color: colors.danger, fontWeight: "700" },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.xl },
});
