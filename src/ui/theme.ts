import { useColorScheme } from "react-native";

/**
 * Series colours match the extension's palette slots (`--s1`..`--s4`), so power is
 * the same blue in the browser and on the phone. Core's plan assigns the slot.
 */
const SERIES = { "--s1": "#3987e5", "--s2": "#d95926", "--s3": "#199e70", "--s4": "#d68cb5" } as const;

const LIGHT = { bg: "#ffffff", surface: "#f4f5f7", text: "#16181d", muted: "#5d6470", grid: "#e2e5ea", accent: "#3987e5", danger: "#c0392b" };
const DARK = { bg: "#0f1115", surface: "#1a1d23", text: "#eceef2", muted: "#9aa1ad", grid: "#2a2e36", accent: "#5a9ff0", danger: "#ef6f5e" };

export type Palette = typeof LIGHT & { series: typeof SERIES };

export function usePalette(): Palette {
  return { ...(useColorScheme() === "dark" ? DARK : LIGHT), series: SERIES };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDate(date: Date): string {
  return date.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function modeLabel(mode: string): string {
  return mode === "unknown" ? "Ride" : mode.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
