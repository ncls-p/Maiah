#!/usr/bin/env python3
"""Generate the original ambient score used by the Maiah Remotion film."""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44_100
DURATION_SECONDS = 34
TAU = math.tau
TRANSITIONS = (4.5, 11.5, 18.0, 24.0, 28.5)


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def master_envelope(time: float) -> float:
    fade_in = smoothstep(time / 2.2)
    fade_out = smoothstep((DURATION_SECONDS - time) / 2.8)
    return fade_in * fade_out


def transition_tone(time: float, transition: float, pan: float) -> tuple[float, float]:
    elapsed = time - transition
    if elapsed < 0.0 or elapsed > 4.2:
        return (0.0, 0.0)

    decay = math.exp(-elapsed * 0.82)
    shimmer = (
        math.sin(TAU * 220.00 * elapsed)
        + 0.55 * math.sin(TAU * 277.18 * elapsed + 0.4)
        + 0.35 * math.sin(TAU * 329.63 * elapsed + 1.1)
    )
    signal = shimmer * decay * 0.028
    return (signal * (1.0 - pan * 0.28), signal * (1.0 + pan * 0.28))


def low_pulse(time: float) -> float:
    beat = time % 2.0
    if beat > 0.62:
        return 0.0
    envelope = math.exp(-beat * 7.2)
    pitch = 62.0 - beat * 21.0
    return math.sin(TAU * pitch * beat) * envelope * 0.055


def pcm_sample(value: float) -> int:
    try:
        return int(max(-1.0, min(1.0, value)) * 32_767)
    except (OverflowError, TypeError, ValueError):
        return 0


def render_score(output_path: Path, public_root: Path) -> None:
    resolved_root = public_root.resolve()
    resolved_output = output_path.resolve()
    if (
        resolved_output != resolved_root
        and resolved_root not in resolved_output.parents
    ):
        raise ValueError("Soundtrack output must stay inside the public directory")

    resolved_output.parent.mkdir(parents=True, exist_ok=True)
    rng = random.Random(24_062_026)
    samples = bytearray()

    for sample_index in range(SAMPLE_RATE * DURATION_SECONDS):
        time = sample_index / SAMPLE_RATE
        breath = 0.72 + 0.28 * math.sin(TAU * time / 10.5)
        drift = 0.8 * math.sin(TAU * time / 17.0)

        drone = (
            0.11 * math.sin(TAU * (55.0 + drift * 0.08) * time)
            + 0.055 * math.sin(TAU * (82.41 + drift * 0.05) * time + 0.7)
            + 0.03 * math.sin(TAU * 110.0 * time + 1.9)
        ) * breath

        air = (
            (
                math.sin(TAU * 138.59 * time + 0.4 * math.sin(TAU * time / 8.0))
                + 0.6 * math.sin(TAU * 164.81 * time + 1.4)
            )
            * 0.014
            * (0.55 + 0.45 * math.sin(TAU * time / 13.0 + 0.8))
        )

        pulse = low_pulse(time)
        left = drone + air + pulse
        right = drone * 0.96 + air * 1.08 + pulse

        for transition_index, transition in enumerate(TRANSITIONS):
            pan = -0.8 + transition_index * 0.4
            tone_left, tone_right = transition_tone(time, transition, pan)
            left += tone_left
            right += tone_right

            distance = (time - transition + 0.42) / 0.38
            if abs(distance) < 2.4:
                whoosh = math.exp(-(distance**2)) * (rng.random() * 2.0 - 1.0) * 0.016
                left += whoosh * (1.0 - pan * 0.18)
                right += whoosh * (1.0 + pan * 0.18)

        envelope = master_envelope(time)
        left = math.tanh(left * 1.35) * envelope * 0.86
        right = math.tanh(right * 1.35) * envelope * 0.86
        samples.extend(
            struct.pack(
                "<hh",
                pcm_sample(left),
                pcm_sample(right),
            )
        )

    with wave.open(str(resolved_output), "wb") as wave_file:
        wave_file.setnchannels(2)
        wave_file.setsampwidth(2)
        wave_file.setframerate(SAMPLE_RATE)
        wave_file.writeframes(samples)


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parents[1]
    public_directory = project_root / "public"
    destination = public_directory / "remotion/maiah-score.wav"
    render_score(destination, public_directory)
    print(f"Generated {destination}")
