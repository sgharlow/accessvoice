/**
 * AccessVoice Amazon E2E Test — demo scenario:
 * "Find a winter jacket on Amazon under $100"
 */
import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:8000";
const TIMEOUT_SEC = 180;
const TEXT_COMMAND = "Find a winter jacket on Amazon under $100";

console.log(`\n=== Amazon E2E Test ===`);
console.log(`Command: "${TEXT_COMMAND}"\n`);

let sessionStarted = false;
let gotTranscript = false;
let gotScreenshot = false;
let gotAudio = false;
let screenshotCount = 0;
const statusMessages = [];

const socket = io(BACKEND_URL, {
  transports: ["websocket", "polling"],
  reconnection: false,
  timeout: 10000,
});

function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${tag}: ${msg}`);
}

socket.on("connect", () => {
  log("CONNECT", `Connected (sid=${socket.id})`);
  socket.emit("start_session", {});
});

socket.on("connect_error", (err) => {
  log("ERROR", `Connection failed: ${err.message}`);
  process.exit(1);
});

socket.on("session_started", (data) => {
  sessionStarted = true;
  log("SESSION", `Started: ${data.session_id}`);
  setTimeout(() => {
    log("TEXT", `Sending: "${TEXT_COMMAND}"`);
    socket.emit("text_input", { text: TEXT_COMMAND });
  }, 3000);
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
    log("AUDIO", `First audio chunk (${data.data.length} chars)`);
  }
});

socket.on("screenshot", (data) => {
  gotScreenshot = true;
  screenshotCount++;
  const sizeKB = Math.round((data.image.length * 3) / 4 / 1024);
  log("SCREENSHOT", `#${screenshotCount} (~${sizeKB}KB)`);
});

socket.on("error", (data) => log("ERROR", data.message));

const timer = setTimeout(() => {
  log("TIMEOUT", `Timed out after ${TIMEOUT_SEC}s`);
  finish();
}, TIMEOUT_SEC * 1000);

const checkInterval = setInterval(() => {
  if (gotTranscript && gotScreenshot) {
    log("DONE", "Amazon test passed!");
    clearTimeout(timer);
    clearInterval(checkInterval);
    setTimeout(finish, 5000);
  }
}, 1000);

function finish() {
  const passed = sessionStarted && gotTranscript && gotScreenshot;
  console.log(`\n=== Amazon Result: ${passed ? "PASS" : "FAIL"} ===`);
  console.log(`  Session: ${sessionStarted}, Transcript: ${gotTranscript}, Screenshots: ${screenshotCount}, Audio: ${gotAudio}`);
  console.log(`  Status flow: ${statusMessages.join(" → ")}\n`);
  socket.emit("stop_session", {});
  setTimeout(() => {
    socket.disconnect();
    process.exit(passed ? 0 : 1);
  }, 2000);
}
