import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { buildPanel, elapsedScale, planWorkout, workoutExport, type Workout } from "matrix-workouts-core";
import { mapWorkout, SHARE_TYPES } from "../map/workout";
import { HealthWrite } from "../native/healthWrite";
import { Panel } from "./Panel";
import { loadRide, SessionExpired, storedCredentials } from "./session";
import { formatDate, formatDuration, formatKm, modeLabel, usePalette } from "./theme";

/**
 * The confirm screen. The rider sees the ride, decides about energy, and presses the
 * one button that writes. There is no dedupe: the rider is the dedupe.
 */
export default function RideScreen() {
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  // undefined while loading, null when there is no such ride to show.
  const [workout, setWorkout] = useState<Workout | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [includeEnergy, setIncludeEnergy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadRide(id)
      .then(async (w) => {
        if (!live) return;
        // Signed out is not "no such ride": a deep link opened cold belongs at sign-in.
        if (!w && !(await storedCredentials())) return router.replace("/");
        setWorkout(w);
      })
      .catch((e) => {
        if (!live) return;
        if (e instanceof SessionExpired) return router.replace({ pathname: "/", params: { expired: "1" } });
        setLoadError(e instanceof Error ? e.message : "Could not load this ride.");
      });
    return () => {
      live = false;
    };
  }, [id]);

  const panels = useMemo(() => {
    if (!workout) return [];
    const plan = planWorkout(workout);
    const x = elapsedScale(plan.elapsedSeconds);
    return plan.panels.map((spec) => buildPanel(spec, x, plan.elapsedSeconds));
  }, [workout]);

  if (workout === undefined && !loadError) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!workout) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <Text style={{ color: loadError ? palette.danger : palette.muted }}>
          {loadError ?? "There is no bike ride with this id on your account."}
        </Text>
      </View>
    );
  }

  async function write() {
    if (!workout) return;
    setBusy(true);
    setError(null);
    try {
      if (!HealthWrite.isAvailable()) throw new Error("Apple Health is not available on this device.");
      await HealthWrite.requestAuthorization(SHARE_TYPES);
      const status = HealthWrite.authorizationStatus(SHARE_TYPES);
      if (status["workout"] !== "authorized") {
        throw new Error("Health access not granted. Allow workouts in Settings › Health › Data Access & Devices.");
      }
      const payload = mapWorkout(workoutExport(workout), { includeActiveEnergy: includeEnergy });
      // Share status is knowable (unlike read), so a type the rider switched off is
      // left out and named, rather than failing the whole write.
      const written = payload.series.filter((s) => status[s.type] === "authorized");
      const skipped = payload.series.filter((s) => status[s.type] !== "authorized").map((s) => s.type);
      await HealthWrite.writeWorkout({ ...payload, series: written });
      router.replace({
        pathname: "/exported",
        params: { written: written.map((s) => s.type).join(","), skipped: skipped.join(",") },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write to Health.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: palette.bg }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: modeLabel(workout.mode) }} />
      <Text style={[styles.date, { color: palette.text }]}>{formatDate(workout.startedAt)}</Text>
      <Text style={[styles.meta, { color: palette.muted }]}>
        {formatDuration(workout.durationSeconds)} · {formatKm(workout.distanceMeters)}
        {workout.calories ? ` · ${workout.calories} kcal` : ""}
      </Text>

      <View style={styles.panels}>
        {panels.map((p) => (
          <Panel key={p.spec.key} panel={p} />
        ))}
      </View>

      <View style={[styles.toggle, { backgroundColor: palette.surface }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleTitle, { color: palette.text }]}>Write active energy</Text>
          <Text style={[styles.toggleBody, { color: palette.muted }]}>
            Turn off if your Apple Watch also recorded this ride — both would count on the Move ring.
          </Text>
        </View>
        <Switch value={includeEnergy} onValueChange={setIncludeEnergy} />
      </View>

      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}

      <Pressable
        onPress={write}
        disabled={busy}
        style={({ pressed }) => [styles.button, { backgroundColor: palette.accent, opacity: busy || pressed ? 0.6 : 1 }]}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Write to Apple Health</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { padding: 16, paddingBottom: 48 },
  date: { fontSize: 20, fontWeight: "600" },
  meta: { fontSize: 15, marginTop: 4, fontVariant: ["tabular-nums"] },
  panels: { marginTop: 20 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, marginTop: 8 },
  toggleTitle: { fontSize: 16, fontWeight: "500" },
  toggleBody: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  error: { marginTop: 16, fontSize: 15 },
  button: { borderRadius: 10, padding: 16, alignItems: "center", marginTop: 20 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
