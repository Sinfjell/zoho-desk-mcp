import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEml } from "../src/eml.js";

const multipart = [
  "From: =?utf-8?B?VmltZW8=?= <vimeo@vimeo.com>",
  "To: kunde@example.no",
  'Subject: =?utf-8?Q?Viktig=3A_prisendring?=',
  "Date: Sat, 15 Aug 2026 10:01:47 +0000",
  'Content-Type: multipart/alternative; boundary="SEP"',
  "",
  "--SEP",
  "Content-Type: text/plain; charset=utf-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Planen din endres den 13=2E september=2E",
  "",
  "--SEP",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>ignorert til fordel for text/plain</p>",
  "--SEP--",
  "",
].join("\r\n");

test("parseEml decodes RFC 2047 headers", () => {
  const mail = parseEml(multipart);
  assert.equal(mail.headers.from, "Vimeo <vimeo@vimeo.com>");
  assert.equal(mail.headers.subject, "Viktig: prisendring");
  assert.equal(mail.headers.to, "kunde@example.no");
  assert.equal(mail.headers.cc, null);
});

test("parseEml prefers text/plain and decodes quoted-printable", () => {
  assert.equal(parseEml(multipart).body, "Planen din endres den 13. september.");
});

test("parseEml falls back to text/html rendered as text", () => {
  const raw = ["Subject: Kun HTML", "Content-Type: text/html; charset=utf-8", "", "<p>Hei <b>der</b></p>"].join("\r\n");
  assert.equal(parseEml(raw).body, "Hei der");
});

test("parseEml decodes base64 bodies", () => {
  const raw = [
    "Subject: B64",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from("Hei på deg", "utf-8").toString("base64"),
  ].join("\r\n");
  assert.equal(parseEml(raw).body, "Hei på deg");
});

test("parseEml lists nested attachment filenames", () => {
  const raw = [
    "Subject: Med vedlegg",
    'Content-Type: multipart/mixed; boundary="B"',
    "",
    "--B",
    "Content-Type: text/plain",
    "",
    "kropp",
    "--B",
    "Content-Type: application/pdf",
    'Content-Disposition: attachment; filename="faktura.pdf"',
    "",
    "JVBER",
    "--B--",
  ].join("\r\n");
  assert.deepEqual(parseEml(raw).attachmentNames, ["faktura.pdf"]);
});

test("parseEml handles a header-only message without throwing", () => {
  assert.equal(parseEml("Subject: Tom").headers.subject, "Tom");
});
