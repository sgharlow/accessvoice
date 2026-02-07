"""Audio utility functions for PCM conversion and validation."""

import struct
import logging

logger = logging.getLogger("accessvoice.audio")

# Audio format constants
SAMPLE_RATE = 16000      # 16kHz
SAMPLE_WIDTH = 2         # 16-bit (2 bytes)
CHANNELS = 1             # Mono
BYTES_PER_SECOND = SAMPLE_RATE * SAMPLE_WIDTH * CHANNELS  # 32000


def validate_pcm(audio_bytes: bytes) -> bool:
    """Check if audio data looks like valid 16-bit PCM."""
    if len(audio_bytes) < 2:
        return False
    # 16-bit PCM should have even number of bytes
    if len(audio_bytes) % 2 != 0:
        return False
    return True


def pcm_duration_seconds(audio_bytes: bytes) -> float:
    """Calculate duration in seconds for 16kHz 16-bit mono PCM."""
    return len(audio_bytes) / BYTES_PER_SECOND


def is_silence(audio_bytes: bytes, threshold: int = 500) -> bool:
    """Check if PCM audio is silence (below amplitude threshold).

    Args:
        audio_bytes: Raw 16-bit PCM data
        threshold: RMS amplitude below which audio is considered silence

    Returns:
        True if the audio is silent
    """
    if len(audio_bytes) < 2:
        return True

    # Unpack 16-bit signed integers
    num_samples = len(audio_bytes) // 2
    samples = struct.unpack(f"<{num_samples}h", audio_bytes[:num_samples * 2])

    # Calculate RMS
    rms = (sum(s * s for s in samples) / num_samples) ** 0.5
    return rms < threshold
