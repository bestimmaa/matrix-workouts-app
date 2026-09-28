import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, Stack } from "expo-router";
import type { HistoryResult } from "matrix-workouts-core";
import { loadRides, SessionExpired, signOut, storedCredentials } from "./session";
import { formatDate, formatDuration, formatKm, modeLabel, usePalette } from "./theme";

/** The list exists to pick a ride to export. It is not a history browser. */
export default function RidesScreen() {
  const palette = usePalette();
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    const credentials = await storedCredentials();
    if (!credentials) return router.replace("/");
    try {
      setError(null);
      setResult(await loadRides(credentials, refresh));
    } catch (e) {
      if (e instanceof SessionExpired) return router.replace({ pathname: "/", params: { expired: "1" } });
      setError(e instanceof Error ? e.message : "Could not load rides.");
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  async function leave() {
    await signOut();
    router.replace("/");
  }

  const header = (
    <Stack.Screen
      options={{
        title: "Rides",
        headerRight: () => (
          <Pressable onPress={leave} hitSlop={8}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>Sign out</Text>
          </Pressable>
        ),
      }}
    />
  );

  if (!result && !error) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        {header}
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {header}
      <FlatList
        data={result?.workouts ?? []}
        keyExtractor={(w) => w.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          error ? (
            <Text style={[styles.banner, { color: palette.danger }]}>{error}</Text>
          ) : result?.truncated ? (
            <Text style={[styles.banner, { color: palette.muted }]}>
              The API says there are more rides than it sent. Older ones may be missing.
            </Text>
          ) : null
        }
        ListEmptyComponent={error ? null : <Text style={[styles.banner, { color: palette.muted }]}>No bike rides on this account.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/ride/[id]", params: { id: item.id } })}
            style={({ pressed }) => [styles.row, { borderColor: palette.grid, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.date, { color: palette.text }]}>{formatDate(item.startedAt)}</Text>
            <Text style={[styles.meta, { color: palette.muted }]}>
              {modeLabel(item.mode)} · {formatDuration(item.durationSeconds)} · {formatKm(item.distanceMeters)}
              {item.calories ? ` · ${item.calories} kcal` : ""}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { padding: 16, fontSize: 15 },
  row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  date: { fontSize: 17, fontWeight: "500" },
  meta: { fontSize: 14, marginTop: 2, fontVariant: ["tabular-nums"] },
});
