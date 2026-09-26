#!/bin/sh
set -eu

model=/models/ggml-medium-q5_0.bin
expected_sha256=19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f

if [ ! -s "$model" ] || ! echo "$expected_sha256  $model" | sha256sum -c - >/dev/null 2>&1; then
    tmp="${model}.download"
    trap 'rm -f "$tmp"' EXIT
    curl --fail --location --retry 5 --retry-delay 5 \
        'https://huggingface.co/ggerganov/whisper.cpp/resolve/98aa99a0a9db05ae2342309f5096248665f7cba3/ggml-medium-q5_0.bin?download=true' \
        --output "$tmp"
    echo "$expected_sha256  $tmp" | sha256sum -c -
    mv "$tmp" "$model"
    trap - EXIT
fi

set -- whisper-server --model "$model" --host 0.0.0.0 --port 8080 \
    --language auto --convert --threads "${WHISPER_THREADS:-4}" \
    --tmp-dir /tmp/whisper --public /usr/share/whisper-public
if [ "${WHISPER_GPU:-false}" != "true" ]; then
    set -- "$@" --no-gpu
fi
exec "$@"
