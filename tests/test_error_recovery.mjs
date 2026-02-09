/**
 * Error Recovery Test — verifies graceful handling of:
 * 1. Invalid/bad URL
 * 2. Session still works after an error
 */
import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:8000";
const TIMEOUT_SEC = 120;

console.log(`\n=== Error Recovery Test ===\n`);

let testsPassed = 0;
let testsFailed = 0;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function createSocket() {
  return io(BACKEND_URL, {
    transports: ["websocket", "polling"],
    reconnection: false,
    timeout: 10000,
  });
}

function waitForEvent(socket, event, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function collectEvents(socket, event, durationMs = 10000) {
  return new Promise((resolve) => {
    const collected = [];
    const handler = (data) => collected.push(data);
    socket.on(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve(collected);
    }, durationMs);
  });
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
  const socket = createSocket();

  await new Promise((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
    setTimeout(() => reject(new Error("Connect timeout")), 10000);
  });

  // Start session
  socket.emit("start_session", {});
  await waitForEvent(socket, "session_started", 30000);
  log("Session started");

  // Wait for Nova Sonic to be ready
  await new Promise(r => setTimeout(r, 3000));

  // Test 1: Bad URL — should get a transcript back (error handled gracefully)
  await test("Bad URL returns graceful transcript (no crash)", async () => {
    const transcriptPromise = collectEvents(socket, "transcript", 30000);
    const statusPromise = collectEvents(socket, "status", 30000);

    socket.emit("text_input", { text: "Go to https://thissitedoesnotexist12345.com and read me the news" });

    const transcripts = await transcriptPromise;
    const statuses = await statusPromise;

    log(`    Got ${transcripts.length} transcripts, ${statuses.length} status messages`);

    // We should get SOME response — either a transcript or status indicating the error
    if (transcripts.length === 0 && statuses.length === 0) {
      throw new Error("No response at all — session may have crashed");
    }

    // Check that we got a transcript (the model should respond even if the tool fails)
    if (transcripts.length > 0) {
      log(`    Transcript: ${transcripts[0].text?.slice(0, 100)}`);
    }
  });

  // Test 2: Session still works after error
  await test("Session still responsive after error", async () => {
    const transcriptPromise = collectEvents(socket, "transcript", 60000);
    const screenshotPromise = collectEvents(socket, "screenshot", 60000);

    socket.emit("text_input", { text: "Search for cats on Wikipedia" });

    const transcripts = await transcriptPromise;
    const screenshots = await screenshotPromise;

    log(`    Recovery: ${transcripts.length} transcripts, ${screenshots.length} screenshots`);

    if (transcripts.length === 0) {
      throw new Error("No transcript after recovery — session is dead");
    }
  });

  // Clean up
  socket.emit("stop_session", {});
  await new Promise(r => setTimeout(r, 2000));
  socket.disconnect();

  console.log(`\n=== Error Recovery Result: ${testsFailed === 0 ? "PASS" : "FAIL"} ===`);
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
