/**
 * AccessVoice Demo Video Recorder (Browser Extension Version)
 *
 * Records a demo of AccessVoice Chrome Extension performing 3 scenarios:
 * 1. Search for apartments in Seattle on Apartments.com
 * 2. Find a winter jacket on Amazon under $100
 * 3. What's the latest news on CNN?
 *
 * Uses Playwright to launch Chromium with the extension loaded.
 * Two-tab approach: sidepanel tab (recorded) + browsing tab (active target).
 *
 * Output: demo-recording/accessvoice-demo.webm + screenshots + timestamps.json
 *
 * Usage: node record_demo.mjs
 * Requires: Backend running on localhost:8000
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const EXTENSION_PATH = path.resolve("extension");
const OUTPUT_DIR = "demo-recording";
const TIMESTAMPS_FILE = path.join(OUTPUT_DIR, "timestamps.json");

const SCENARIOS = [
  {
    command: "Search for 2 bedroom apartments in Seattle on Apartments.com",
    label: "Apartments.com Search",
  },
  {
    command: "Find a winter jacket on Amazon under $100",
    label: "Amazon Shopping",
  },
  {
    command: "What's the latest news on CNN?",
    label: "CNN News",
  },
];

// Max wait per scenario (3 minutes)
const MAX_SCENARIO_WAIT_MS = 180000;
// Poll interval for transcript changes
const POLL_INTERVAL_MS = 3000;
// Transcript stability threshold before considering done
const STABLE_THRESHOLD_MS = 15000;

const timestamps = [];
let recordingStartTime;

function elapsed() {
  return ((Date.now() - recordingStartTime) / 1000).toFixed(1);
}

function logTimestamp(event, detail = "") {
  const ts = { event, time: parseFloat(elapsed()), detail };
  timestamps.push(ts);
  console.log(`  [${ts.time}s] ${event}${detail ? ": " + detail : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Count transcript entries in the conversation log.
 */
async function getTranscriptCount(page) {
  return page
    .locator('[role="log"][aria-label="Conversation transcript"] [role="article"]')
    .count();
}

/**
 * Wait for AI to finish by watching transcript stability.
 */
async function waitForCompletion(page, initialCount, scenarioLabel) {
  const startWait = Date.now();
  let lastCount = initialCount;
  let lastChangeTime = Date.now();
  let hasResponse = false;

  while (Date.now() - startWait < MAX_SCENARIO_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const currentCount = await getTranscriptCount(page);

    if (currentCount > lastCount) {
      lastCount = currentCount;
      lastChangeTime = Date.now();
      if (currentCount > initialCount + 1) {
        hasResponse = true;
      }

      if (!hasResponse && currentCount > initialCount + 1) {
        logTimestamp("first_response", scenarioLabel);
      }
    }

    if (hasResponse && Date.now() - lastChangeTime >= STABLE_THRESHOLD_MS) {
      logTimestamp("scenario_complete", `${currentCount - initialCount} entries`);
      return true;
    }
  }

  console.log(`  WARNING: ${scenarioLabel} hit max wait (${MAX_SCENARIO_WAIT_MS / 1000}s)`);
  logTimestamp("scenario_timeout", scenarioLabel);
  return false;
}

async function run() {
  // Ensure output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Clean old screenshots (keep videos for now)
  for (const f of fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".png"))) {
    fs.unlinkSync(path.join(OUTPUT_DIR, f));
  }

  console.log("=== AccessVoice Demo Video Recorder (Extension) ===\n");
  console.log(`Extension: ${EXTENSION_PATH}`);
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log(`Stability threshold: ${STABLE_THRESHOLD_MS / 1000}s`);
  console.log(`Max wait per scenario: ${MAX_SCENARIO_WAIT_MS / 1000}s`);
  console.log(`Output: ${OUTPUT_DIR}/\n`);

  // Check backend
  try {
    const res = await fetch("http://localhost:8000/health");
    const health = await res.json();
    console.log(`Backend: OK (${health.active_sessions}/${health.max_sessions} sessions)\n`);
  } catch {
    console.error("FAILED: Backend not reachable at http://localhost:8000");
    process.exit(1);
  }

  // Launch Chromium with extension (headed mode required for extensions)
  const userDataDir = path.join(
    process.env.TEMP || "/tmp",
    `av-demo-record-${Date.now()}`
  );

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--disable-blink-features=AutomationControlled",
    ],
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1280, height: 800 },
    },
  });

  // Wait for service worker
  console.log("[1/7] Waiting for extension service worker...");
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent("serviceworker", { timeout: 15000 }).catch(() => null);
  }
  if (!sw) {
    console.error("FAILED: Extension service worker not detected");
    await context.close();
    process.exit(1);
  }
  const extId = sw.url().split("/")[2];
  console.log(`  Extension loaded (ID: ${extId})`);

  // Open browsing tab FIRST (this will be the "active" tab for chrome.tabs.query)
  const browsingPage = await context.newPage();
  await browsingPage.goto("about:blank");

  // Open sidepanel in another tab
  const sidepanelUrl = `chrome-extension://${extId}/sidepanel/index.html`;
  const sidepanel = context.pages()[0]; // Use the first page (opened by default)
  await sidepanel.goto(sidepanelUrl);

  recordingStartTime = Date.now();

  try {
    // Make browsing tab active (so chrome.tabs.query targets it, not sidepanel)
    await browsingPage.bringToFront();
    // Give sidepanel time to render and connect
    await sleep(2000);
    // Bring sidepanel to front briefly for initial screenshots
    await sidepanel.bringToFront();
    await sleep(3000);

    logTimestamp("page_loaded");

    // Wait for Socket.IO connection
    console.log("[2/7] Waiting for backend connection...");
    try {
      await sidepanel.getByText("Connected to server").waitFor({ timeout: 30000 });
    } catch {
      console.error("FAILED: Could not connect to backend after 30s");
      await sidepanel.screenshot({ path: path.join(OUTPUT_DIR, "error-no-connection.png") });
      return;
    }
    logTimestamp("connected");
    await sleep(2000);

    // Homepage screenshot
    await sidepanel.screenshot({ path: path.join(OUTPUT_DIR, "01-homepage.png") });

    // Start session
    console.log("[3/7] Starting voice session...");
    await sidepanel.getByRole("button", { name: "Start session" }).click();
    logTimestamp("session_start_clicked");
    await sleep(5000);
    await sidepanel.screenshot({ path: path.join(OUTPUT_DIR, "02-session-started.png") });
    logTimestamp("session_ready");
    console.log("  Session started!");

    // NOW make browsing tab active so browse_website targets it
    await browsingPage.bringToFront();
    await sleep(500);

    // Run each scenario
    for (let i = 0; i < SCENARIOS.length; i++) {
      const scenario = SCENARIOS[i];
      const stepNum = i + 4;
      const scenarioNum = i + 1;
      console.log(`\n[${stepNum}/7] Scenario ${scenarioNum}: ${scenario.label}`);

      // Bring sidepanel to front briefly to show typing
      await sidepanel.bringToFront();
      await sleep(500);

      // Get transcript count before command
      const countBefore = await getTranscriptCount(sidepanel);

      // Type the command (using Playwright API — doesn't change Chrome's active tab)
      const textInput = sidepanel.getByRole("textbox", {
        name: "Type a command or question",
      });
      await textInput.fill("");
      await textInput.type(scenario.command, { delay: 40 });
      logTimestamp("typed_command", scenario.command);
      await sleep(500);

      // Screenshot of typed command
      await sidepanel.screenshot({
        path: path.join(
          OUTPUT_DIR,
          `${String(scenarioNum * 2 + 1).padStart(2, "0")}-typed-${scenarioNum}.png`
        ),
      });

      // Send the command
      await sidepanel.getByRole("button", { name: "Send message" }).click();
      logTimestamp("command_sent", scenario.label);
      console.log("  Command sent, waiting for AI response...");

      // IMMEDIATELY switch to browsing tab so browse_website navigates it
      await browsingPage.bringToFront();

      // Wait for AI to fully respond (poll sidepanel transcript from background)
      await waitForCompletion(sidepanel, countBefore, scenario.label);

      // Bring sidepanel back to front to show results
      await sidepanel.bringToFront();
      await sleep(1000);

      // Screenshot of result
      await sidepanel.screenshot({
        path: path.join(
          OUTPUT_DIR,
          `${String(scenarioNum * 2 + 2).padStart(2, "0")}-result-${scenarioNum}.png`
        ),
      });

      // Also screenshot the browsing tab to show the site
      await browsingPage.bringToFront();
      await sleep(500);
      await browsingPage.screenshot({
        path: path.join(
          OUTPUT_DIR,
          `${String(scenarioNum * 2 + 2).padStart(2, "0")}b-browse-${scenarioNum}.png`
        ),
      });
      logTimestamp("screenshot_taken", `result-${scenarioNum}`);
      console.log(`  Scenario ${scenarioNum} complete!`);

      // Pause between scenarios
      if (i < SCENARIOS.length - 1) {
        // Show sidepanel for the pause
        await sidepanel.bringToFront();
        console.log("  Pausing before next scenario...");
        await sleep(5000);
        // Switch back to browsing tab for next scenario's navigation
        await browsingPage.bringToFront();
      }
    }

    // Final state
    console.log("\n[7/7] Capturing final state...");
    await sidepanel.bringToFront();
    await sleep(3000);
    await sidepanel.screenshot({ path: path.join(OUTPUT_DIR, "99-final.png") });
    logTimestamp("recording_done");
  } catch (error) {
    console.error(`Error during recording: ${error.message}`);
    logTimestamp("error", error.message);
    await sidepanel.screenshot({ path: path.join(OUTPUT_DIR, "error-crash.png") }).catch(() => {});
  } finally {
    // Close to finalize video
    await sidepanel.close();
    await browsingPage.close();
    await context.close();

    // Save timestamps
    fs.writeFileSync(TIMESTAMPS_FILE, JSON.stringify(timestamps, null, 2));
    console.log(`\nTimestamps saved to ${TIMESTAMPS_FILE}`);

    // Print summary
    console.log("\n=== Timestamp Summary ===");
    for (const ts of timestamps) {
      console.log(`  ${ts.time}s - ${ts.event}${ts.detail ? " (" + ts.detail + ")" : ""}`);
    }

    // Find and rename video
    const videos = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".webm"));
    if (videos.length > 0) {
      const latestVideo = path.join(OUTPUT_DIR, videos[videos.length - 1]);
      const targetName = path.join(OUTPUT_DIR, "accessvoice-demo.webm");
      if (latestVideo !== targetName) {
        if (fs.existsSync(targetName)) fs.unlinkSync(targetName);
        fs.renameSync(latestVideo, targetName);
      }
      const stats = fs.statSync(targetName);
      console.log(`\n=== Recording Complete ===`);
      console.log(`Video: ${targetName} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
      console.log(
        `Screenshots: ${fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".png")).length} PNG files`
      );
      console.log(`Duration: ~${elapsed()}s`);
      console.log(`\nNext step: node generate_narration.mjs`);
    } else {
      console.log("\nWARNING: No video file found");
    }

    // Cleanup temp profile
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
