#!/bin/sh
set -eu

envsubst '${VITE_GOOGLE_MAPS_API_KEY}' \
  < /usr/share/nginx/html/runtime-config.js.template \
  > /usr/share/nginx/html/runtime-config.js
