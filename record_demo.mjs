/**
 * AccessVoice Demo Video Recorder
 *
 * Records a Playwright video of the AccessVoice UI performing 3 demo scenarios:
 * 1. Search for apartments in Seattle on Zillow
 * 2. Find a winter jacket on Amazon under $100
 * 3. What's the latest news on CNN?
 *
 * Uses smart completion detection instead of fixed waits.
 * Logs timestamps to demo-recording/timestamps.json for narration sync.
 *
 * Output: demo-recording/accessvoice-demo.webm
 *
 * Usage: node record_demo.mjs
 * Requires: npx playwright install chromium
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const FRONTEND_URL = "http://localhost:5173";
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

// Max wait per scenario before moving on (3 minutes)
const MAX_SCENARIO_WAIT_MS = 180000;
// How often to poll for new transcript entries
const POLL_INTERVAL_MS = 3000;
// How long transcript must be stable before considering scenario done
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
 * Count transcript entries (article elements inside the conversation log).
 */
async function getTranscriptCount(page) {
  return page.locator('[role="log"][aria-label="Conversation transcript"] [role="article"]').count();
}

/**
 * Get the text of the last transcript entry.
 */
async function getLastTranscriptText(page) {
  const articles = page.locator('[role="log"][aria-label="Conversation transcript"] [role="article"]');
  const count = await articles.count();
  if (count === 0) return "";
  return articles.nth(count - 1).innerText();
}

/**
 * Wait for the AI to finish responding by watching for transcript stability.
 * Considers "done" when no new transcript entries appear for STABLE_THRESHOLD_MS,
 * after at least one AI response has been received.
 */
async function waitForCompletion(page, initialCount, scenarioLabel) {
  const startWait = Date.now();
  let lastCount = initialCount;
  let lastChangeTime = Date.now();
  let hasResponse = false;
  let browsingScreenshotTaken = false;

  while (Date.now() - startWait < MAX_SCENARIO_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const currentCount = await getTranscriptCount(page);

    if (currentCount > lastCount) {
      lastCount = currentCount;
      lastChangeTime = Date.now();
      if (currentCount > initialCount + 1) {
        hasResponse = true;
      }

      // Take a "browsing" screenshot when we first see AI responding
      if (!browsingScreenshotTaken && currentCount > initialCount + 1) {
        browsingScreenshotTaken = true;
        logTimestamp("first_response", scenarioLabel);
      }
    }

    // Check for completion: have a response + transcript stable for threshold
    if (hasResponse && (Date.now() - lastChangeTime) >= STABLE_THRESHOLD_MS) {
      const lastText = await getLastTranscriptText(page);
      logTimestamp("scenario_complete", `${currentCount - initialCount} entries`);
      return true;
    }
  }

  console.log(`  WARNING: ${scenarioLabel} hit max wait time (${MAX_SCENARIO_WAIT_MS / 1000}s)`);
  logTimestamp("scenario_timeout", scenarioLabel);
  return false;
}

async function run() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Clean old screenshots
  const oldFiles = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".png"));
  for (const f of oldFiles) {
    fs.unlinkSync(path.join(OUTPUT_DIR, f));
  }

  console.log("=== AccessVoice Demo Video Recorder ===\n");
  console.log(`Frontend: ${FRONTEND_URL}`);
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log(`Smart completion detection: ${STABLE_THRESHOLD_MS / 1000}s stability threshold`);
  console.log(`Max wait per scenario: ${MAX_SCENARIO_WAIT_MS / 1000}s`);
  console.log(`Output: ${OUTPUT_DIR}/\n`);

  // Launch browser with video recording
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1920, height: 1080 },
    },
    permissions: ["microphone"],
  });

  const page = await context.newPage();
  recordingStartTime = Date.now();

  try {
    // Navigate to frontend
    console.log("[1/6] Loading frontend...");
    await page.goto(FRONTEND_URL, { waitUntil: "networkidle" });
    await sleep(3000);
    logTimestamp("page_loaded");

    // Wait for Socket.IO connection
    console.log("[2/6] Waiting for backend connection...");
    try {
      await page.getByText("Connected to server").waitFor({ timeout: 30000 });
    } catch {
      console.error("FAILED: Could not connect to backend after 30s");
      await page.screenshot({ path: path.join(OUTPUT_DIR, "error-no-connection.png") });
      return;
    }
    logTimestamp("connected");
    await sleep(2000);

    // Homepage screenshot
    await page.screenshot({ path: path.join(OUTPUT_DIR, "01-homepage.png") });

    // Click Start Session
    console.log("[3/6] Starting voice session...");
    await page.getByRole("button", { name: "Start session" }).click();
    logTimestamp("session_start_clicked");

    // Wait for session to be ready (text input becomes enabled)
    await sleep(5000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "02-session-started.png") });
    logTimestamp("session_ready");
    console.log("  Session started!");

    // Run each demo scenario
    for (let i = 0; i < SCENARIOS.length; i++) {
      const scenario = SCENARIOS[i];
      const stepNum = i + 4;
      const scenarioNum = i + 1;
      console.log(`\n[${stepNum}/6] Scenario ${scenarioNum}: ${scenario.label}`);

      // Get current transcript count before sending command
      const countBefore = await getTranscriptCount(page);

      // Type the command
      const textInput = page.getByRole("textbox", { name: "Type a command or question" });
      await textInput.fill("");
      await textInput.type(scenario.command, { delay: 40 });
      logTimestamp("typed_command", scenario.command);
      await sleep(500);

      // Screenshot of typed command
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${String(scenarioNum * 2 + 1).padStart(2, "0")}-typed-${scenarioNum}.png`),
      });

      // Send the command
      await page.getByRole("button", { name: "Send message" }).click();
      logTimestamp("command_sent", scenario.label);
      console.log(`  Command sent, waiting for AI response...`);

      // Wait for AI to fully respond
      await waitForCompletion(page, countBefore, scenario.label);

      // Take result screenshot
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${String(scenarioNum * 2 + 2).padStart(2, "0")}-result-${scenarioNum}.png`),
      });
      logTimestamp("screenshot_taken", `result-${scenarioNum}`);

      console.log(`  Scenario ${scenarioNum} complete!`);

      // Pause between scenarios (let viewer absorb results)
      if (i < SCENARIOS.length - 1) {
        console.log("  Pausing before next scenario...");
        await sleep(5000);
      }
    }

    // Final state
    console.log("\n[6/6] Capturing final state...");
    await sleep(3000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "99-final.png") });
    logTimestamp("recording_done");

  } catch (error) {
    console.error(`Error during recording: ${error.message}`);
    logTimestamp("error", error.message);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "error-crash.png") });
  } finally {
    // Close page and context to finalize the video
    await page.close();
    await context.close();
    await browser.close();

    // Save timestamps
    fs.writeFileSync(TIMESTAMPS_FILE, JSON.stringify(timestamps, null, 2));
    console.log(`\nTimestamps saved to ${TIMESTAMPS_FILE}`);

    // Print timestamp summary
    console.log("\n=== Timestamp Summary ===");
    for (const ts of timestamps) {
      console.log(`  ${ts.time}s - ${ts.event}${ts.detail ? " (" + ts.detail + ")" : ""}`);
    }

    // Find the recorded video file
    const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".webm"));
    if (files.length > 0) {
      // Rename to consistent filename
      const latestVideo = path.join(OUTPUT_DIR, files[files.length - 1]);
      const targetName = path.join(OUTPUT_DIR, "accessvoice-demo.webm");
      if (latestVideo !== targetName) {
        if (fs.existsSync(targetName)) fs.unlinkSync(targetName);
        fs.renameSync(latestVideo, targetName);
      }
      const stats = fs.statSync(targetName);
      console.log(`\n=== Recording Complete ===`);
      console.log(`Video: ${targetName} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
      console.log(`Screenshots: ${fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".png")).length} PNG files`);
      console.log(`Duration: ~${elapsed()}s`);
      console.log(`\nNext step: node generate_narration.mjs`);
    } else {
      console.log("\nWARNING: No video file found in output directory");
    }
  }
}

run().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
