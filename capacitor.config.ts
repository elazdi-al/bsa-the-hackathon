import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ch.swissquote.wallet",
  appName: "Swissquote Wallet",
  webDir: "out",
  // Capacitor answers any path without an extension with index.html, the screen list, so start at the file.
  server: { appStartPath: "onboarding-welcome.html" },
};

export default config;
