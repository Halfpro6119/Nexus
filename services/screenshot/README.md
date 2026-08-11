# Screenshot service

Deploy this folder to Cloud Run, then set its HTTPS URL as `SCREENSHOT_ENDPOINT`. The service validates targets, blocks private-network addresses, launches Chromium, and returns a PNG as base64 JSON.
