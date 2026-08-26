# Audio Test Fixtures

This directory contains audio fixtures for E2E STT (Speech-to-Text) testing.

## Fixtures

### `pt-clean-sample.ogg`

- **Language:** Portuguese (PT-BR)
- **Duration:** ~10 seconds
- **Quality:** Clean audio, no background noise
- **Content:** "Qual o horário de atendimento da empresa?"
- **Source:** Generated via TTS (text-to-speech) for reproducibility
- **Sample Rate:** 16kHz (WhatsApp voice message standard)
- **Codec:** Opus in Ogg container (WhatsApp format)

**Expected Transcription:** Defined in `pt-clean-expected.json`

## Usage in Tests

Tests use these fixtures to validate the STT flow:
1. Load audio buffer from `.ogg` file
2. Transcribe using Groq Whisper API (`whisper-large-v3`)
3. Calculate accuracy against expected transcription
4. Assert accuracy >= 90% and latency < 5000ms

## Environment Requirements

Tests require `GROQ_API_KEY` environment variable:

```bash
export GROQ_API_KEY=gsk_your_key_here
npm run test:e2e:stt
```

Without the key, tests skip gracefully with a warning (no failure).

## Graceful Skip Policy

If `GROQ_API_KEY` is not set or the `.ogg` file is missing, the test suite will skip with a console warning instead of failing. This prevents CI failures in environments without the API key configured.

## Audio Binary Note

The `.ogg` binary file (`pt-clean-sample.ogg`) should be committed alongside this README. If the file is too large for the repository or cannot be included, tests will skip automatically when the file is not found.

To generate a new fixture:
1. Use a TTS service (e.g., Google TTS, Azure TTS) to generate a Portuguese audio clip
2. Convert to Ogg/Opus format matching WhatsApp standards
3. Manually verify the transcription accuracy via Groq Whisper
4. Update `pt-clean-expected.json` with the verified transcription
