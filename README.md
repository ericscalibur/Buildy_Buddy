# Buildy — WhatsApp Group Digest Bot

Silently monitors a WhatsApp group and posts a daily AI-generated summary at a scheduled time. Runs locally on a Mac Mini using Ollama (no cloud, no subscriptions).

---

## Requirements

- macOS (Mac Mini recommended — always on)
- Node.js 18+
- [Ollama](https://ollama.ai) running locally with a chat model pulled (e.g. `gemma4:latest`)
- A dedicated WhatsApp number (dummy phone) for the bot
- A [ntfy.sh](https://ntfy.sh) account/topic for push notifications (optional but recommended)

---

## Setup

### 1. Clone and build

```bash
git clone https://github.com/ericscalibur/Buildy_Buddy.git
cd Buildy_Buddy
npm install && npm run build
npm link
```

### 2. First-time setup

```bash
buildy onboard
```

This creates `~/.openclaw/digest-bot.json`, the digest workspace, and the `AGENTS.md` prompt.

### 3. Pair WhatsApp

```bash
buildy channels login whatsapp
```

Scan the QR code in WhatsApp → Settings → Linked Devices → Link a Device.

### 4. Get your group's JID

Add the dummy number to your WhatsApp group first, then:

```bash
buildy channels groups whatsapp
```

Copy the JID for your group (looks like `120363001234567890@g.us`).

### 5. Configure

Edit `~/.openclaw/digest-bot.json` and add the JID in three places:

```json
{
  "provider": "ollama",
  "model": "gemma4:latest",
  "adminNumber": "+1XXXXXXXXXX",
  "agents": {
    "default": "main",
    "list": [
      { "id": "main", "workspace": "~/.openclaw/workspace" },
      { "id": "digest", "workspace": "~/.openclaw/workspace-digest" }
    ]
  },
  "bindings": [
    {
      "match": {
        "channel": "whatsapp",
        "peer": { "kind": "group", "id": "YOUR_JID_HERE" }
      },
      "agentId": "digest"
    }
  ],
  "channels": {
    "whatsapp": {
      "groupPolicy": "allowlist",
      "groupAllowFrom": ["YOUR_JID_HERE"],
      "groups": {
        "YOUR_JID_HERE": { "requireMention": false }
      },
      "historyBuffer": 200
    }
  }
}
```

Replace `YOUR_JID_HERE` with your actual group JID and `+1XXXXXXXXXX` with your personal number (for admin DM access).

### 6. Add the daily cron job

```bash
buildy cron add \
  --name daily-digest \
  --cron "0 20 * * *" \
  --tz "America/El_Salvador" \
  --session isolated \
  --message "It is now time for the daily digest. Review all group messages from today and produce the daily summary following your Digest Format instructions. Include today's date." \
  --announce \
  --channel whatsapp \
  --to "group:YOUR_JID_HERE"
```

Adjust `--cron` and `--tz` to your preferred time and timezone (uses IANA timezone strings).

### 7. Install the daemon (auto-start on boot)

```bash
buildy onboard --install-daemon
```

### 8. Start

```bash
buildy gateway start
```

Or let the daemon handle it automatically after the install step.

---

## Commands

```bash
# Gateway
buildy gateway start              # Start in foreground
buildy status                     # Check gateway + WhatsApp status

# WhatsApp
buildy channels login whatsapp    # Re-pair QR code
buildy channels status whatsapp   # Connection status
buildy channels groups whatsapp   # List groups + JIDs

# Cron
buildy cron list                  # List all jobs
buildy cron run daily-digest      # Trigger manually
buildy cron runs --id daily-digest # Run history
buildy cron remove daily-digest   # Remove a job

# Testing
buildy test-digest                # Test agent with fake messages (no WhatsApp needed)

# Diagnostics
buildy doctor                     # Health check
```

---

## Adding a new group

1. Add the dummy number to the new WhatsApp group
2. `buildy channels groups whatsapp` — get the new JID
3. Add the new JID to `~/.openclaw/digest-bot.json` in `groupAllowFrom`, `groups`, and `bindings`
4. Remove and re-add the cron job with the new JID:

```bash
buildy cron remove daily-digest
buildy cron add --name daily-digest --cron "0 20 * * *" --tz "America/El_Salvador" \
  --session isolated \
  --message "It is now time for the daily digest. Review all group messages from today and produce the daily summary following your Digest Format instructions. Include today's date." \
  --announce --channel whatsapp --to "group:NEW_JID_HERE"
```

---

## Push notifications (ntfy.sh)

Buildy sends a push notification when WhatsApp disconnects or the gateway stops.

1. Download the [ntfy app](https://ntfy.sh) on your phone
2. Subscribe to your topic (e.g. `buildy-bies-alert`) with **Instant delivery in doze mode** checked
3. The topic is hardcoded in `src/channels/whatsapp/index.ts` and `src/gateway.ts` — update it to match yours

To test:
```bash
curl -d "test" https://ntfy.sh/your-topic-name
```

---

## WhatsApp session expired

If Buildy stops buffering messages or `buildy status` shows `qr`:

```bash
launchctl stop com.openclaw.gateway
buildy channels login whatsapp     # scan QR again
launchctl start com.openclaw.gateway
```

---

## Config files

| File | Purpose |
|---|---|
| `~/.openclaw/digest-bot.json` | Main config (provider, model, groups, bindings) |
| `~/.openclaw/crons.json` | Scheduled jobs |
| `~/.openclaw/workspace-digest/AGENTS.md` | Bot personality and digest format |
| `~/.openclaw/buildy-credentials/whatsapp/` | WhatsApp session credentials |
| `~/.openclaw/buffers/<jid>.json` | Buffered group messages |
| `~/.openclaw/logs/` | Gateway logs |

---

## Coexisting with another OpenClaw instance

Buildy is intentionally isolated from any existing OpenClaw installation:

- Uses `digest-bot.json` instead of `openclaw.json`
- Stores credentials in `buildy-credentials/` instead of `credentials/`
- API runs on port `7331` (existing OpenClaw typically uses `18789`)
- CLI binary is `buildy`, not `openclaw`
