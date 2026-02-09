/**
 * Concurrent Sessions Test — verifies:
 * 1. Two sessions can start simultaneously
 * 2. Both receive independent responses
 * 3. Stopping one doesn't affect the other
 */
import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:8000";
const TIMEOUT_SEC = 120;

console.log(`\n=== Concurrent Sessions Test ===\n`);

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
  const socket1 = createSocket();
  const socket2 = createSocket();

  // Connect both
  await Promise.all([
    new Promise((resolve, reject) => {
      socket1.on("connect", resolve);
      socket1.on("connect_error", reject);
    }),
    new Promise((resolve, reject) => {
      socket2.on("connect", resolve);
      socket2.on("connect_error", reject);
    }),
  ]);
  log("Both sockets connected");

  // Start both sessions
  let session1Id, session2Id;

  await test("Two sessions start simultaneously", async () => {
    socket1.emit("start_session", {});
    socket2.emit("start_session", {});

    const [data1, data2] = await Promise.all([
      waitForEvent(socket1, "session_started", 30000),
      waitForEvent(socket2, "session_started", 30000),
    ]);

    session1Id = data1.session_id;
    session2Id = data2.session_id;

    if (!session1Id || !session2Id) throw new Error("Missing session IDs");
    if (session1Id === session2Id) throw new Error("Same session ID for both — not independent");
    log(`    Session 1: ${session1Id.slice(0, 8)}...`);
    log(`    Session 2: ${session2Id.slice(0, 8)}...`);
  });

  await test("Health shows 2 active sessions", async () => {
    const res = await fetch(`${BACKEND_URL}/health`);
    const h = await res.json();
    if (h.active_sessions < 2) throw new Error(`Expected >= 2, got ${h.active_sessions}`);
  });

  // Wait for both to be ready
  await new Promise(r => setTimeout(r, 3000));

  // Send different commands to each
  await test("Both sessions receive independent transcripts", async () => {
    let transcript1 = null, transcript2 = null;

    const p1 = new Promise((resolve) => {
      socket1.once("transcript", (data) => { transcript1 = data; resolve(); });
    });
    const p2 = new Promise((resolve) => {
      socket2.once("transcript", (data) => { transcript2 = data; resolve(); });
    });

    socket1.emit("text_input", { text: "What is the capital of France?" });
    socket2.emit("text_input", { text: "What is the capital of Japan?" });

    await Promise.race([
      Promise.all([p1, p2]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for both transcripts")), 60000)),
    ]);

    if (!transcript1) throw new Error("No transcript from session 1");
    if (!transcript2) throw new Error("No transcript from session 2");
    log(`    S1: ${transcript1.text?.slice(0, 60)}`);
    log(`    S2: ${transcript2.text?.slice(0, 60)}`);
  });

  // Stop session 1, verify session 2 still works
  await test("Stopping session 1 doesn't affect session 2", async () => {
    socket1.emit("stop_session", {});
    await waitForEvent(socket1, "session_stopped", 15000);
    log("    Session 1 stopped");

    // Session 2 should still respond
    let gotTranscript = false;
    const p = new Promise((resolve) => {
      socket2.once("transcript", () => { gotTranscript = true; resolve(); });
    });

    socket2.emit("text_input", { text: "Tell me a fun fact" });

    await Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Session 2 stopped responding after S1 stopped")), 30000)),
    ]);

    if (!gotTranscript) throw new Error("Session 2 dead after S1 stopped");
  });

  // Cleanup
  socket2.emit("stop_session", {});
  await new Promise(r => setTimeout(r, 2000));
  socket1.disconnect();
  socket2.disconnect();

  console.log(`\n=== Concurrent Result: ${testsFailed === 0 ? "PASS" : "FAIL"} ===`);
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
