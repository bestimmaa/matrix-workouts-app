# matrix-workouts-app

[![CI](https://github.com/bestimmaa/matrix-workouts-app/actions/workflows/ci.yml/badge.svg)](https://github.com/bestimmaa/matrix-workouts-app/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An iOS app that takes a ride off a Matrix / Johnson Fitness indoor bike and writes it
into **Apple Health**, with its per-10-second series intact.

The console records **power, cadence, speed, distance and heart rate every ten
seconds**. The site at `matrixworkouts.jfit.co` shows six averages and nothing else,
and there is no route from that record into Health that does not go through a native
app: HealthKit has no web API, no URL scheme and no WebView bridge. This is that app.

Sign in with the xId on your gym tag, pick a ride, check its charts, and write it. It
lands in Health as an indoor cycling workout carrying:

| From the console | In Health |
|---|---|
| power | Cycling Power |
| cadence | Cycling Cadence |
| speed | Cycling Speed |
| running distance | Cycling Distance |
| heart rate, with strap dropouts removed | Heart Rate |
| calories, spread across the ride by power | Active Energy (optional) |

Turn active energy off for a ride your Apple Watch also recorded, or the Move ring
counts it twice.

**One ride at a time, on purpose.** There is no background sync and no duplicate
check. You choose each ride, and writing the same one twice gives you two workouts.

## Requirements

- iOS 17 or later: Health's cycling power, cadence and speed types start there.
- A development build. Expo Go cannot load the native HealthKit module.
- To build it: Node 20+, Xcode, and CocoaPods.

## Run it

```bash
npm install
npm run ios        # prebuild, build the dev client, install on the Simulator, start Metro
```

HealthKit works in the Simulator. For a device, `npx expo run:ios --device`, with a
signing team that has the HealthKit capability.

## Develop

```bash
npm test           # the HealthKit mapper, against every fixture ride
npm run typecheck
```

[AGENTS.md](AGENTS.md) holds the decisions and the rules the write follows. Read it
before changing anything in `src/map/`.

## Privacy

Your passcode is sent once, to `jfit.co`, and never stored. The sign-in token is kept
in the iOS Keychain. The app only writes to Health and never reads from it. It makes
no requests to any host except `jfit.co`, and has no analytics.

## Part of matrix-workouts

One of four repos over a shared parser,
[matrix-workouts-core](https://github.com/bestimmaa/matrix-workouts-core). The others
are the [Chrome extension](https://github.com/bestimmaa/matrix-workouts-chrome) and
the [MCP server](https://github.com/bestimmaa/matrix-workouts-mcp).

MIT licensed. Not affiliated with Matrix Fitness or Johnson Health Tech.
