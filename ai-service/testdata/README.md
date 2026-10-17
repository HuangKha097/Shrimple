# Speech fixture

`jfk-2s.wav` is the 1–3 second excerpt of the public JFK inaugural speech sample
bundled in the official whisper.cpp v1.9.4 release:
https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.9.4/samples/jfk.wav

The excerpt is mono PCM16 little-endian, 16,000 Hz, without encoding changes.
It exercises the real pinned Silero model's voice-versus-silence behavior.
It is public demonstration audio, not a recorded user/call conversation.
