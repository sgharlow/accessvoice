/**
 * AccessVoice Demo Video Recorder
 *
 * Records a Playwright video of the AccessVoice UI performing 3 demo scenarios:
 * 1. Search for apartments in Seattle on Zillow
 * 2. Find a winter jacket on Amazon under $100
 * 3. What's the latest news on CNN?
 *
 * Output: demo-recording/demo.webm
 *
 * Usage: node record_demo.mjs
 * Requires: npx playwright install chromium
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const FRONTEND_URL = "http://localhost:5173";
const OUTPUT_DIR = "demo-recording";
const SCENARIOS = [
  {
    command: "Search for apartments in Seattle on Zillow",
    waitAfter: 25000,  // Wait for browsing + screenshots
    label: "Zillow Apartment Search",
  },
  {
    command: "Find a winter jacket on Amazon under $100",
    waitAfter: 25000,
    label: "Amazon Shopping",
  },
  {
    command: "What's the latest news on CNN?",
    waitAfter: 25000,
    label: "CNN News",
  },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForText(page, text, timeout = 30000) {
  try {
    await page.waitForSelector(`text=${text}`, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function run() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log("=== AccessVoice Demo Video Recorder ===\n");
  console.log(`Frontend: ${FRONTEND_URL}`);
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log(`Output: ${OUTPUT_DIR}/\n`);

  // Launch browser with video recording
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1920, height: 1080 },
    },
    // Grant microphone permission (won't actually use it, but prevents prompts)
    permissions: ["microphone"],
  });

  const page = await context.newPage();

  try {
    // Navigate to frontend
    console.log("[1/6] Loading frontend...");
    await page.goto(FRONTEND_URL, { waitUntil: "networkidle" });
    await sleep(3000);

    // Wait for Socket.IO connection
    console.log("[2/6] Waiting for backend connection...");
    const connected = await waitForText(page, "Connected to server", 15000);
    if (!connected) {
      console.error("FAILED: Could not connect to backend");
      await page.screenshot({ path: path.join(OUTPUT_DIR, "error-no-connection.png") });
      return;
    }
    console.log("  Connected!");
    await sleep(1000);

    // Take a "before" screenshot
    await page.screenshot({ path: path.join(OUTPUT_DIR, "01-homepage.png") });

    // Click Start Session
    console.log("[3/6] Starting voice session...");
    const startBtn = page.getByRole("button", { name: "Start session" });
    await startBtn.click();

    // Wait for session to start (button text changes or status updates)
    await sleep(5000);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "02-session-started.png") });
    console.log("  Session started!");

    // Run each demo scenario
    for (let i = 0; i < SCENARIOS.length; i++) {
      const scenario = SCENARIOS[i];
      const stepNum = i + 4;
      console.log(`[${stepNum}/6] Scenario ${i + 1}: ${scenario.label}`);
      console.log(`  Typing: "${scenario.command}"`);

      // Find the text input and type the command
      const textInput = page.getByRole("textbox", { name: "Type a command or question" });

      // Clear any existing text
      await textInput.fill("");

      // Type the command with realistic speed
      await textInput.type(scenario.command, { delay: 40 });
      await sleep(500);

      // Take screenshot of typed command
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${String(i * 3 + 3).padStart(2, "0")}-typed-${i + 1}.png`),
      });

      // Click Send
      const sendBtn = page.getByRole("button", { name: "Send message" });
      await sendBtn.click();
      console.log("  Command sent, waiting for response...");

      // Wait for the AI to process and respond
      await sleep(scenario.waitAfter);

      // Take screenshot showing results
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${String(i * 3 + 4).padStart(2, "0")}-browsing-${i + 1}.png`),
      });

      // Wait a bit more for the response to come back
      await sleep(10000);

      // Take final screenshot for this scenario
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${String(i * 3 + 5).padStart(2, "0")}-result-${i + 1}.png`),
      });

      console.log(`  Scenario ${i + 1} complete!`);

      // Pause between scenarios
      if (i < SCENARIOS.length - 1) {
        console.log("  Pausing before next scenario...");
        await sleep(3000);
      }
    }

    // Final state
    console.log("[6/6] Capturing final state...");
    await page.screenshot({ path: path.join(OUTPUT_DIR, "99-final.png") });
    await sleep(2000);

  } catch (error) {
    console.error(`Error during recording: ${error.message}`);
    await page.screenshot({ path: path.join(OUTPUT_DIR, "error-crash.png") });
  } finally {
    // Close page and context to finalize the video
    await page.close();
    await context.close();
    await browser.close();

    // Find the recorded video file
    const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".webm"));
    if (files.length > 0) {
      const videoFile = path.join(OUTPUT_DIR, files[files.length - 1]);
      const stats = fs.statSync(videoFile);
      console.log(`\n=== Recording Complete ===`);
      console.log(`Video: ${videoFile} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
      console.log(`Screenshots: ${fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".png")).length} PNG files`);
    } else {
      console.log("\nWARNING: No video file found in output directory");
    }
  }
}

run().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
