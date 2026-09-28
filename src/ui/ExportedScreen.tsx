import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { usePalette } from "./theme";

const NAMES: Record<string, string> = {
  HKQuantityTypeIdentifierDistanceCycling: "Distance",
  HKQuantityTypeIdentifierCyclingPower: "Power",
  HKQuantityTypeIdentifierCyclingCadence: "Cadence",
  HKQuantityTypeIdentifierCyclingSpeed: "Speed",
  HKQuantityTypeIdentifierHeartRate: "Heart rate",
  HKQuantityTypeIdentifierActiveEnergyBurned: "Active energy",
};

const names = (list?: string) => (list ? list.split(",").filter(Boolean).map((t) => NAMES[t] ?? t) : []);

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
        onPress={() => router.replace("/rides")}
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
