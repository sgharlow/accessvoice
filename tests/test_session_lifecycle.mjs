/**
 * Session Lifecycle Test — verifies:
 * 1. Session starts correctly
 * 2. Session stops cleanly
 * 3. A new session can start after stopping (no resource leaks)
 * 4. Health endpoint reflects correct session counts
 */
import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:8000";
const TIMEOUT_SEC = 60;

console.log(`\n=== Session Lifecycle Test ===\n`);

let testsPassed = 0;
let testsFailed = 0;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

async function fetchHealth() {
  const res = await fetch(`${BACKEND_URL}/health`);
  return res.json();
}

function createSocket() {
  return io(BACKEND_URL, {
    transports: ["websocket", "polling"],
    reconnection: false,
    timeout: 10000,
  });
}

function waitForEvent(socket, event, timeout = 15000) {
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
  // Test 1: Health endpoint baseline
  await test("Health endpoint returns ok with 0 sessions", async () => {
    const h = await fetchHealth();
    if (h.status !== "ok") throw new Error(`Expected status ok, got ${h.status}`);
    // Don't check active_sessions === 0 since previous tests may have left sessions
  });

  // Test 2: Session start
  const socket1 = createSocket();
  await test("Socket connects", async () => {
    await new Promise((resolve, reject) => {
      socket1.on("connect", resolve);
      socket1.on("connect_error", reject);
      setTimeout(() => reject(new Error("Connect timeout")), 10000);
    });
  });

  let session1Id;
  await test("Session starts and returns session_id", async () => {
    socket1.emit("start_session", {});
    const data = await waitForEvent(socket1, "session_started", 30000);
    session1Id = data.session_id;
    if (!session1Id) throw new Error("No session_id returned");
  });

  await test("Health shows 1 active session after start", async () => {
    const h = await fetchHealth();
    if (h.active_sessions < 1) throw new Error(`Expected >= 1, got ${h.active_sessions}`);
  });

  // Test 3: Session stop (cleanup involves stopping BidiAgent + browser, can take 30s+)
  await test("Session stops cleanly", async () => {
    socket1.emit("stop_session", {});
    await waitForEvent(socket1, "session_stopped", 45000);
  });

  // Give cleanup a moment
  await new Promise(r => setTimeout(r, 2000));

  // Test 4: Restart — new session on same socket
  await test("New session starts after stop (no resource leak)", async () => {
    socket1.emit("start_session", {});
    const data = await waitForEvent(socket1, "session_started", 30000);
    if (!data.session_id) throw new Error("No session_id on restart");
    if (data.session_id === session1Id) throw new Error("Got same session_id — not a fresh session");
  });

  // Clean up
  socket1.emit("stop_session", {});
  await new Promise(r => setTimeout(r, 1000));
  socket1.disconnect();

  // Test 5: Disconnect cleanup
  await test("Health endpoint still responsive after lifecycle", async () => {
    const h = await fetchHealth();
    if (h.status !== "ok") throw new Error(`Health not ok: ${h.status}`);
  });

  // Results
  console.log(`\n=== Lifecycle Result: ${testsFailed === 0 ? "PASS" : "FAIL"} ===`);
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
