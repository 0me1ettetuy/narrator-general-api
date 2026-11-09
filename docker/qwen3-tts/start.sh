#!/bin/bash
# Run the stock tts-server entrypoint and the MP3 proxy; exit if either dies so Docker restarts the container.
./entrypoint.sh &
python3 /app/proxy.py &
wait -n
exit 1
