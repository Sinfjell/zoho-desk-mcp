# Zoho Desk MCP Server — Design Spec

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

A standalone TypeScript MCP server that gives Claude Code direct access to Zoho Desk. Registered globally in `~/.claude/settings.json` so it is available in every Claude Code session. Enables reading tickets and contacts, creating internal notes and draft replies, and updating ticket status — without ever publishing or automatically sending anything to a customer.

---

## Project Location

```
~/repositories/zoho-desk-mcp/
```

GitHub repo: `sinfjell/zoho-desk-mcp`

---

## Architecture

```
~/repositories/zoho-desk-mcp/
├── src/
│   ├── index.ts          # MCP server entry point, tool registration, stdio transport
│   ├── auth.ts           # Token refresh logic + cache (~/.zoho-desk-token.json)
│   ├── client.ts         # Zoho Desk API wrapper (typed fetch functions)
│   └── tools/
│       ├── tickets.ts    # get_ticket, list_my_tickets, search_tickets
│       ├── contacts.ts   # get_contact
│       ├── comments.ts   # get_thread, create_internal_note, create_draft_reply
│       └── status.ts     # update_ticket_status
├── .env                  # Credentials for local dev (gitignored)
├── .env.example          # Documents required vars (no values)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Build & Runtime

- **MCP SDK:** `@modelcontextprotocol/sdk` (latest stable)
- **Module format:** ESM (`"type": "module"` in package.json, `"module": "NodeNext"` in tsconfig)
- **Target:** Node.js 22+
- **Output:** `dist/` directory
- **MCP transport:** `stdio` (Claude Code spawns the process and communicates over stdin/stdout)

**tsconfig.json key settings:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true
  }
}
```

**package.json scripts:**
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  }
}
```

`tsx` is used for development (no build step needed, instant restarts). `tsc` produces the production build.

---

## Authentication

- **Method:** OAuth 2.0 with refresh token (server-side, no user interaction)
- **Token cache:** `~/.zoho-desk-token.json` — stores current access token + expiry timestamp
  - Path resolved via `os.homedir()` (not `process.env.HOME`) for correctness
  - File permissions hardened to `600` on write: `fs.chmodSync(path, 0o600)`
  - This is a personal single-user tool; concurrent multi-session race conditions are not a concern for this use case

**Flow:**
1. On first tool call: check `~/.zoho-desk-token.json`
2. If missing or expiry timestamp is in the past: POST to `https://accounts.zoho.com/oauth/v2/token` with refresh token
3. Write new access token + `Date.now() + 3500000` (58 min, conservative) to cache file with `chmod 600`
4. Subsequent calls within the hour use cached token directly

**Required environment variables:**
```
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_DESK_ORG_ID=
ZOHO_DESK_DEPARTMENT_ID=
ZOHO_AGENT_ID=
```

**Environment variable usage:**
| Variable | Used in |
|---|---|
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` | `auth.ts` — token refresh |
| `ZOHO_DESK_ORG_ID` | All API calls — sent as `orgId` header |
| `ZOHO_DESK_DEPARTMENT_ID` | `list_my_tickets`, `search_tickets` — scopes to department |
| `ZOHO_AGENT_ID` | `list_my_tickets` — `assignee` query parameter to filter "my" tickets |

**`.env` vs runtime env:** `.env` is loaded via `dotenv/config` imported at the top of `index.ts` for local development. When the server runs via the `mcpServers` block in `~/.claude/settings.json`, Claude Code injects the env vars directly. The `mcpServers` env block is the canonical runtime source; `.env` is for `npm run dev` only.

**Token error handling:** If refresh fails, return a named MCP error `ZohoAuthError` with the message: `"Zoho auth failed — the refresh token may have expired. Regenerate it at: https://api-console.zoho.com"`. Never silently return empty results.

---

## MCP Tools

All API calls include the header `orgId: {ZOHO_DESK_ORG_ID}`.

---

### Read Tools

#### `get_ticket`
Fetch full ticket details by ticket ID or Zoho Desk URL.

**API:** `GET https://desk.zoho.com/api/v1/tickets/{ticketId}?include=contacts,assignee`

**Input:**
```ts
{ ticketId: string }  // accepts numeric ID or full Zoho Desk URL (URL parsed server-side)
```

**Output:**
```ts
{
  id: string
  ticketNumber: string
  subject: string
  description: string       // HTML stripped to plain text via `html-to-text` npm package
  status: string
  priority: string
  contactId: string
  contactName: string
  contactEmail: string
  accountName: string
  departmentId: string
  assigneeId: string | null
  assigneeName: string | null
  createdTime: string       // ISO 8601
  modifiedTime: string
  webUrl: string
}
```

---

#### `list_my_tickets`
List open tickets assigned to the authenticated agent in the configured department.

**API:** `GET https://desk.zoho.com/api/v1/tickets`

**Zoho query parameters used:**
| Param | Value |
|---|---|
| `assignee` | `ZOHO_AGENT_ID` |
| `departmentId` | `ZOHO_DESK_DEPARTMENT_ID` |
| `status` | from input (default: `"Open"`) |
| `from` | from input (default: `1`) |
| `limit` | from input (default: `20`, max: `50`) |
| `include` | `"contacts,assignee"` |

**Input:**
```ts
{
  status?: string   // default: "Open"
  limit?: number    // default: 20, max: 50
  from?: number     // pagination offset, default: 1
}
```

**Output:**
```ts
{
  tickets: Array<{
    id: string
    ticketNumber: string
    subject: string
    status: string
    priority: string
    contactName: string
    modifiedTime: string
    webUrl: string
  }>
  total: number
}
```

---

#### `search_tickets`
Search tickets by keyword or contact email, scoped to the configured department.

**API:** `GET https://desk.zoho.com/api/v1/tickets/search`

**Validation:** At least one of `query` or `contactEmail` must be provided. If both are omitted, return a validation error without calling the API.

**Zoho query parameters used:**
| Param | Value |
|---|---|
| `_all` | from `query` input (wildcard search across all fields) |
| `email` | from `contactEmail` input (exact match on contact email) |
| `status` | from input (optional) |
| `departmentId` | `ZOHO_DESK_DEPARTMENT_ID` |
| `from` | from input (default: `1`) |
| `limit` | from input (default: `20`) |

**Input:**
```ts
{
  query?: string          // keyword search — maps to Zoho `_all` parameter
  contactEmail?: string   // exact match on contact email — maps to Zoho `email` parameter
  status?: string         // optional status filter
  limit?: number          // default: 20
  from?: number           // default: 1
}
```

**Output:** Same shape as `list_my_tickets`.

---

#### `get_contact`
Fetch contact details by contact ID.

**API:** `GET https://desk.zoho.com/api/v1/contacts/{contactId}?include=accounts`

**Input:**
```ts
{ contactId: string }
```

**Output:**
```ts
{
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  mobile: string | null
  accountName: string | null
  accountId: string | null
  description: string | null
  createdTime: string
}
```

---

#### `get_thread`
Fetch the full comment and email thread for a ticket in chronological order.

**Implementation:** Calls two Zoho endpoints in parallel:
- `GET /api/v1/tickets/{ticketId}/threads` — email threads (inbound/outbound messages)
- `GET /api/v1/tickets/{ticketId}/comments` — internal notes

Results are merged into a single array sorted ascending by `createdTime`.
HTML content is stripped to plain text using the `html-to-text` npm package.

**Input:**
```ts
{ ticketId: string }
```

**Output:**
```ts
{
  entries: Array<{
    id: string
    type: "emailThread" | "comment"
    direction: "in" | "out" | null   // null for internal comments
    isPublic: boolean
    content: string                  // HTML stripped to plain text
    fromName: string
    fromEmail: string | null
    createdTime: string              // ISO 8601 — sort key
  }>
}
```

---

### Write Tools

#### `create_internal_note`
Create an internal note on a ticket. Visible to agents only — **never sent to the customer**.

**API:** `POST https://desk.zoho.com/api/v1/tickets/{ticketId}/comments`

**Body:**
```json
{ "content": "...", "isPublic": false }
```

`isPublic` is hardcoded to `false` in `client.ts`. There is no input parameter to override it.

**Input:**
```ts
{
  ticketId: string
  content: string   // plain text or HTML
}
```

**Output:**
```ts
{
  id: string
  content: string
  createdTime: string
  isPublic: false
}
```

**Tool description (shown to Claude):** "Creates an internal agent note on a ticket. This is NOT sent to the customer and is only visible to agents."

---

#### `create_draft_reply`
Create a draft email reply on a ticket. Saved as draft — **not sent until manually triggered in the Zoho Desk UI**.

**API:** `POST https://desk.zoho.com/api/v1/tickets/{ticketId}/draftReply`

The endpoint is confirmed in the official Zoho Desk OpenAPI Specification (`github.com/zoho/zohodesk-oas`). It is distinct from `POST /sendEmailReply` which sends immediately.

**Input:**
```ts
{
  ticketId: string
  content: string   // reply body, HTML supported
}
```

**Output:**
```ts
{
  threadId: string
  content: string
  createdTime: string
}
```

**Tool description (shown to Claude):** "Creates a draft email reply on a ticket. This will NOT be sent until you manually send it from the Zoho Desk UI."

---

#### `update_ticket_status`
Change the status of a ticket.

**API:** `PATCH https://desk.zoho.com/api/v1/tickets/{ticketId}`

**Body:**
```json
{ "status": "..." }
```

**Input:**
```ts
{
  ticketId: string
  status: "Open" | "On Hold" | "Closed" | "In Progress"
}
```

**Output:**
```ts
{
  id: string
  status: string   // confirmed new status from Zoho response
}
```

---

## Error Handling

| Error type | MCP error name | Behavior |
|---|---|---|
| Auth failure | `ZohoAuthError` | Message includes link to https://api-console.zoho.com |
| 404 Not Found | `ZohoNotFoundError` | Includes resource type and ID |
| 429 Rate Limited | `ZohoRateLimitError` | Includes `retryAfter` seconds if in response headers |
| Input validation failure | `ZohoValidationError` | Clear message (e.g. "query or contactEmail required") |
| Other API errors | `ZohoApiError` | HTTP status + Zoho error message |

Never silently return empty results on error.

---

## MCP Registration

Added to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "zoho-desk": {
      "command": "node",
      "args": ["/Users/sinfjell/repositories/zoho-desk-mcp/dist/index.js"],
      "env": {
        "ZOHO_CLIENT_ID": "...",
        "ZOHO_CLIENT_SECRET": "...",
        "ZOHO_REFRESH_TOKEN": "...",
        "ZOHO_DESK_ORG_ID": "...",
        "ZOHO_DESK_DEPARTMENT_ID": "...",
        "ZOHO_AGENT_ID": "..."
      }
    }
  }
}
```

---

## README Contents

The README will document:
- What the server does and all 8 tools with descriptions
- Prerequisites: Node.js 22+, Zoho Desk account with API access
- Setup: clone → `npm install` → `npm run build` → configure `.env` or `settings.json`
- Where to find each env var value (Zoho API Console, Zoho Desk settings)
- How to register in Claude Code (`~/.claude/settings.json`)
- How to regenerate the Zoho refresh token (link to API Console)

---

## Out of Scope (V1)

- Sending/publishing replies (explicit exclusion — draft and internal note only)
- Attachment handling
- Webhook/push notifications
- Multi-org support
- UI of any kind
