/** Card de envio Full na lista do dia (§4.1). */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";
import type { ShipmentSummary } from "../api/types";

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmado",
  scheduled: "Agendado",
  pending: "Aguardando",
  in_transit: "Em coleta",
  delivered: "Coletado",
  cancelled: "Cancelado",
};

function statusLabel(status: string | null): string {
  if (!status) return "—";
  return STATUS_LABEL[status] ?? status;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ShipmentCard({
  shipment,
  onPress,
}: {
  shipment: ShipmentSummary;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>
          {shipment.description ?? `Envio ${shipment.inboundId}`}
        </Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{statusLabel(shipment.status)}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>ID {shipment.inboundId}</Text>
        {shipment.volumes != null ? (
          <Text style={styles.meta}>· {shipment.volumes} volumes</Text>
        ) : null}
        {shipment.scheduledDate ? (
          <Text style={styles.meta}>· {formatTime(shipment.scheduledDate)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "700", flex: 1, marginRight: spacing.sm },
  statusPill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  metaRow: { flexDirection: "row", marginTop: spacing.sm, flexWrap: "wrap" },
  meta: { color: colors.textMuted, fontSize: 13, marginRight: spacing.xs },
});
