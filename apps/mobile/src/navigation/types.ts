import type { ShipmentSummary } from "../api/types";

export type RootStackParamList = {
  Home: undefined;
  ShipmentDetail: { shipment: ShipmentSummary; accountId: string };
  Settings: undefined;
};
