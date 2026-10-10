// The demo's outage switch: while this file exists, Swissquote's API answers 503 to everything (proxy.ts).
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

export const SUNSET_FILE = "data/sunset";
export const isSunset = () => existsSync(SUNSET_FILE);
export const setSunset = (on: boolean) => { mkdirSync("data", { recursive: true }); on ? writeFileSync(SUNSET_FILE, "") : rmSync(SUNSET_FILE, { force: true }); };
