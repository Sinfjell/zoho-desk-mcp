import { test } from "node:test";
import assert from "node:assert/strict";
import { contentFingerprint, parseTicketId, toCleanText } from "../src/utils.js";

test("parseTicketId accepts agent URLs, support URLs and bare IDs", () => {
  assert.equal(
    parseTicketId("https://help.simplylearn.com/agent/simplylearn/mentorkit/tickets/details/82724000007120001"),
    "82724000007120001"
  );
  assert.equal(parseTicketId("https://desk.zoho.eu/support/x/ShowHomePage.do#Cases/tickets/12345"), "12345");
  assert.equal(parseTicketId("  82724000007120001 "), "82724000007120001");
});

test("toCleanText cuts an Outlook-style quoted chain at the Fra: header", () => {
  const html = `<div>Hei igjen!</div><hr/><div><b>Fra:</b> Someone &lt;a@b.no&gt;<br/><b>Sendt:</b> torsdag<br/></div><div>Gammel melding som gjentas</div>`;
  const { text, trimmed } = toCleanText(html);
  assert.equal(trimmed, true);
  assert.match(text, /Hei igjen!/);
  assert.doesNotMatch(text, /Gammel melding/);
});

test("toCleanText cuts at a blockquote", () => {
  const { text } = toCleanText(`<div>Nytt svar</div><blockquote>gammelt sitat</blockquote>`);
  assert.equal(text, "Nytt svar");
});

test("toCleanText cuts at an 'On ... wrote:' line with no distinctive markup", () => {
  const { text } = toCleanText(`<div>Svar her<br/><br/>On Mon, 1 Jan 2026 at 10:00, Ola Nordmann wrote:<br/>gammelt</div>`);
  assert.match(text, /Svar her/);
  assert.doesNotMatch(text, /gammelt/);
});

test("toCleanText drops the separator rule left behind by the cut", () => {
  const { text } = toCleanText(`<div>Kort svar</div><hr/><div><b>From:</b> x<br/><b>Sent:</b> y</div><div>old</div>`);
  assert.doesNotMatch(text, /[-_=]{4,}\s*$/);
  assert.equal(text, "Kort svar");
});

test("toCleanText keeps the body when the marker is at the very top", () => {
  const html = `<blockquote>alt er sitat</blockquote>`;
  const { text, trimmed } = toCleanText(html);
  assert.equal(trimmed, false);
  assert.match(text, /alt er sitat/);
});

test("toCleanText leaves an unquoted message untouched", () => {
  const { text, trimmed } = toCleanText(`<div>Bare en melding</div>`);
  assert.equal(trimmed, false);
  assert.equal(text, "Bare en melding");
});

test("contentFingerprint is whitespace- and case-insensitive", () => {
  assert.equal(contentFingerprint("Hei   \n Igjen"), contentFingerprint("hei igjen"));
});
