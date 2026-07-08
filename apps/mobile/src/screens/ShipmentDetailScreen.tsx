/**
 * Detalhe do envio (§4.1): dados do card + documentos + fallback oficial.
 * A NF-e vem da API oficial (embeddedInvoice); quando o mapeamento envio→pedido
 * não estiver disponível (pendência §1.3), oferecemos abrir a página oficial.
 */

import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, radius, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ShipmentDetail">;

const ML_DETAIL = (id: number) =>
  `https://myaccount.mercadolivre.com.br/shipping/inbounds/${id}/details`;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export function ShipmentDetailScreen({ route }: Props) {
  const { shipment } = route.params;

  const time = shipment.scheduledDate
    ? new Date(shipment.scheduledDate).toLocaleString("pt-BR")
    : "—";

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.title}>
        {shipment.description ?? `Envio ${shipment.inboundId}`}
      </Text>

      <View style={styles.card}>
        <Field label="ID do envio" value={String(shipment.inboundId)} />
        <Field label="Status" value={shipment.status ?? "—"} />
        <Field label="Volumes" value={shipment.volumes != null ? String(shipment.volumes) : "—"} />
        <Field label="Coleta agendada" value={time} />
      </View>

      <Text style={styles.section}>Documentos</Text>
      <View style={styles.card}>
        <Text style={styles.docText}>
          Nota Fiscal (NF-e) e Autorização de Entrada saem da plataforma. Use o
          botão abaixo para abrir a página oficial do envio, onde é possível
          baixar e compartilhar os documentos.
        </Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => Linking.openURL(ML_DETAIL(shipment.inboundId))}
        >
          <Text style={styles.primaryBtnText}>Abrir no Mercado Livre</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  field: { marginBottom: spacing.md },
  fieldLabel: { color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { color: colors.text, fontSize: 16, marginTop: 2 },
  section: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: spacing.md },
  docText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: spacing.lg },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.primaryText, fontWeight: "700", fontSize: 15 },
});
