#!/usr/bin/env python3
"""
NVIDIA Riva Parakeet 1.1B Multilingual ASR Transcription Worker
Invoked via Node.js child_process.execFile with temporary WAV audio path.
Never receives API keys via CLI arguments; reads strictly from process environment.
"""

import sys
import os
import json
import wave

def main():
    if len(sys.argv) < 2:
        sys.stderr.write(json.dumps({"error": "Missing audio file argument"}) + "\n")
        sys.exit(2)

    wav_path = sys.argv[1]
    if not os.path.exists(wav_path):
        sys.stderr.write(json.dumps({"error": f"Audio file not found: {wav_path}"}) + "\n")
        sys.exit(2)

    api_key = os.environ.get("NVIDIA_API_KEY", "").strip()
    if not api_key:
        sys.stderr.write(json.dumps({"error": "NVIDIA_API_KEY environment variable is not set"}) + "\n")
        sys.exit(3)

    server_uri = os.environ.get("NVIDIA_RIVA_SERVER", "grpc.nvcf.nvidia.com:443").strip()
    function_id = os.environ.get("NVIDIA_RIVA_FUNCTION_ID", "71203149-d3b7-4460-8231-1be2543a1fca").strip()
    language_code = os.environ.get("NVIDIA_RIVA_LANGUAGE", "multi").strip()
    model_name = os.environ.get("NVIDIA_RIVA_MODEL", "").strip()

    # Read and validate WAV file metadata
    try:
        with wave.open(wav_path, "rb") as wf:
            channels = wf.getnchannels()
            sample_rate = wf.getframerate()
            sample_width = wf.getsampwidth()
    except Exception as e:
        sys.stderr.write(json.dumps({"error": f"Failed to parse WAV header: {str(e)}"}) + "\n")
        sys.exit(4)

    # Read raw audio bytes
    try:
        with open(wav_path, "rb") as f:
            audio_data = f.read()
    except Exception as e:
        sys.stderr.write(json.dumps({"error": f"Failed to read audio file: {str(e)}"}) + "\n")
        sys.exit(4)

    # Perform ASR via riva.client
    try:
        import riva.client
    except ImportError:
        sys.stderr.write(json.dumps({"error": "nvidia-riva-client is not installed in Python environment"}) + "\n")
        sys.exit(5)

    try:
        auth = riva.client.Auth(
            uri=server_uri,
            use_ssl=True,
            metadata_args=[
                ["function-id", function_id],
                ["authorization", f"Bearer {api_key}"]
            ]
        )
        asr_service = riva.client.ASRService(auth)

        config_kwargs = {
            "encoding": riva.client.AudioEncoding.LINEAR_PCM,
            "sample_rate_hertz": sample_rate,
            "audio_channel_count": channels,
            "max_alternatives": 1,
            "enable_automatic_punctuation": True,
            "language_code": language_code
        }
        if model_name:
            config_kwargs["model"] = model_name

        config = riva.client.RecognitionConfig(**config_kwargs)

        response = asr_service.offline_recognize(audio_data, config)

        transcripts = []
        if response and response.results:
            for result in response.results:
                if result.alternatives:
                    text = result.alternatives[0].transcript.strip()
                    if text:
                        transcripts.append(text)

        final_transcript = " ".join(transcripts).strip()
        sys.stdout.write(json.dumps({"transcript": final_transcript}) + "\n")
        sys.exit(0)
    except Exception as e:
        sys.stderr.write(json.dumps({"error": f"Riva ASR transcription failed: {str(e)}"}) + "\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
