/**
 * Generate voiceover narration for AccessVoice demo video using edge-tts.
 *
 * Each segment is a narration clip placed at a specific timestamp.
 * Output: demo-recording/narration/ directory with numbered MP3 files,
 * then merges all segments with the demo video via ffmpeg.
 *
 * Prerequisites: pip install edge-tts, ffmpeg on PATH
 * Usage: node generate_narration.mjs
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const OUTPUT_DIR = "demo-recording/narration";
const VIDEO_PATH = "demo-recording/accessvoice-demo.webm";
const FINAL_OUTPUT = "demo-recording/accessvoice-demo-narrated.mp4";

// edge-tts voice — warm, confident male voice
const VOICE = "en-US-AndrewNeural";

/**
 * Narration segments with timestamps (seconds into the video).
 * Each segment will be spoken by edge-tts and placed at the given time.
 */
/**
 * Narration segments timed to actual recording timestamps.
 *
 * Recording timeline (from timestamps.json):
 *   0-10s:   Page load + connect
 *   12-17s:  Session start
 *   20-51s:  Scenario 1 — Apartments.com (command at 20s, response at 35s, done at 51s)
 *   58-218s: Scenario 2 — Amazon (command at 58s, response at 191s, done at 218s)
 *   225-243s: Scenario 3 — CNN (command at 225s, response at 228s, done at 243s)
 *   246-250s: Final state
 */
const SEGMENTS = [
  // --- Intro (during page load) ---
  {
    startSec: 1,
    text: `This is AccessVoice — a voice-driven web browser built for accessibility.`,
  },
  {
    startSec: 6,
    text: `It lets visually impaired users browse the internet through natural conversation, powered by three Amazon Nova models.`,
  },

  // --- Session start ---
  {
    startSec: 13,
    text: `We're starting a voice session. The system connects to Nova Sonic for bidirectional audio streaming.`,
  },

  // --- Scenario 1: Apartments.com ---
  {
    startSec: 20,
    text: `Our first scenario: searching for apartments on Apartments dot com. We type the command — in production, this would be spoken aloud.`,
  },
  {
    startSec: 30,
    text: `Nova Act launches a real Chrome browser, navigates to the website, and performs the search autonomously.`,
  },
  {
    startSec: 40,
    text: `The browser screenshot streams back in real time. The AI responds with a voice summary of the results.`,
  },

  // --- Scenario 2: Amazon ---
  {
    startSec: 55,
    text: `Scenario two: shopping on Amazon. We ask AccessVoice to find a winter jacket under one hundred dollars.`,
  },
  {
    startSec: 65,
    text: `Nova Act is now navigating to Amazon. It types the search query and browses results just like a human would.`,
  },
  {
    startSec: 80,
    text: `Behind the scenes, Nova Sonic handles the voice conversation while Nova Act controls the browser. These two models work together in real time.`,
  },
  {
    startSec: 100,
    text: `The browser automation runs in a real Chrome instance. Every click, scroll, and search is performed by Nova Act autonomously.`,
  },
  {
    startSec: 120,
    text: `Notice the conversation transcript on the right — it provides a text alternative for accessibility, ensuring the experience works for all users.`,
  },
  {
    startSec: 145,
    text: `Nova Act is filtering the search results. The entire interaction happens through natural language — no manual navigation required.`,
  },
  {
    startSec: 170,
    text: `Once Nova Act completes the browsing, Nova Lite analyzes the page screenshot and generates an accessible summary.`,
  },
  {
    startSec: 195,
    text: `The AI is now summarizing the results it found. AccessVoice converts this into a spoken response for the user.`,
  },

  // --- Scenario 3: CNN ---
  {
    startSec: 222,
    text: `Final scenario: reading the news on CNN. AccessVoice works across different types of websites.`,
  },
  {
    startSec: 232,
    text: `Nova Lite analyzes the page and provides accessibility-friendly descriptions of the content.`,
  },

  // --- Outro ---
  {
    startSec: 242,
    text: `AccessVoice — making the web accessible through voice. Built with Amazon Nova Sonic, Nova Act, and Nova Lite. Thank you for watching.`,
  },
];

function synthesizeSpeech(text, outputPath) {
  // Escape quotes for shell
  const escaped = text.replace(/"/g, '\\"');
  const cmd = `python -m edge_tts --voice "${VOICE}" --text "${escaped}" --write-media "${outputPath}"`;
  execSync(cmd, { stdio: "pipe" });

  // Get duration using ffprobe
  const duration = execSync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${outputPath}"`
  )
    .toString()
    .trim();

  return parseFloat(duration);
}

function run() {
  console.log("=== AccessVoice Narration Generator (edge-tts) ===\n");

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Verify video exists
  if (!fs.existsSync(VIDEO_PATH)) {
    console.error(`Video not found: ${VIDEO_PATH}`);
    process.exit(1);
  }

  // Generate each narration segment
  console.log(
    `Generating ${SEGMENTS.length} narration segments with edge-tts (${VOICE})...\n`
  );
  const segmentFiles = [];

  for (let i = 0; i < SEGMENTS.length; i++) {
    const seg = SEGMENTS[i];
    const filename = `segment-${String(i + 1).padStart(2, "0")}.mp3`;
    const filepath = path.join(OUTPUT_DIR, filename);

    process.stdout.write(
      `  [${i + 1}/${SEGMENTS.length}] Generating at ${seg.startSec}s... `
    );
    const duration = synthesizeSpeech(seg.text, filepath);
    console.log(`${duration.toFixed(1)}s (${seg.text.slice(0, 50)}...)`);

    segmentFiles.push({
      file: filepath,
      startSec: seg.startSec,
      duration,
    });
  }

  // Check for overlap warnings
  console.log("\nChecking for segment overlaps...");
  for (let i = 0; i < segmentFiles.length - 1; i++) {
    const curr = segmentFiles[i];
    const next = segmentFiles[i + 1];
    const endTime = curr.startSec + curr.duration;
    if (endTime > next.startSec) {
      console.warn(
        `  WARNING: Segment ${i + 1} ends at ${endTime.toFixed(1)}s but segment ${i + 2} starts at ${next.startSec}s (overlap: ${(endTime - next.startSec).toFixed(1)}s)`
      );
    }
  }

  // Build ffmpeg filter to mix all narration segments onto the video
  console.log("\nMerging narration with video using ffmpeg...");

  // Build the complex filter
  // Input 0: video file
  // Inputs 1..N: narration segments
  const inputs = [`-i "${VIDEO_PATH}"`];
  for (const seg of segmentFiles) {
    inputs.push(`-i "${seg.file}"`);
  }

  // Build adelay filter chain: delay each segment to its start time
  const filterParts = [];
  for (let i = 0; i < segmentFiles.length; i++) {
    const delayMs = segmentFiles[i].startSec * 1000;
    filterParts.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
  }

  // Merge all delayed audio segments and pad to video length
  const mergeInputs = segmentFiles.map((_, i) => `[a${i}]`).join("");
  filterParts.push(
    `${mergeInputs}amix=inputs=${segmentFiles.length}:dropout_transition=0:normalize=0,apad[narration]`
  );

  const filterComplex = filterParts.join(";");

  // Build the ffmpeg command
  const ffmpegCmd = [
    "ffmpeg -y",
    inputs.join(" "),
    `-filter_complex "${filterComplex}"`,
    `-map 0:v -map "[narration]"`,
    `-c:v libx264 -preset fast -crf 23`,
    `-c:a aac -b:a 192k`,
    `-shortest`,
    `"${FINAL_OUTPUT}"`,
  ].join(" ");

  console.log(`\nRunning ffmpeg (complex filter with ${segmentFiles.length} audio inputs)...`);

  try {
    execSync(ffmpegCmd, {
      stdio: "pipe",
      maxBuffer: 50 * 1024 * 1024,
      cwd: process.cwd(),
    });

    const stats = fs.statSync(FINAL_OUTPUT);
    console.log(`\n=== Done! ===`);
    console.log(
      `Output: ${FINAL_OUTPUT} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`
    );
    console.log(`Narration segments: ${segmentFiles.length}`);
    console.log(
      `Total narration: ${segmentFiles.reduce((sum, s) => sum + s.duration, 0).toFixed(1)}s`
    );
  } catch (e) {
    console.error(
      `ffmpeg complex filter failed: ${e.stderr?.toString().slice(-500) || e.message}`
    );
    console.log("\nFalling back to simple merge approach...");
    simpleMerge(segmentFiles);
  }
}

function simpleMerge(segmentFiles) {
  // Simpler approach: concatenate all narration into one track with silence gaps,
  // then merge with video
  const padded = [];
  for (let i = 0; i < segmentFiles.length; i++) {
    const seg = segmentFiles[i];
    const paddedFile = path.join(
      OUTPUT_DIR,
      `padded-${String(i + 1).padStart(2, "0")}.mp3`
    );

    // Calculate silence before this segment
    const prevEnd =
      i > 0 ? segmentFiles[i - 1].startSec + segmentFiles[i - 1].duration : 0;
    const silenceDuration = Math.max(0, seg.startSec - prevEnd);

    if (silenceDuration > 0.1) {
      const silenceFile = path.join(OUTPUT_DIR, `silence-${i}.mp3`);
      execSync(
        `ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${silenceDuration} -c:a libmp3lame "${silenceFile}"`,
        { stdio: "pipe" }
      );

      const listFile = path.join(OUTPUT_DIR, `concat-${i}.txt`);
      fs.writeFileSync(
        listFile,
        `file '${path.resolve(silenceFile).replace(/\\/g, "/")}'\nfile '${path.resolve(seg.file).replace(/\\/g, "/")}'\n`
      );
      execSync(
        `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${paddedFile}"`,
        { stdio: "pipe" }
      );
    } else {
      fs.copyFileSync(seg.file, paddedFile);
    }
    padded.push(paddedFile);
  }

  // Create master concat list
  const masterList = path.join(OUTPUT_DIR, "master-concat.txt");
  fs.writeFileSync(
    masterList,
    padded
      .map((f) => `file '${path.resolve(f).replace(/\\/g, "/")}'`)
      .join("\n") + "\n"
  );

  // Concat all padded segments into one audio track
  const fullNarration = path.join(OUTPUT_DIR, "full-narration.mp3");
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${masterList}" -c copy "${fullNarration}"`,
    { stdio: "pipe" }
  );

  // Merge with video
  execSync(
    `ffmpeg -y -i "${VIDEO_PATH}" -i "${fullNarration}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -shortest "${FINAL_OUTPUT}"`,
    { stdio: "pipe" }
  );

  const stats = fs.statSync(FINAL_OUTPUT);
  console.log(`\n=== Done (simple merge)! ===`);
  console.log(
    `Output: ${FINAL_OUTPUT} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`
  );
}

run();
