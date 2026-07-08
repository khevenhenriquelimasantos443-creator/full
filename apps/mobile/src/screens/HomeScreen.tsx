/**
 * Home: card do código de autorização fixado no topo (§4.2), seletor de conta
 * e lista dos envios Full do dia (§4.1). Pull-to-refresh puxa tudo de novo.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useApp } from "../store/AppContext";
import { AuthCodeCard } from "../components/AuthCodeCard";
import { ShipmentCard } from "../components/ShipmentCard";
import { AccountSelector } from "../components/AccountSelector";
import { BetaNotice } from "../components/BetaBadge";
import { colors, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import type { AuthCodeResponse, ShipmentSummary } from "../api/types";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { api, accounts, activeAccount, setActiveAccount } = useApp();
  const [shipments, setShipments] = useState<ShipmentSummary[]>([]);
  const [authCode, setAuthCode] = useState<AuthCodeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountId = activeAccount?.id ?? null;

  const load = useCallback(
    async (opts: { force?: boolean } = {}) => {
      if (!accountId) return;
      setError(null);
      try {
        if (opts.force) {
          await api.refresh(accountId);
        }
        const [ship, code] = await Promise.all([
          api.shipmentsOfDay(accountId),
          api.authCode(accountId, { refresh: opts.force }),
        ]);
        setShipments(ship.shipments);
        setAuthCode(code);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [api, accountId],
  );

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ force: true });
    setRefreshing(false);
  }, [load]);

  const forceAuthCode = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const code = await api.authCode(accountId, { refresh: true });
      setAuthCode(code);
    } finally {
      setLoading(false);
    }
  }, [api, accountId]);

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.date}>{new Date().toLocaleDateString("pt-BR")}</Text>
        <Pressable onPress={() => navigation.navigate("Settings")}>
          <Text style={styles.settings}>Ajustes</Text>
        </Pressable>
      </View>

      <AccountSelector
        accounts={accounts}
        activeId={accountId}
        onSelect={setActiveAccount}
      />

      <FlatList
        data={shipments}
        keyExtractor={(s) => String(s.inboundId)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
        ListHeaderComponent={
          <>
            <AuthCodeCard
              data={authCode}
              loading={loading}
              onRefresh={forceAuthCode}
              accountLabel={activeAccount?.nickname ?? undefined}
            />
            {authCode?.aviso ? <BetaNotice text={authCode.aviso} /> : null}
            <Text style={styles.sectionTitle}>
              Envios de hoje {shipments.length ? `(${shipments.length})` : ""}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        }
        renderItem={({ item }) => (
          <ShipmentCard
            shipment={item}
            onPress={() =>
              navigation.navigate("ShipmentDetail", {
                shipment: item,
                accountId: accountId!,
              })
            }
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>Nenhum envio Full para hoje.</Text>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  date: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  settings: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  error: { color: colors.danger, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
});
