/** Selo/aviso de dado não-oficial do Módulo Beta (§4.2). */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";

export function BetaBadge({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.badge, compact && styles.compact]}>
      <Text style={styles.text}>BETA · não-oficial</Text>
    </View>
  );
}

export function BetaNotice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>⚠️ {text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.warning,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  compact: { paddingVertical: 1 },
  text: { color: "#1A1206", fontSize: 11, fontWeight: "700" },
  notice: {
    backgroundColor: colors.surfaceAlt,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.sm,
  },
  noticeText: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
