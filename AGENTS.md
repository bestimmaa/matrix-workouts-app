# AGENTS.md — matrix-workouts-app

An iOS app that takes a ride off the Matrix platform and writes it into **Apple
Health**, with its per-10-second series intact.

README.md makes the case to a person arriving cold. This file is for whoever has to
work on the thing.

The argument is one sentence: **the console recorded power, cadence and speed every
ten seconds, and there is no path from that record into Health that does not go
through a native app.** HealthKit has no web surface — no JS API, no URL scheme, no
WKWebView bridge, and App Clips cannot request HealthKit authorization at all. The
Chrome extension can draw the ride and can write a JSON file. It cannot put a
`HKWorkout` in Health. That gap is why this repo exists.

**The record shape is not here.** Parsing, the upstream API, program modes,
heart-rate filtering and the export document belong to
[`matrix-workouts-core`](https://github.com/bestimmaa/matrix-workouts-core), which
this app depends on like the other two consumers do. This file covers the app: the
HealthKit write, the mapping decisions, and what the app deliberately does not do.

---

## What belongs in this file

Four documents, one job each. Putting something in the wrong one is how it rots.

| File | Holds |
|---|---|
| `README.md` | what this is, why, and how to run it. For someone arriving cold. |
| `AGENTS.md` | how to work on it — decisions, rules, and gotchas that already cost a bug. |
| `CHANGELOG.md` | what changed, per released version. |
| [core's `AGENTS.md`](https://github.com/bestimmaa/matrix-workouts-core) | the record, the API, the parse layer. Another repo owns it. |

**Write it here if it is** a decision and the reason behind it; a rule stated with the
failure it prevents; a gotcha someone already hit; a dated measurement backing a
claim; or a boundary — what this app is not for.

**Do not write it here if it is** something the code already says; the upstream wire
shape or how to parse it (→ core); onboarding (→ README.md); a log of what happened
when (→ git); or a number that will quietly go stale.

**Say it once.** A fact in two files is one fact and one future lie. Cross-link
instead — and when the two disagree, the file that owns the subject wins.

---

## Required commands

Run these before committing. **`npm test` must pass.**

```
npm test            # vitest run — the mapper, against core's fixtures
npm run typecheck   # tsc --noEmit
```

The build and device commands land when the project is scaffolded; do not invent
them here before they exist. Note that the native module means **Expo Go will not
run this app** — it needs a dev build (`expo prebuild` + a local run), and the
HealthKit entitlement plus `NSHealthUpdateUsageDescription` are wired through a
config plugin so `prebuild` does not blow them away.

---

## Status

**Not built.** This file is the spec that precedes it. Everything below is a decision
already taken, not a menu.

---

## Scope, and the walls around it

- **Apple Health only.** Health Connect on Android is wanted eventually and is the
  reason for the React Native choice below — but nothing in this repo may be shaped
  *around* it before it is real. See "the shared abstraction already exists".
- **Indoor bikes only**, inheriting core's `isSupportedMachine`. A treadmill or
  rower ride is not offered for export. The suite's existing scope wall; this repo
  does not move it.
- **Sprint 8 is a regular ride.** `programType`, `mode` and the `sprint8` block do
  not reach HealthKit at all. There is no HealthKit type for a sweat score, the
  console's points mean nothing outside the console, and a mode-specific write path
  would be a second code path earning nothing.
- **Export is an explicit, per-ride user action.** The rider picks a ride and
  confirms. There is no sync, no background job, no queue, no local ledger.
- **No deduplication.** It follows from the line above: the rider is the dedupe. The
  app does not query Health to find out what is already there.

## Consequences of "no dedupe" worth knowing

**The app needs write authorization only** — `requestAuthorization(toShare:read:)`
with an empty read set. Two things fall out of that, and both are the reason not to
add a read permission casually later:

- **Authorization state becomes knowable.** HealthKit deliberately makes *read*
  denial indistinguishable from "there is no data" — an app cannot tell whether the
  user said no. Share permissions carry no such fog: `authorizationStatus(for:)`
  returns a real answer, so the UI can say "Health access not granted" honestly
  instead of guessing.
- **No `NSHealthShareUsageDescription`, and a smaller privacy story.**

The one visible cost is **`activeEnergyBurned` landing twice on the Move ring** when
the Apple Watch also recorded the ride. The rider is choosing rides by hand and knows
which those are, so this is a toggle on the confirm screen, not a setting buried in
preferences.

**Stamp `HKMetadataKeyExternalUUID` with the workout id anyway.** It is not dedupe
and does not pretend to be — HealthKit does not enforce uniqueness on it. It costs
one line, and it is the only thing that makes a future "which rides have I already
exported?" answerable without having kept a ledger nobody wrote.

---

## Architecture

```
matrix-workouts-core    the record: parse, api, export. An npm dependency.
src/
  map/      WorkoutExport -> a resolved HealthKit payload. No native, no React.
  ui/       React Native screens
  native/   the JS side of the bridge, and nothing else
modules/
  health-write/ios/     the Swift. An Expo local module, so it is source, not
                        generated, and it is tracked.
```

The generated app project (`ios/`, from `expo prebuild`) is a separate thing from
the module above, and **whether it is committed or regenerated is an open decision** —
left to whoever scaffolds this. `.gitignore` deliberately does not ignore it yet,
because ignoring a directory that might hold hand-written Swift is how that Swift
disappears quietly.

**React Native, and the reason is specific.** Core is TypeScript with
`dependencies: {}`, no DOM, no `node:`, and — deliberately — no `fetch`: networking
enters through an injected `FetchLike`, a three-member structural type that React
Native's global `fetch` satisfies unchanged. So core runs in Hermes verbatim, and
`loginWithXid` → `fetchHistory` → parse → `WorkoutExport` works with no port. Swift,
Kotlin Multiplatform and Flutter all mean reimplementing a parser that is currently
pinned by a fixture corpus and a contract test. That is the entire argument; it is
not a general preference for cross-platform tooling.

**The bridge stays dumb.** `map/` resolves everything — activity type, unit
conversion, sample windows, zero-suppression, the energy split — and hands the native
module a finished payload. Swift calls `beginCollection(at:)` → `addSamples` →
`endCollection(at:)` → `finishWorkout()` and makes no decisions. This keeps the part
worth testing in the language that already has the fixtures, and it is what makes a
Health Connect module a second consumer of `map/` rather than a second
implementation of it.

**The shared abstraction already exists and it is `WorkoutExport`.** Do not invent an
intermediate format for the Android case. HealthKit nests samples under a workout
while Health Connect stores `ExerciseSessionRecord` as a *sibling* of independent
`PowerRecord` / `SpeedRecord` / `HeartRateRecord` rows correlated only by time — but
"a session window plus N labelled series" maps down to both, and that is what core's
export document is.

**Charts come from core, and are not written here.** The chart geometry was never
DOM code — it emits path `d` strings, tick positions and scales, and its layer rule
has always been `mayUse: []`. It was promoted out of the extension into
`matrix-workouts-core` for this app, so both renderers draw the same panels from the
same source: the extension through the DOM, this app through `react-native-svg`. A
`d` string is a `d` string in either. **Do not add chart maths to this repo** — if a
panel needs something the geometry cannot express, it goes in core, where a test can
run it against every fixture with no renderer at all.

---

## The stack

| Need | Choice |
|---|---|
| Runtime | Expo, **dev build** — Expo Go cannot load the native module |
| Navigation | `expo-router` |
| Charts | `react-native-svg`, rendering core's geometry |
| Token storage | `expo-secure-store` (Keychain) |
| Native | Expo Modules API, a local Swift module |
| Tests | `vitest`, matching all three siblings |
| State / data fetching | **nothing** |

**No state library and no query library, deliberately.** The app makes one network
request and has four screens. Reach for either only when there is a second thing to
coordinate; today there is not.

**`fixtures/` is a copy, and that is the house convention, not a shortcut.** Core does
not publish its fixtures — its `files` field is `dist` plus four markdown files — and
chrome and mcp each keep their own copy (mcp only a three-fixture subset). Copy the
ones the mapper needs and leave core's `files` alone.

**Minimum deployment target is iOS 17**, because `cyclingPower`, `cyclingCadence` and
`cyclingSpeed` are iOS 17+ and they are three of the six things this app exists to
write. The alternative — gating them behind `#available` and degrading — buys support
for hardware nobody here is running, at the price of a branch that would never be
exercised and would therefore never be known to work.

## The write

`HKWorkoutConfiguration(activityType: .cycling, locationType: .indoor)`, plus
`HKMetadataKeyIndoorWorkout: true`. An `HKDevice` naming the console
(`manufacturer: "Matrix Fitness"`, `model:` the machine type, `localIdentifier:` the
machine id) costs nothing and makes these writes filterable later.

| Core field | HealthKit type | Unit | Style |
|---|---|---|---|
| Δ`cumulativeDistanceMeters` | `distanceCycling` | m | cumulative — ranged, no gaps |
| `powerWatts` | `cyclingPower` | W | discrete — ranged over the sample |
| `cadenceRpm` | `cyclingCadence` | count/min | discrete |
| `speedKmh` ÷ 3.6 | `cyclingSpeed` | m/s | discrete |
| `heartRateBpm` | `heartRate` | count/min | discrete, gated on `heartRateValid` |
| `calories` | `activeEnergyBurned` | kcal | cumulative — split by power share |

The three cycling types are iOS 17+. `resistanceLevel` has no HealthKit type and does
not travel; neither does anything in `derived`.

**Energy is split proportionally to `powerWatts × duration`, not spread flat.** Core
carries calories only at workout level. A single workout-spanning sample is defensible
but makes the Move ring a featureless block across an hour; a power-weighted split
keeps the total honest and the shape plausible. It is an approximation and the code
should say so where it happens — mechanical work is not metabolic energy.

## Rules the write has to follow

**The facts underneath the first three of these belong to core** — they are
properties of the record, and core's AGENTS.md "Data-quality gotchas" owns them with
the measurements. What is here is only what they mean for a HealthKit write.

**Build the distance series from `cumulativeDistanceMeters` deltas, never by summing
`distanceMeters`.** Per-sample distance is quantized to 0.01 mile and always sums
short. This is the single most expensive mistake available in this repo, because
`HKWorkoutBuilder` derives a workout's total distance from the samples you hand it —
so the naive version does not produce a visibly broken ride, it produces a slightly
and permanently wrong one, on every export. Expect the total to still land a little
under the platform's own figure; carry that residual rather than scaling the series
to close it.

**Use each sample's own `duration` for its window, and never `index * 10`.** The
final sample is a partial, and it is *not* reliably zero — 0, 1, 2, 3, 5, 6, 7, 8, 10
and 11 seconds have all been observed. Two consequences for the write: a zero-width
sample cannot express a cumulative quantity, so **exclude a zero-duration final
sample from `distanceCycling` and `activeEnergyBurned`** while still using it as an
instant reading for the discrete series; and a non-zero partial is a real interval
that must not be rounded up to ten.

**Never map `totalSteps`, and never map `inclinePercent`.** Steps are nonzero on
every bike fixture — 1991 on a twenty-minute ride — because the field is a crank
counter, not walking steps; writing it to `stepCount` would corrupt the rider's real
step history, which Health does not make easy to undo. Incline is `0` on a bike, and
a flat zero series is worse than no series.

**Zero means missing, and there are two rules for it.** Core's samples are dense
structs, so an absent channel reads as `0` rather than null.

- *Whole-series suppression* — if a channel is zero across the entire workout, do not
  write that type at all. Fixture `raw-6a998daf` has no heart rate across all 362
  samples; 362 zero-bpm samples in Health is worse than silence.
- *Per-sample dropout* — inside a channel that mostly has data, a zero is a dropout:
  drop the sample, keep the series. Not an edge case, and sometimes most of the ride
   — core measures rejection rates up to 231 of 376 samples on a strap that died
  mid-session. Use core's `heartRateValid` rather than inventing a second threshold.

**The activity-type mapper must not throw.** Fixture `raw-6a998daf` has
`machineType: undefined`. `.cycling` is the right fallback given the corpus and the
scope wall above.

---

## Auth

`loginWithXid({ xid, pin }, fetch)` — core's doc says it plainly: *"This exists for
the standalone client, which has no browser to borrow a session from."* It was
written for this app before this app existed. The xId is the member number on the gym
tag; the pin is the numeric passcode.

**The passcode is used for one request and is never stored.** `loginWithXid` returns
`Credentials` — `{ exerciserId, token }` — and nothing else, deliberately: the login
response is a full profile with name, email, birthday, height and weight, and none of
it is carried out where a caller could log it by accident. Do not widen that return
type.

The token goes in the **Keychain** (`expo-secure-store`), never `AsyncStorage`, which
is unencrypted plaintext on disk.

---

## Boundaries

- **Not a recorder.** Recording is NowhereFast's job, on the Watch. This app never
  starts a workout session, never reads live sensors, and has no Watch target.
- **Not a viewer for Health.** It writes. It does not read Health, and adding a read
  permission would cost the authorization clarity described above — so it needs an
  argument, not a convenience.
- **Not a history browser** yet. The ride list exists to pick a ride to export. If
  cross-ride views arrive, the power curve and volume code already exist in the MCP
  server and should be promoted into core rather than written a third time.
- **Health data stays local**, as everywhere else in this suite. No telemetry, no
  analytics, no request to any host but `jfit.co`.
