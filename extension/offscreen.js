// extension/offscreen.js

let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let isRecording = false;

// Audio playback queue
let playbackContext = null;
const audioQueue = [];
let isPlaying = false;

// --- Microphone Capture ---

async function startRecording() {
  if (isRecording) return;

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(mediaStream);
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  scriptProcessor.onaudioprocess = (event) => {
    if (!isRecording) return;
    const float32 = event.inputBuffer.getChannelData(0);
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const bytes = new Uint8Array(int16.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    chrome.runtime.sendMessage({ type: "audio_chunk", data: base64 });
  };

  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);
  isRecording = true;
}

function stopRecording() {
  isRecording = false;
  scriptProcessor?.disconnect();
  mediaStream?.getTracks().forEach((t) => t.stop());
  audioContext?.close();
  audioContext = null;
  mediaStream = null;
  scriptProcessor = null;
}

// --- Audio Playback ---

function playAudioChunk(base64Data) {
  if (!playbackContext) {
    playbackContext = new AudioContext({ sampleRate: 16000 });
  }

  const raw = atob(base64Data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

  const view = new DataView(bytes.buffer);
  const samples = bytes.length / 2;
  const float32 = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }

  const buffer = playbackContext.createBuffer(1, samples, 16000);
  buffer.copyToChannel(float32, 0);

  audioQueue.push(buffer);
  if (!isPlaying) playNext();
}

function playNext() {
  if (audioQueue.length === 0) {
    isPlaying = false;
    return;
  }
  isPlaying = true;
  const buffer = audioQueue.shift();
  const source = playbackContext.createBufferSource();
  source.buffer = buffer;
  source.connect(playbackContext.destination);
  source.onended = playNext;
  source.start();
}

// --- Message Handler ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "start_recording") {
    startRecording().then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ error: e.message }));
    return true;
  } else if (message.type === "stop_recording") {
    stopRecording();
    sendResponse({ ok: true });
  } else if (message.type === "play_audio") {
    playAudioChunk(message.data);
    sendResponse({ ok: true });
  }
});
