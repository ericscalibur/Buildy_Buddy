# WhatsApp Group Digest Bot — OpenClaw Setup Guide

## Overview

This guide sets up an OpenClaw agent on your Mac Mini that silently reads all messages in your WhatsApp group and posts a single daily summary at a time you choose. The bot uses your dedicated phone number via WhatsApp (paired through WhatsApp Web/Baileys), and is configured as a **read-only observer** that only speaks once per day.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Mac Mini (always on)                            │
│                                                  │
│  ┌──────────────────────────────────┐            │
│  │  OpenClaw Gateway (daemon)       │            │
│  │                                  │            │
│  │  ┌────────────┐  ┌───────────┐  │            │
│  │  │ WhatsApp   │  │  "digest" │  │            │
│  │  │ Channel    │──│   Agent   │  │            │
│  │  │ (Baileys)  │  │           │  │            │
│  │  └────────────┘  └───────────┘  │            │
│  │                                  │            │
│  │  ┌────────────────────────┐     │            │
│  │  │  Cron Job              │     │            │
│  │  │  "Daily Summary"       │     │            │
│  │  │  Runs at SUMMARY_TIME  │──────── posts ──►│ WhatsApp Group
│  │  └────────────────────────┘     │            │
│  └──────────────────────────────────┘            │
└──────────────────────────────────────────────────┘
```

**How it works:**

1. The WhatsApp channel (Baileys bridge) connects your dummy phone number and joins the group.
2. The agent is set to **"always" mode** for the group — it wakes on every message but is instructed to return `NO_REPLY` every time.
3. OpenClaw buffers unread group messages as context (configurable, default 50).
4. A **cron job** fires once daily at your chosen time, triggers the agent in an isolated session, asks it to summarize the day's conversation, and **announces** the result back into the group.

---

## Step 1: Install OpenClaw

```bash
# Install OpenClaw
brew install openclaw/tap/openclaw

# Run onboarding (sets up the gateway, workspace, and daemon)
openclaw onboard --install-daemon
```

The daemon ensures the gateway stays running in the background on your Mac Mini. Verify it's up:

```bash
openclaw status
```

---

## Step 2: Connect WhatsApp

Install the WhatsApp channel plugin and pair your dummy number:

```bash
# Install the WhatsApp plugin
openclaw plugins install @openclaw/whatsapp

# Start the pairing flow (will show a QR code)
openclaw channels login whatsapp
```

Open WhatsApp on your dummy phone → Settings → Linked Devices → Link a Device → scan the QR code.

Verify the connection:

```bash
openclaw channels status whatsapp
```

---

## Step 3: Get Your Group's JID

Once connected, you need the WhatsApp group's JID (the internal group identifier). You can find it by checking your groups:

```bash
openclaw channels groups whatsapp
```

The JID will look something like `120363001234567890@g.us`. Note this down — you'll use it in the config.

---

## Step 4: Create the Digest Agent

Create a dedicated workspace and agent for the digest bot:

```bash
mkdir -p ~/.openclaw/workspace-digest
```

### Agent System Prompt

Create the agent's instruction file:

```bash
cat > ~/.openclaw/workspace-digest/AGENTS.md << 'AGENTS'
# Digest Bot

You are a group chat digest bot. Your job is to summarize conversations, not participate in them.

## Standing Orders

### Program: Daily Digest
- **Scope**: Summarize the day's group messages into a concise, readable digest.
- **Triggers**: Cron job only. Never respond to individual messages.
- **Format**: See Digest Format below.
- **Escalation**: If fewer than 5 messages were sent, post a brief "Quiet day" note instead of a full summary.

### What NOT to Do
- NEVER respond to individual messages in the group.
- NEVER engage in conversation, banter, or react to messages.
- NEVER reply to questions, even if directly asked (unless from the admin via DM).
- NEVER share opinions, commentary, or editorializing beyond neutral summarization.
- For every regular group message, return the silent token: `NO_REPLY`

### Admin DM Access
- The admin (see config) may DM you directly for status checks or to adjust behavior.
- Only respond to DMs from the admin. All other DMs: `NO_REPLY`

## Digest Format

When triggered by the cron job, produce a summary in this structure:

```
📋 *Daily Digest — {date}*

📌 *Key Topics*
• [Topic 1]: Brief summary of the discussion
• [Topic 2]: Brief summary of the discussion

📅 *Events & Plans*
• [Any upcoming events, meetups, or plans mentioned]

🔗 *Links & Resources*
• [Any links shared, with brief context]

💬 *Highlights*
• [Notable messages, announcements, or funny moments — keep it brief]

📊 {X} messages from {Y} members today.
```

If it was a quiet day (fewer than 5 messages):

```
📋 *Daily Digest — {date}*

Quiet day — only {X} messages. Nothing major to report. ✌️
```

### Summarization Guidelines
- Be concise. Each bullet should be 1-2 sentences max.
- Group related messages into topics rather than listing every message.
- Attribute key points to the person who said them when relevant.
- Capture the *substance*, not the small talk.
- If there's a heated discussion, summarize both sides neutrally.
- Preserve any action items or decisions that were made.
AGENTS
```

---

## Step 5: Configure OpenClaw

Edit your main config file at `~/.openclaw/openclaw.json`:

```jsonc
{
  "provider": "anthropic",           // or "openai", whichever you prefer
  "model": "claude-sonnet-4-6",      // good balance of quality and speed for summaries

  // ── Agents ──────────────────────────────────────────
  "agents": {
    "default": "main",
    "list": [
      {
        "id": "main",
        "workspace": "~/.openclaw/workspace"
      },
      {
        "id": "digest",
        "workspace": "~/.openclaw/workspace-digest"
      }
    ],
    "defaults": {
      "sandbox": {
        "mode": "non-main"           // sandbox non-DM sessions for safety
      }
    }
  },

  // ── Bindings (route the group to the digest agent) ──
  "bindings": [
    {
      "match": {
        "channel": "whatsapp",
        "peer": {
          "kind": "group",
          "id": "YOUR_GROUP_JID_HERE"  // ← replace with your group's JID
        }
      },
      "agentId": "digest"
    }
  ],

  // ── WhatsApp Channel Config ─────────────────────────
  "channels": {
    "whatsapp": {
      "dmPolicy": "allowlist",
      "allowFrom": [
        "+1XXXXXXXXXX"               // ← your personal number (admin DM access)
      ],
      "groupPolicy": "allowlist",
      "groupAllowFrom": [
        "YOUR_GROUP_JID_HERE"        // ← same group JID
      ],
      "groups": {
        "YOUR_GROUP_JID_HERE": {
          "requireMention": false     // agent sees ALL messages, not just mentions
        }
      },
      "historyBuffer": 200           // buffer more messages for richer summaries
    }
  },

  // ── Cron ────────────────────────────────────────────
  "cron": {
    "enabled": true,
    "maxConcurrentRuns": 1,
    "retry": {
      "maxAttempts": 3,
      "backoffMs": [60000, 120000, 300000],
      "retryOn": ["rate_limit", "overloaded", "network", "server_error"]
    }
  }
}
```

**Replace these placeholders:**

| Placeholder | What to put |
|---|---|
| `YOUR_GROUP_JID_HERE` | Your group's JID from Step 3 (e.g., `120363001234567890@g.us`) |
| `+1XXXXXXXXXX` | Your personal phone number in E.164 format (for admin DM access) |

---

## Step 6: Add the Cron Job

Schedule the daily summary. Adjust the time and timezone to your preference:

```bash
openclaw cron add \
  --name "daily-digest" \
  --cron "0 20 * * *" \
  --tz "America/New_York" \
  --session isolated \
  --message "It is now time for the daily digest. Review all group messages from today and produce the daily summary following your Digest Format instructions. Include today's date." \
  --announce \
  --channel whatsapp \
  --to "group:YOUR_GROUP_JID_HERE"
```

**Breaking this down:**

| Flag | Purpose |
|---|---|
| `--cron "0 20 * * *"` | Runs at 8:00 PM daily. Change to your preferred time. |
| `--tz "America/New_York"` | Your timezone. Use any IANA timezone string. |
| `--session isolated` | Fresh session each run — no carryover from previous days. |
| `--message "..."` | The prompt sent to the agent to trigger summarization. |
| `--announce` | Posts the agent's response to the group chat. |
| `--channel whatsapp` | Deliver via WhatsApp. |
| `--to "group:..."` | Target the specific group. |

### Verify the Job

```bash
# List all cron jobs
openclaw cron list

# Test it immediately (dry run)
openclaw cron run daily-digest
```

---

## Step 7: Common Time Presets

Some cron expressions for common schedules:

| Schedule | Cron Expression |
|---|---|
| Every day at 8 PM | `0 20 * * *` |
| Every day at 9 AM | `0 9 * * *` |
| Twice daily (9 AM + 9 PM) | `0 9,21 * * *` |
| Weekdays only at 6 PM | `0 18 * * 1-5` |
| Every 12 hours | `0 */12 * * *` |

To run the digest **twice daily**, add a second cron job with a different name:

```bash
openclaw cron add \
  --name "morning-digest" \
  --cron "0 9 * * *" \
  --tz "America/New_York" \
  --session isolated \
  --message "Morning digest time. Summarize all group messages from the past 12 hours." \
  --announce \
  --channel whatsapp \
  --to "group:YOUR_GROUP_JID_HERE"
```

---

## Maintenance & Troubleshooting

### Useful Commands

```bash
# Check gateway and channel health
openclaw status
openclaw channels status whatsapp
openclaw doctor

# View cron job history
openclaw cron runs --id daily-digest

# Manually trigger a summary right now
openclaw cron run daily-digest

# Update the cron schedule
openclaw cron remove daily-digest
# Then re-add with new --cron expression

# Re-pair WhatsApp if disconnected
openclaw channels login whatsapp
```

### If the Bot Gets Disconnected

WhatsApp Web sessions can expire. If the bot stops receiving messages:

1. Check status: `openclaw channels status whatsapp`
2. Re-pair: `openclaw channels login whatsapp` and scan the QR code again
3. Verify the group is still being tracked: `openclaw channels groups whatsapp`

### Adjusting the Summary Style

Edit `~/.openclaw/workspace-digest/AGENTS.md` to change the digest format, tone, or rules. Changes take effect on the next cron run (isolated sessions reload the workspace each time).

### Keeping Your Mac Mini Running

Since this runs as a daemon on your Mac Mini, make sure:

- **Energy Saver**: Prevent the Mac from sleeping (System Settings → Energy Saver → Prevent automatic sleeping)
- **Auto-login**: Set the Mac to auto-login after power outages
- **Gateway daemon**: Confirm it's set to launch at login (`openclaw onboard --install-daemon` handles this)

---

## Security Notes

- Your WhatsApp credentials are stored locally at `~/.openclaw/credentials/whatsapp/`
- The digest agent runs in a sandbox with restricted tool access (no filesystem, no browser)
- Only your personal number has DM access to the bot
- Group sessions are fully isolated from your main agent session
- All data stays on your Mac Mini — nothing is sent to OpenClaw's servers
