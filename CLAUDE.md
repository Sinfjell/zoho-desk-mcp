# zoho-desk-mcp

Personal MCP server for reading and triaging Zoho Desk tickets (Simplylearn /
MentorKit). Stdio transport — Claude Code starts it as
`node ~/repositories/zoho-desk-mcp/dist/index.js` (registered in `~/.claude.json`).

## Build & run

```bash
npm run build   # tsc → dist/
npm test        # node:test over the pure parsers
```

`dist/` is gitignored and loaded once at session start: **after merging, rebuild and
restart the Claude Code session**, or the old binary keeps serving.

## Invariants

1. **Internal notes are never customer-visible.** `createInternalNote` hardcodes
   `isPublic: false`. This must never become a parameter.
2. **Replies are drafts, never sends.** `createDraftReply` posts to `/draftReply`.
   Nothing in this server may call a Zoho endpoint that delivers mail to a customer.
3. **Read tools never mutate.** `get_*` and `search_*` issue GET only.
4. **Never pass off a partial conversation as complete.** Zoho paginates lists and can
   truncate bodies (`isContentTruncated`). Both are surfaced — `complete` on the thread
   result and `contentTruncatedByZoho` per entry. Silently dropping either is the bug
   TSK-19950 existed to fix; do not reintroduce it.
5. **Secrets stay in `.env`.** Never log the access token, refresh token or client
   secret, and never commit `.env` or `~/.zoho-desk-token.json`.

## API gotchas

Zoho Desk's list endpoints are not thin versions of the detail endpoints — they omit
fields entirely. See the addendum in
`docs/superpowers/specs/2026-03-17-zoho-desk-mcp-design.md` for the endpoint-by-endpoint
map. The short version:

- Thread bodies exist **only** on `GET /tickets/{id}/threads/{threadId}`.
- Senders are `author.*` on threads, `commenter.*` on comments.
- Comments timestamp with `commentedTime`, not `createdTime`.
- A ticket's `description` is `null` on email tickets.
- `/tickets/{id}/attachments` is empty — attachments hang off threads.
- Attachment downloads are served as `text/html` whatever the real type is; trust the
  filename extension instead.
