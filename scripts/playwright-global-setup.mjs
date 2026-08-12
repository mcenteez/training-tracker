import cleanupPlaywrightData from "./cleanup-playwright.mjs";

export default async function globalSetup() {
  await cleanupPlaywrightData();
}
