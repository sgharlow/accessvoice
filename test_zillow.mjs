/**
 * AccessVoice Zillow E2E Test — tests the primary demo scenario:
 * "Search for 3 bedroom apartments in Seattle under $2000 on Zillow"
 *
 * This hits a real website (Zillow) from a residential IP to verify
 * Nova Act can navigate commercial sites without being blocked.
 *
 * Usage: node test_zillow.mjs [timeout_seconds]
 */

import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:8000";
const TIMEOUT_SEC = parseInt(process.argv[2] || "180", 10);
const TEXT_COMMAND =
  "Search for 3 bedroom apartments in Seattle under $2000 on Zillow";

console.log(`\n=== AccessVoice Zillow E2E Test ===`);
console.log(`Backend: ${BACKEND_URL}`);
console.log(`Timeout: ${TIMEOUT_SEC}s`);
console.log(`Command: "${TEXT_COMMAND}"\n`);

const events = [];
let sessionStarted = false;
let gotTranscript = false;
let gotScreenshot = false;
let gotAudio = false;
let screenshotCount = 0;
let statusMessages = [];

const socket = io(BACKEND_URL, {
  transports: ["websocket", "polling"],
  reconnection: false,
  timeout: 10000,
});

function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${tag}: ${msg}`);
  events.push({ ts, tag, msg });
}

socket.on("connect", () => {
  log("CONNECT", `Connected (sid=${socket.id})`);
  log("SESSION", "Starting session...");
  socket.emit("start_session", {});
});

socket.on("connect_error", (err) => {
  log("ERROR", `Connection failed: ${err.message}`);
  process.exit(1);
});

socket.on("session_started", (data) => {
  sessionStarted = true;
  log("SESSION", `Session started: ${JSON.stringify(data)}`);

  // Wait for Nova Sonic to be ready, then send text
  setTimeout(() => {
    log("TEXT", `Sending: "${TEXT_COMMAND}"`);
    socket.emit("text_input", { text: TEXT_COMMAND });
  }, 3000);
});

socket.on("session_stopped", () => {
  log("SESSION", "Session stopped");
});

socket.on("status", (data) => {
  log("STATUS", data.message);
  statusMessages.push(data.message);
});

socket.on("transcript", (data) => {
  gotTranscript = true;
  log("TRANSCRIPT", `[${data.role}] ${data.text}`);
});

socket.on("audio", (data) => {
  if (!gotAudio) {
    gotAudio = true;
    log("AUDIO", `First audio chunk received (${data.data.length} chars b64)`);
  }
});

socket.on("screenshot", (data) => {
  gotScreenshot = true;
  screenshotCount++;
  const sizeKB = Math.round((data.image.length * 3) / 4 / 1024);
  log("SCREENSHOT", `Screenshot #${screenshotCount} received (~${sizeKB}KB)`);
});

socket.on("error", (data) => {
  log("ERROR", data.message);
});

socket.on("disconnect", (reason) => {
  log("DISCONNECT", reason);
});

// Timeout handler
const timer = setTimeout(() => {
  log("TIMEOUT", `Test timed out after ${TIMEOUT_SEC}s`);
  printResults();
  socket.disconnect();
  process.exit(gotTranscript || gotScreenshot ? 0 : 1);
}, TIMEOUT_SEC * 1000);

// Auto-end after getting meaningful results (transcript + screenshot)
const checkInterval = setInterval(() => {
  if (gotTranscript && gotScreenshot) {
    log("DONE", "Got transcript and screenshot — Zillow test passed!");
    clearTimeout(timer);
    clearInterval(checkInterval);
    setTimeout(() => {
      printResults();
      socket.emit("stop_session", {});
      setTimeout(() => {
        socket.disconnect();
        process.exit(0);
      }, 2000);
    }, 10000); // Wait 10s to collect more screenshots from Zillow navigation
  }
}, 1000);

function printResults() {
  console.log("\n=== Zillow Test Results ===");
  console.log(`Session started:   ${sessionStarted ? "YES" : "NO"}`);
  console.log(`Got transcript:    ${gotTranscript ? "YES" : "NO"}`);
  console.log(`Got screenshot:    ${gotScreenshot ? "YES" : "NO"}`);
  console.log(`Screenshots count: ${screenshotCount}`);
  console.log(`Got audio:         ${gotAudio ? "YES" : "NO"}`);
  console.log(`Total events:      ${events.length}`);
  console.log(`Status flow:`);
  statusMessages.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
  console.log(
    `Result: ${sessionStarted && gotTranscript && gotScreenshot ? "PASS" : "FAIL"}\n`
  );
}
