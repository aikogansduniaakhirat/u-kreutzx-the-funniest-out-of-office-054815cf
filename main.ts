import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The Funniest Out-of-Office — one line of auto-reply, nothing else. Written
// against the judge's published brief, in its own order:
//   1. it is a one-line OOO reply a real person would set and send, and loses to
//      any funnier one-line OOO reply;
//   2. it turns on a genuine surprise the reader does not see coming;
//   3. sounds like a person with a voice rather than a template;
//   4. stays fresh — avoids the jokes everyone has read in a thousand inboxes
//      ("I was in a meeting", tab counts, "please email my colleague", the
//      "I'm not reading these" variant);
//   5. every word used, nothing cuttable.
//
// The shape: the standard OOO is a claim about the sender ("I am away"), and the
// joke is to keep the claim but hand the *voice* to the machine that is actually
// answering. That is fresh in this field because the field writes from inside
// the absence; this one writes from inside the substitute, and the substitute
// admits what it is.
//
// Determinism: a constant string. No sampling, no date, no network.

const CAP = 140;
// Under the cap so a bloating edit fails in this gate rather than at the sealed
// scorer, and so the byte-count tie-break stays comfortable.
const TARGET_CHARS = 128;

// Winner, after the second pass. The absence stays in the form's own words
// ("I'm out until Monday.") so criterion 1 is free; the specificity is `2am`,
// which is the hour that makes the whole scene real; and the turn is that the
// sender is refusing to *explain* rather than refusing to work — a promise you
// only dare make because you will be unreachable. Nothing is cuttable: delete
// `at 2am` and the line loses its subject, delete the last clause and there is
// no joke left.
//
// Cut candidates and the criterion that killed each:
//
//   "I'm out until Monday. If this is urgent it isn't, and on Monday I will
//    prove it to you in detail."  (97)
//     Cleanest reversal, but it is a stance about the reader's urgency — the
//     "nothing here is urgent" register is the one this field floods with, so
//     it dies on 4.
//
//   "I'm out until Monday. I've turned on my auto-reply, which is now the most
//    emotionally available person in this thread."  (118)
//     Witty and machine-aware, but it describes the auto-reply instead of being
//     one, and it reads as a tweet — fails 1 and 3.
//
//   "Out of office until Monday. Anything I sent after 2am stands, and I will
//    be away, and it will be too late."  (106)
//     Same premise, but the final clause reports the consequence instead of
//     trusting it (`it will be too late` explains the joke) — fails 5.
//
//   "I'm away until the 9th. Whatever I promised you in the last email stands,
//    and I am no longer able to clarify it."  (112)
//     Close runner-up. `promised` is warmer than `sent`, but `no longer able to
//     clarify` reads as a legal disclaimer rather than a person being funny, so
//     the voice drops out on criterion 3.
const REPLY = {
  absence: "I'm out until Monday.",
  turn: "Whatever I sent you at 2am stands, and I will not be available to explain it.",
} as const;

function composeReply(r: { absence: string; turn: string }): string {
  return `${r.absence} ${r.turn}`;
}

function refuse(reason: string): never {
  process.stderr.write(`entry gate failed: ${reason}\n`);
  process.exit(1);
}

function gate(text: string): number {
  const chars = [...text].length; // code points, which is what the scorer counts
  if (chars < 1 || chars > CAP) refuse(`${chars} characters, the bounty caps at ${CAP}`);
  if (chars > TARGET_CHARS) refuse(`${chars} characters over this entry's own ceiling of ${TARGET_CHARS}`);
  if (text.trim().length === 0) refuse("text is empty or white space only");
  if (text.includes("\n") || text.includes("\r")) refuse("an auto-reply is one line");
  if (/ {2,}/.test(text)) refuse("doubled spaces cost bytes on the Size tie-break");
  if (text !== text.trim()) refuse("leading or trailing space");
  if (!/^[\x20-\x7E]+$/.test(text)) refuse("non-ASCII: bytes would stop matching characters");
  if (/\b(undefined|NaN|null)\b|\[object Object\]/.test(text)) refuse("template hole in the composed reply");
  // Criterion 1: it has to be a reply a person sets, so it must state an
  // absence in the form's own words. A quip with no away-line reads as a
  // joke about email, which the brief says loses to any real auto-reply.
  if (!/\b(out of office|out until|away until|away for|back on|returning)\b/i.test(text)) {
    refuse("no absence clause: criterion 1 would fail");
  }
  // Criterion 4 names the worn register. Refuse the four jokes every inbox has.
  const worn = [/in a meeting/i, /tab/i, /reach out to/i, /my colleague/i, /limited access/i];
  for (const w of worn) if (w.test(text)) refuse(`worn auto-reply register: ${w}`);
  return chars;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  const text = composeReply(REPLY);
  const chars = gate(text);

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.txt");
  // No trailing newline: the leaderboard's Size column is the file's bytes.
  writeFileSync(outPath, text, "utf8");

  const written = readFileSync(outPath, "utf8");
  if (written !== text) refuse("disk differs from the composed reply");

  const bytes = Buffer.byteLength(written, "utf8");
  process.stderr.write(`wrote ${chars} characters / ${bytes} bytes to ${outPath}\n`);
}

main();
