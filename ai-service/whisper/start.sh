#!/bin/sh
set -eu

model_name=${WHISPER_MODEL:-base-q5_1}
case "$model_name" in
    base-q5_1)
        expected_sha256=422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898 ;;
    medium-q5_0)
        expected_sha256=19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f ;;
    *)
        echo "Unsupported WHISPER_MODEL; use base-q5_1 or medium-q5_0" >&2
        exit 1 ;;
esac
model="/models/ggml-${model_name}.bin"

if [ ! -s "$model" ] || ! echo "$expected_sha256  $model" | sha256sum -c - >/dev/null 2>&1; then
    tmp="${model}.download"
    trap 'rm -f "$tmp"' EXIT
    echo "Downloading Whisper model: $model_name"
    curl --fail --location --retry 5 --retry-delay 5 \
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/98aa99a0a9db05ae2342309f5096248665f7cba3/ggml-${model_name}.bin?download=true" \
        --output "$tmp"
    echo "$expected_sha256  $tmp" | sha256sum -c -
    mv "$tmp" "$model"
    trap - EXIT
fi

echo "Starting Whisper model: $model_name"
set -- whisper-server --model "$model" --host 0.0.0.0 --port 8080 \
    --language auto --threads "${WHISPER_THREADS:-2}" \
    --max-context 0 --no-fallback --beam-size 1 --best-of 1 \
    --tmp-dir /tmp/whisper --public /usr/share/whisper-public
if [ "${WHISPER_GPU:-false}" != "true" ]; then
    set -- "$@" --no-gpu
fi
exec "$@"
