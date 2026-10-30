import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The raw records in `fixtures/`, for the tests. The directory is a copy of core's
 * — AGENTS.md "The stack" has the convention — and every test runs over all of it.
 */
const FIXTURES = join(__dirname, "../../fixtures");

export const fixtureFiles = readdirSync(FIXTURES).filter((f) => f.startsWith("raw-") && f.endsWith(".json"));

export function fixtureRecord(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, file), "utf8")) as Record<string, unknown>;
}
