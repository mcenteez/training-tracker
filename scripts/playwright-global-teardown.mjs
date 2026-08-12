import cleanupPlaywrightData from "./cleanup-playwright.mjs";

export default async function globalTeardown() {
  await cleanupPlaywrightData();
}
