# Call UI sounds (optional)

Place **WAV** files here so the app can play ringback and status tones. Paths are served as `/sounds/<filename>`.

| File | When |
|------|------|
| `ringback.wav` | Outbound call ringing (loops until answered or end) |
| `busy.wav` | SIP 486 / 603 (busy / declined) |
| `congestion.wav` | SIP 480 / 503 / 404 (unavailable / error) |
| `disconnect.wav` | Normal hangup or other cases |

## Copy from Asterisk (example)

```bash
# On the Asterisk server — use .wav packs if available; convert .gsm with sox if needed
sudo mkdir -p /path/to/crazytel_calling_fe/public/sounds
sudo cp /usr/share/asterisk/sounds/en/userm_busy.wav /path/to/fe/public/sounds/busy.wav
# Or pick closest matches from /usr/share/asterisk/sounds/en/
```

If a file is missing, the browser ignores failed `play()`; calls still work.

## Double ringback

If you hear Asterisk/carrier ringback **and** this file at once, remove `ringback.wav` or shorten your dialplan early media — only one ringback layer is usually desired.
