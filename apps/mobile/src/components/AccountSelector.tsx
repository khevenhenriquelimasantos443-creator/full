/** Seletor de conta ativa (Multi-Conta §4.3) — chips horizontais. */

import React from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { colors, radius, spacing } from "../theme";
import type { Account } from "../api/types";

export function AccountSelector({
  accounts,
  activeId,
  onSelect,
}: {
  accounts: Account[];
  activeId: string | null;
  onSelect: (account: Account) => void;
}) {
  if (accounts.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {accounts.map((a) => {
        const active = a.id === activeId;
        return (
          <Pressable
            key={a.id}
            onPress={() => onSelect(a)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {a.nickname ?? a.mlUserId}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.primaryText },
});
