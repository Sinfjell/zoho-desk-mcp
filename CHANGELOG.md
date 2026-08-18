# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- `get_ticket_context` — one call returns ticket metadata, every message with its
  real body, internal notes and an attachment index. This is the tool to reach for
  when you need to understand a ticket from just an ID or URL.
- `get_attachment` — reads the contents of a ticket attachment. Text formats are
  decoded, `.eml` files are parsed into headers plus body (so forwarded mails are
  finally readable), and binary files are reported as unreadable rather than
  returned as noise.
- Quoted-reply stripping on `get_thread` / `get_ticket_context`. Every mail in a
  Zoho thread repeats the whole prior conversation inline; each message is now cut
  at its quote boundary. Measured on ticket 1083: 8 569 → 3 309 characters (-61 %).
  Pass `includeQuoted: true` for the untouched bodies.
- Duplicate-thread collapsing. Zoho creates one thread per recipient address, so a
  mail sent to two support aliases lands twice. Same author + timestamp + opening
  text is collapsed into one entry with the sibling IDs kept in `duplicateIds`.
- Attachment metadata (`id`, `name`, `size`) on every thread and comment entry.
- Pagination on threads and comments, so tickets with more than 99 entries are no
  longer silently truncated.
- Unit tests (`npm test`) for the quote stripper, the ticket-ID parser and the
  `.eml` parser.

### Fixed

- **`get_thread` returned empty `content` and `"Unknown"` for every email.** The
  code read `content` and `from` off the thread *list* endpoint, which carries
  neither. Bodies now come from the per-thread detail endpoint, and the sender is
  read from `author.name` / `author.email`.
- **Comment timestamps were always `undefined`**, because Zoho returns
  `commentedTime` on comments rather than `createdTime`. This also meant the
  chronological sort silently placed every comment first.
- `get_thread`, `create_internal_note` and `create_draft_reply` now accept a full
  Zoho Desk URL, not just a bare ticket ID.
- `.eml` messages whose headers are not followed by a blank line no longer lose
  every header.

### Changed

- `get_ticket` now also returns `accountName`, `departmentName`, `channel`,
  `language`, `threadCount` and `commentCount`. Its `description` field is `null`
  on email tickets — Zoho keeps the opening message in the first thread — and the
  tool description now says so and points to `get_ticket_context`.
