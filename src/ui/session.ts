import * as SecureStore from "expo-secure-store";
import {
  ApiError,
  fetchWorkoutHistory,
  isSupportedMachine,
  loginWithXid,
  type Credentials,
  type HistoryResult,
  type Workout,
} from "matrix-workouts-core";

/**
 * Sign-in and the one network request, with no state library behind them — there is
 * one request and four screens, and a module variable is enough to hand a ride from
 * the list to the confirm screen.
 *
 * The token lives in the Keychain (expo-secure-store), never AsyncStorage, which is
 * plaintext on disk. The passcode is passed straight to `loginWithXid` and dropped.
 */

const KEY = "matrix-credentials";

/** RN's global fetch satisfies core's three-member FetchLike unchanged. */
const fetchImpl = (url: string, init: { headers: Record<string, string>; method?: string; body?: string }) =>
  fetch(url, init);

export async function signIn(xid: string, pin: string): Promise<void> {
  const credentials = await loginWithXid({ xid, pin }, fetchImpl);
  await SecureStore.setItemAsync(KEY, JSON.stringify(credentials));
}

export async function storedCredentials(): Promise<Credentials | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    return parsed.exerciserId && parsed.token ? { exerciserId: parsed.exerciserId, token: parsed.token } : null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  history = null;
  await SecureStore.deleteItemAsync(KEY);
}

/**
 * The stored token was refused. The keychain entry is already gone by the time this
 * is thrown, so the only move left is back to sign-in. Core's own message for a 401
 * talks about reloading the site — true for the extension, meaningless here.
 */
export class SessionExpired extends Error {
  name = "SessionExpired";
  constructor() {
    super("Your sign-in has expired. Sign in again.");
  }
}

let history: HistoryResult | null = null;

/** Indoor bikes only — core's scope wall. Newest first, as core returns them. */
export async function loadRides(credentials: Credentials, refresh = false): Promise<HistoryResult> {
  if (!history || refresh) {
    try {
      history = await fetchWorkoutHistory(credentials, fetchImpl);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        await signOut();
        throw new SessionExpired();
      }
      throw e;
    }
  }
  return { ...history, workouts: history.workouts.filter((w) => isSupportedMachine(w.machineType)) };
}

function rideById(id: string): Workout | null {
  return history?.workouts.find((w) => w.id === id) ?? null;
}

/**
 * A ride for the confirm screen, fetching the history first if this is a cold start
 * — a deep link, or the app relaunched on that screen — rather than showing nothing.
 * Null when signed out, or when the account has no such bike ride.
 */
export async function loadRide(id: string): Promise<Workout | null> {
  const loaded = rideById(id);
  if (loaded) return isSupportedMachine(loaded.machineType) ? loaded : null;
  const credentials = await storedCredentials();
  if (!credentials) return null;
  const { workouts } = await loadRides(credentials);
  return workouts.find((w) => w.id === id) ?? null;
}
