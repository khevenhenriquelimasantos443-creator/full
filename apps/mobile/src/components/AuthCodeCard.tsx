/**
 * Card "Código de Autorização de Hoje" — destaque máximo da Home (§4.2).
 * Fonte grande, alto contraste, botão de copiar e indicador de validade (24h).
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { colors, radius, spacing } from "../theme";
import type { AuthCodeResponse } from "../api/types";

interface Props {
  data: AuthCodeResponse | null;
  loading: boolean;
  onRefresh: () => void;
  accountLabel?: string;
}

export function AuthCodeCard({ data, loading, onRefresh, accountLabel }: Props) {
  const [copied, setCopied] = useState(false);
  const code = data?.code ?? null;

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Código de autorização de hoje</Text>
        {accountLabel ? <Text style={styles.account}>{accountLabel}</Text> : null}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primaryText} style={{ marginVertical: spacing.lg }} />
      ) : code ? (
        <Pressable onPress={copy} style={styles.codeWrap}>
          <Text style={styles.code} selectable accessibilityLabel={`Código ${code}`}>
            {code}
          </Text>
          <Text style={styles.copyHint}>{copied ? "copiado ✓" : "toque para copiar"}</Text>
        </Pressable>
      ) : (
        <Text style={styles.empty}>
          Ainda não disponível hoje. Puxe para atualizar.
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.validity}>
          {data?.validadeHoras ? `Válido por ~${data.validadeHoras}h` : ""}
        </Text>
        <Pressable onPress={onRefresh} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Forçar atualização</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.codeBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  account: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  codeWrap: { alignItems: "center", paddingVertical: spacing.md },
  code: {
    color: "#FFFFFF",
    fontSize: 52,
    fontWeight: "800",
    letterSpacing: 6,
    fontVariant: ["tabular-nums"],
  },
  copyHint: { color: "rgba(255,255,255,0.75)", marginTop: spacing.xs, fontSize: 13 },
  empty: { color: "rgba(255,255,255,0.9)", paddingVertical: spacing.lg, fontSize: 15 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  validity: { color: "rgba(255,255,255,0.8)", fontSize: 13 },
  refreshBtn: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  refreshText: { color: "#FFFFFF", fontWeight: "600", fontSize: 13 },
});
