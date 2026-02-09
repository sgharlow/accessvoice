/**
 * AccessVoice E2E Test — automated Socket.IO test that:
 * 1. Connects to the backend
 * 2. Starts a voice session (Nova Sonic)
 * 3. Sends a text command to browse Wikipedia
 * 4. Waits for transcript/status/screenshot events
 * 5. Reports results
 *
 * Usage: node test_e2e.mjs [timeout_seconds]
 */

import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:8000";
const TIMEOUT_SEC = parseInt(process.argv[2] || "120", 10);
const TEXT_COMMAND = "Search for Seattle on Wikipedia";

console.log(`\n=== AccessVoice E2E Test ===`);
console.log(`Backend: ${BACKEND_URL}`);
console.log(`Timeout: ${TIMEOUT_SEC}s`);
console.log(`Command: "${TEXT_COMMAND}"\n`);

const events = [];
let sessionStarted = false;
let gotTranscript = false;
let gotScreenshot = false;
let gotAudio = false;

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

  // Wait a moment for Nova Sonic to be ready, then send text
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
  const sizeKB = Math.round((data.image.length * 3) / 4 / 1024);
  log("SCREENSHOT", `Screenshot received (~${sizeKB}KB)`);
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
    log("DONE", "Got transcript and screenshot — test passed!");
    clearTimeout(timer);
    clearInterval(checkInterval);
    setTimeout(() => {
      printResults();
      socket.emit("stop_session", {});
      setTimeout(() => {
        socket.disconnect();
        process.exit(0);
      }, 2000);
    }, 5000); // Wait 5s more to collect additional events
  }
}, 1000);

function printResults() {
  console.log("\n=== Test Results ===");
  console.log(`Session started: ${sessionStarted ? "YES" : "NO"}`);
  console.log(`Got transcript:  ${gotTranscript ? "YES" : "NO"}`);
  console.log(`Got screenshot:  ${gotScreenshot ? "YES" : "NO"}`);
  console.log(`Got audio:       ${gotAudio ? "YES" : "NO"}`);
  console.log(`Total events:    ${events.length}`);
  console.log(
    `Result: ${sessionStarted && gotTranscript ? "PASS" : "FAIL"}\n`
  );
}
