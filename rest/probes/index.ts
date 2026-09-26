// Probe registry: app id (config/apps.mjs) → its probes. An app with no entry has no door of its own
// (ChatWise, third-party apps): it still gets the site probe, and its checks are browser + REST oracle.
import type { RestProbe } from "../probe";
import { siteProbes } from "./site";
import { probes as lzPpm } from "./lz-ppm";
import { probes as cognirunner } from "./cognirunner";
import { probes as sentinel } from "./sentinel-vault";
import { probes as altomata } from "./altomata";
import { probes as licenseLeash } from "./license-leash";

const APP_PROBES: Record<string, RestProbe[]> = {
  "lz-ppm": lzPpm,
  cognirunner,
  "sentinel-vault": sentinel,
  altomata,
  "license-leash": licenseLeash,
};

export function probesFor(app: string): RestProbe[] {
  return [...siteProbes, ...(APP_PROBES[app] ?? [])];
}
