# Sounds (optional)

## Asterisk — Venus busy queue

| File | Purpose |
|------|---------|
| `consultant_busy.wav` | Played to PSTN callers when Venus is on another call (deploy copies to `/var/lib/asterisk/sounds/custom/consultant-busy.wav`) |

Mono **8 kHz** WAV recommended.

## Browser UI tones

Place **WAV** files here so the app can play ringback and status tones. Paths are served as `/sounds/<filename>`.

| File | When |
|------|------|
| `incoming-ring.wav` | **Inbound** call ringing in the browser (loops until accept/reject) |
| `ringback.wav` | Outbound call ringing; also used as fallback if `incoming-ring.wav` is missing |
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

If WAV files are missing, inbound calls still use a **built-in two-tone ring** in the browser. For a custom sound, add `incoming-ring.wav` (mono, ~2–4 s loop-friendly).

**Autoplay:** Click anywhere on the page once (or use **Test Mic**) so the browser allows ring audio.

## Double ringback

If you hear Asterisk/carrier ringback **and** this file at once, remove `ringback.wav` or shorten your dialplan early media — only one ringback layer is usually desired.
