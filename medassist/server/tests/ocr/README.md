# Real-world OCR accuracy set

**Status: harness built, photographs not collected.** This is the honest state —
the review asks for a measurement nobody has taken yet, and the missing input is
data that has to be produced by hand.

> "Build a 100-photograph real-world OCR test set. Report per-parameter
> extraction accuracy and inter-provider disagreement rate."
> — Phase 2 faculty review, Week 9

> "Report per-parameter extraction accuracy on real photographs featuring glare,
> skew, curl, and multi-column layouts rather than on clean scans."

## Why this matters more than it sounds

Every safeguard downstream — the deterministic anemia classifier, the WHO
cutoffs, the dietary gate, the reference-range resolution — assumes the numbers
coming out of the photograph are the numbers printed on the report. That
assumption has never been tested on anything but clean PDFs.

It is also already known to fail in one direction: an unreadable image has been
observed to return a full set of invented values copied from the prompt's own
example, and the classifier then builds a confident determination on them
(`docs/CHECKPOINT-05-ensemble-failover.md` §6b). The `Not on the report`
fabrication count in this harness is aimed squarely at that failure.

## Building the set

**Never commit photographs or transcribed report content.** `images/` and
`labels.json` are both gitignored. Share the set out of band.

1. **Source the reports.** Use synthetic reports, or a team member's own results
   with their consent. Do not use another person's lab report.
2. **Photograph them under real conditions.** The point is not 100 clean
   pictures — it is coverage of the conditions in the vocabulary below. Aim for
   roughly even coverage, with a handful of deliberately bad images (partial,
   blurred, one blank) to exercise the fabrication count.
3. **Transcribe ground truth by hand.** Copy `labels.example.json` to
   `labels.json` and type what the report says. Do **not** paste the extractor's
   output and correct it — a label derived from the thing under test measures
   nothing.
4. **Tag each photograph** with one or more conditions.

### Condition vocabulary

`clean` · `glare` · `skew` · `curl` · `shadow` · `low_light` · `blur` ·
`multi_column` · `handwritten_annotation` · `partial` · `creased` ·
`screen_photo` · `non_english_header`

The review names glare, skew, curl and multi-column specifically. `screen_photo`
(a photo of a report displayed on a screen) and `non_english_header` are added
because both are realistic for this product's users.

## Running it

```bash
cd medassist/server
node tests/ocr/runExtractionAccuracy.js                  # whole set
node tests/ocr/runExtractionAccuracy.js --limit 10       # smoke test first
node tests/ocr/runExtractionAccuracy.js --json out.json  # machine-readable
```

This harness is **not** part of `npm test`: it calls the live vision extractor,
costs API quota, and is slow. Run it deliberately.

With no `labels.json` it exits **2** and tells you what is missing. It will not
report a passing result on an empty set.

## What it reports

| Figure | Meaning |
| --- | --- |
| Recall | Parameters the extractor located at all |
| Overall accuracy | Located **and** correct, against every expected parameter |
| Accuracy when found | Correct, of those located — separates "missed it" from "misread it" |
| **Not on the report** | Rows with no counterpart in ground truth. **The fabrication count.** |
| Per parameter | Which analytes are unreliable — hemoglobin failing matters more than albumin |
| Per condition | Accuracy under glare vs skew vs multi-column — the point of the exercise |

There is deliberately **no pass/fail threshold**. Inventing one before the first
measurement would be arbitrary. Set a threshold once there is a baseline, then
have it fail the build.
