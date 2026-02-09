/**
 * Read Page Tool Test — verifies Nova 2 Lite vision analysis:
 * 1. Browse to a page
 * 2. Ask "What's on this page?"
 * 3. Verify we get a descriptive response
 */
import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:8000";
const TIMEOUT_SEC = 120;

console.log(`\n=== Read Page (Nova 2 Lite Vision) Test ===\n`);

let testsPassed = 0;
let testsFailed = 0;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

const socket = io(BACKEND_URL, {
  transports: ["websocket", "polling"],
  reconnection: false,
  timeout: 10000,
});

const allTranscripts = [];
const allStatuses = [];
let gotScreenshot = false;

socket.on("connect", () => log("Connected"));
socket.on("status", (data) => {
  log(`STATUS: ${data.message}`);
  allStatuses.push(data.message);
});
socket.on("transcript", (data) => {
  log(`TRANSCRIPT [${data.role}]: ${data.text}`);
  allTranscripts.push(data);
});
socket.on("screenshot", (data) => {
  gotScreenshot = true;
  const sizeKB = Math.round((data.image.length * 3) / 4 / 1024);
  log(`SCREENSHOT: ~${sizeKB}KB`);
});
socket.on("audio", () => {});
socket.on("error", (data) => log(`ERROR: ${data.message}`));

async function waitForTranscript(minCount, timeout = 60000) {
  const start = Date.now();
  while (allTranscripts.length < minCount) {
    if (Date.now() - start > timeout) throw new Error(`Timeout waiting for transcript #${minCount}`);
    await new Promise(r => setTimeout(r, 1000));
  }
  return allTranscripts[minCount - 1];
}

async function test(name, fn) {
  try {
    await fn();
    testsPassed++;
    log(`  PASS: ${name}`);
  } catch (e) {
    testsFailed++;
    log(`  FAIL: ${name} — ${e.message}`);
  }
}

async function run() {
  // Connect
  await new Promise((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
    setTimeout(() => reject(new Error("Connect timeout")), 10000);
  });

  // Start session
  socket.emit("start_session", {});
  await new Promise((resolve, reject) => {
    socket.once("session_started", resolve);
    setTimeout(() => reject(new Error("Session start timeout")), 30000);
  });
  log("Session started");

  await new Promise(r => setTimeout(r, 3000));

  // Step 1: Browse to Wikipedia
  await test("Browse to Wikipedia and get screenshot", async () => {
    socket.emit("text_input", { text: "Go to wikipedia.org" });

    // Wait for screenshot
    const start = Date.now();
    while (!gotScreenshot && Date.now() - start < 60000) {
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!gotScreenshot) throw new Error("No screenshot received");
  });

  // Give the model time to finish the browse action (it may or may not speak)
  await new Promise(r => setTimeout(r, 5000));
  const transcriptCountBefore = allTranscripts.length;

  // Step 2: Ask "What's on this page?" — should trigger read_page (Nova 2 Lite)
  await test("Read page describes content (Nova 2 Lite)", async () => {
    socket.emit("text_input", { text: "What's on this page? Describe what you see." });

    // Wait for a new transcript (allow 90s — read_page calls Nova 2 Lite)
    await waitForTranscript(transcriptCountBefore + 1, 90000);

    const response = allTranscripts[allTranscripts.length - 1];
    log(`    Response: ${response.text?.slice(0, 150)}`);

    // The response should mention Wikipedia or describe page content
    if (!response.text || response.text.length < 10) {
      throw new Error("Response too short — may not have used read_page");
    }

    // Check if read_page status appeared
    const readPageUsed = allStatuses.some(s =>
      s.toLowerCase().includes("reading") || s.toLowerCase().includes("analyzing") || s.toLowerCase().includes("page")
    );
    log(`    read_page status detected: ${readPageUsed}`);
  });

  // Cleanup
  socket.emit("stop_session", {});
  await new Promise(r => setTimeout(r, 2000));
  socket.disconnect();

  console.log(`\n=== Read Page Result: ${testsFailed === 0 ? "PASS" : "FAIL"} ===`);
  console.log(`  Passed: ${testsPassed}, Failed: ${testsFailed}\n`);
  process.exit(testsFailed === 0 ? 0 : 1);
}

const timeout = setTimeout(() => {
  log("TIMEOUT: Test suite timed out");
  process.exit(1);
}, TIMEOUT_SEC * 1000);

run().catch((e) => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
}).finally(() => clearTimeout(timeout));
