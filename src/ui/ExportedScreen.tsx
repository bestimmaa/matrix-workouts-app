import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { HK_TYPE, type HealthQuantityType } from "../map/payload";
import { usePalette } from "./theme";

/** What each written type is called on this screen. Keyed by `HK_TYPE`, so it cannot drift from the payload. */
const NAMES: Record<HealthQuantityType, string> = {
  [HK_TYPE.distanceCycling]: "Distance",
  [HK_TYPE.cyclingPower]: "Power",
  [HK_TYPE.cyclingCadence]: "Cadence",
  [HK_TYPE.cyclingSpeed]: "Speed",
  [HK_TYPE.heartRate]: "Heart rate",
  [HK_TYPE.activeEnergyBurned]: "Active energy",
};

const names = (list?: string) =>
  list ? list.split(",").filter(Boolean).map((t) => NAMES[t as HealthQuantityType] ?? t) : [];

export default function ExportedScreen() {
  const palette = usePalette();
  const { written, skipped } = useLocalSearchParams<{ written?: string; skipped?: string }>();
  const skippedNames = names(skipped);
  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>In Apple Health</Text>
      <Text style={[styles.body, { color: palette.muted }]}>
        An indoor cycling workout with {names(written).join(", ").toLowerCase() || "no samples"}.
      </Text>
      {skippedNames.length ? (
        <Text style={[styles.body, { color: palette.danger }]}>
          Not written, because Health access is off for: {skippedNames.join(", ").toLowerCase()}.
        </Text>
      ) : null}
      <Pressable
        // The ride screen was replaced by this one, so the list is still underneath:
        // `replace` would stack a second list on it, with a back button to the first.
        onPress={() => router.dismissTo("/rides")}
        style={({ pressed }) => [styles.button, { backgroundColor: palette.accent, opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={styles.buttonText}>Back to rides</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 12 },
  title: { fontSize: 24, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 22 },
  button: { borderRadius: 10, padding: 16, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
