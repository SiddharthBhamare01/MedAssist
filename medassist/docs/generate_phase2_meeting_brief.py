"""
Generate MedAssist AI — Phase 2 Faculty Review Meeting Brief DOCX
Output: MedAssist_AI_Phase2_Review_Meeting_Brief.docx  (written to the project root)

Companion to MedAssist_AI_Phase2_Review_Response_Analysis.md. Answers
"what do we say to Dr. Leibovitz?" rather than "what is wrong with the code?"

Talk track is timed for a 30-minute meeting. Status flags on the thirteen-item
table are deliberately honest: PARTLY CLOSED where only the backend landed,
NOT BUILT where the reviewed feature does not exist in the repository at all.
"""

from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import os

DOCS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(DOCS_DIR))
OUTPUT = os.path.join(PROJECT_ROOT, "MedAssist_AI_Phase2_Review_Meeting_Brief.docx")

# Palette mirrors generate_demo_script.py so the deck of documents reads as a set.
TITLE_COLOR = (17, 94, 89)
HEADING_COLOR = (15, 118, 110)
SUBHEADING_COLOR = (20, 83, 45)
GRAY = (75, 85, 99)
LIGHT_GRAY = (107, 114, 128)
AMBER = (146, 64, 14)
RED = (153, 27, 27)
GREEN = (22, 101, 52)
MONO = "Consolas"

HEADER_FILL = "CCFBF1"
ALERT_FILL = "FEF2F2"
SAY_FILL = "F0FDFA"
CODE_FILL = "F8FAFC"
FIXED_FILL = "DCFCE7"
PARTIAL_FILL = "FEF3C7"
OPEN_FILL = "FEE2E2"
NONE_FILL = "F1F5F9"


# -- helpers -----------------------------------------------------------------

def set_margins(doc, top=0.8, bottom=0.8, left=0.9, right=0.9):
    for s in doc.sections:
        s.top_margin = Inches(top)
        s.bottom_margin = Inches(bottom)
        s.left_margin = Inches(left)
        s.right_margin = Inches(right)


def font(run, name="Calibri", size=11, bold=False, italic=False, color=None):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    if color:
        run.font.color.rgb = RGBColor(*color)
    run._element.rPr.rFonts.set(qn('w:eastAsia'), name)


def para(doc, text="", size=11, bold=False, italic=False, color=None,
         space_after=6, space_before=0, align=None, indent=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.space_before = Pt(space_before)
    if align:
        p.alignment = align
    if indent:
        p.paragraph_format.left_indent = Inches(indent)
    if text:
        font(p.add_run(text), size=size, bold=bold, italic=italic, color=color)
    return p


def rich(doc, parts, size=10.5, space_after=6, indent=None):
    """A paragraph from [(text, {bold/italic/color/name}), ...] fragments."""
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    if indent:
        p.paragraph_format.left_indent = Inches(indent)
    for text, opts in parts:
        font(p.add_run(text), size=opts.get("size", size), bold=opts.get("bold", False),
             italic=opts.get("italic", False), color=opts.get("color"),
             name=opts.get("name", "Calibri"))
    return p


def bottom_border(p, color='99F6E4'):
    pPr = p._p.get_or_add_pPr()
    borders = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '6')
    bottom.set(qn('w:space'), '2')
    bottom.set(qn('w:color'), color)
    borders.append(bottom)
    pPr.append(borders)


def h1(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(6)
    font(p.add_run(text), size=15, bold=True, color=HEADING_COLOR)
    bottom_border(p)
    return p


def bullet(doc, text, bold_prefix=None, size=10.5, indent=0.22):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.left_indent = Inches(indent)
    font(p.add_run("•  "), size=size, bold=True, color=HEADING_COLOR)
    if bold_prefix:
        font(p.add_run(bold_prefix), size=size, bold=True)
    font(p.add_run(text), size=size)
    return p


def shade(cell, hexfill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:fill'), hexfill)
    tcPr.append(shd)


def boxed(doc, lines, fill, accent, title=None):
    """A single-cell shaded callout table."""
    t = doc.add_table(rows=1, cols=1)
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = t.rows[0].cells[0]
    shade(cell, fill)
    first = True
    if title:
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(5)
        font(p.add_run(title), size=11.5, bold=True, color=accent)
        first = False
    for text, opts in lines:
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        p.paragraph_format.space_after = Pt(opts.get("space_after", 5))
        font(p.add_run(text), size=opts.get("size", 10.5), bold=opts.get("bold", False),
             italic=opts.get("italic", False), color=opts.get("color"))
    para(doc, "", space_after=6)
    return t


def code_block(doc, lines):
    """Monospace command / output block."""
    t = doc.add_table(rows=1, cols=1)
    t.style = 'Table Grid'
    cell = t.rows[0].cells[0]
    shade(cell, CODE_FILL)
    first = True
    for text, is_output in lines:
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        p.paragraph_format.space_after = Pt(1)
        font(p.add_run(text), name=MONO, size=8.5,
             color=LIGHT_GRAY if is_output else HEADING_COLOR,
             bold=not is_output)
    para(doc, "", space_after=6)
    return t


def table(doc, headers, rows, widths=None, size=9.5, flag_fills=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = t.rows[0].cells
    for i, htext in enumerate(headers):
        shade(hdr[i], HEADER_FILL)
        p = hdr[i].paragraphs[0]
        p.paragraph_format.space_after = Pt(2)
        font(p.add_run(htext), size=size, bold=True, color=TITLE_COLOR)
    for r_i, row in enumerate(rows):
        cells = t.add_row().cells
        for i, val in enumerate(row):
            p = cells[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            if flag_fills and i == 1:
                shade(cells[i], flag_fills[r_i][0])
                font(p.add_run(str(val)), size=size - 0.5, bold=True, color=flag_fills[r_i][1])
            else:
                font(p.add_run(str(val)), size=size, bold=(i == 0))
    if widths:
        for r in t.rows:
            for i, w in enumerate(widths):
                r.cells[i].width = Inches(w)
    para(doc, "", space_after=6)
    return t


def talk_step(doc, n, title, mins, body, say=None, tail=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(11)
    p.paragraph_format.space_after = Pt(3)
    font(p.add_run(f"{n}.  {title}"), size=12, bold=True, color=SUBHEADING_COLOR)
    font(p.add_run(f"     {mins}"), size=9.5, bold=True, color=LIGHT_GRAY)
    bottom_border(p, color='E2E8F0')
    para(doc, body, size=10.5, color=GRAY, space_after=4)
    if say:
        boxed(doc, [(say, {"italic": True, "size": 11, "color": TITLE_COLOR})],
              SAY_FILL, TITLE_COLOR, title="SAY IT LIKE THIS")
    if tail:
        para(doc, tail, size=10.5, color=GRAY, space_after=4)


# -- document ----------------------------------------------------------------

def build():
    doc = Document()
    set_margins(doc)

    # ---- Cover -------------------------------------------------------------
    para(doc, "MEDASSIST AI  ·  TEAM ALPHA", size=9.5, bold=True,
         color=HEADING_COLOR, space_after=2)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    font(p.add_run("Phase 2 Review — Meeting Brief"), size=23, bold=True, color=TITLE_COLOR)
    bottom_border(p)
    para(doc, "What to say to Dr. Leibovitz, what to demonstrate live, and the one thing "
              "that has to be said before anything else.",
         size=11.5, color=GRAY, space_after=8)
    rich(doc, [
        ("Source: ", {"bold": True, "color": LIGHT_GRAY, "size": 9.5}),
        ("MedAssist_AI_Phase2_Review_Dr. Leibovitz's.docx", {"color": LIGHT_GRAY, "size": 9.5}),
        ("      Prepared: ", {"bold": True, "color": LIGHT_GRAY, "size": 9.5}),
        ("24 Aug 2026", {"color": LIGHT_GRAY, "size": 9.5}),
    ], space_after=10)

    table(doc, ["Review items", "Closed", "Partly closed", "Open", "Test suites green"],
          [["13", "8", "2", "3", "29 + 7 + 29 + 30 + 16 + 16"]],
          widths=[1.1, 0.9, 1.2, 0.8, 2.6], size=10)

    # ---- The lead ----------------------------------------------------------
    h1(doc, "Say this first — before the demo")
    boxed(doc, [
        ("The review describes Phase 2 as built. Most of it isn't.",
         {"bold": True, "size": 12.5, "color": RED, "space_after": 6}),
        ("Section 1 describes, in the present tense, a prescription workflow with OCR'd drug and "
         "dose, mealtime reminders, a timestamped adherence log, recovery effectiveness scoring, "
         "and a pre-visit PDF. We checked the repository: none of it exists. A search for "
         "“adherence” returns zero matches across the entire server and client. Framingham "
         "appears once, inside a prompt string, never as a calculation.", {}),
        ("This changes what half the feedback means. Roughly four items are “fix what you "
         "built.” The other nine are “when you build this, build it this way.” If we "
         "nod along to all thirteen, we are agreeing we broke things we never made — and we "
         "accept a Week 10 gate that assumes a system that doesn't exist.", {}),
        ("Open with this. It is the most credible thing we can do, and it reframes the rest of "
         "the meeting in our favour.", {"bold": True, "space_after": 0}),
    ], ALERT_FILL, RED)

    # ---- Talk track --------------------------------------------------------
    h1(doc, "Talk track — about 30 minutes")
    para(doc, "The order matters. The honesty comes first, the safety fix second, everything "
              "else after.", size=10.5, color=GRAY, space_after=6)

    talk_step(doc, 1, "Set the record straight", "3 min",
              "Deliver the point above. Be matter-of-fact, not apologetic — we are correcting "
              "the input to their review, not confessing to something.",
              say="“Before we show the changes — we checked each item against the actual "
                  "repository, and several of the features your review describes as running aren't "
                  "built yet. We'd rather tell you that now than at Gate 3.”")

    talk_step(doc, 2, "Lead with the safety defect — it reproduced", "6 min",
              "This is the strongest thing we have. They gave a hypothetical; we traced it, found "
              "it was real in our code, closed it, and named the test after their scenario.",
              say="“Your hemoglobin 9.1 example wasn't hypothetical for us. We traced it: a low "
                  "hemoglobin with small red cells and no iron panel was typed as iron deficiency, "
                  "and that fed a prompt telling the model to build an iron-rich diet plan. We "
                  "reproduced it, gated it, and the test is called GATE-hb91-no-iron-panel.”",
              tail="Then run demos A and B.")

    talk_step(doc, 3, "Show that we read past the example", "4 min",
              "They flagged Framingham. We found the same defect in three more places — "
              "FINDRISC, CKD-EPI and Child-Pugh were all named in the prompt, none implemented, "
              "none of their required inputs ever collected.",
              say="“You flagged Framingham. When we opened the file, we were doing the same "
                  "thing with three more instruments. All four names are gone, and the prompt now "
                  "forbids naming any published score.”",
              tail="Note the decision and why: we removed the claim rather than adopting PREVENT, "
                   "because PREVENT needs the same blood pressure, smoking and treatment inputs we "
                   "never collect. Invite them to push back on that.")

    talk_step(doc, 4, "Compliance — and the argument it hands us", "4 min",
              "Their estimate of eight vendors was low. Our manifest now has eleven rows, and one "
              "finding is genuinely uncomfortable: Groq, our lead AI provider, was missing "
              "entirely while a retired vendor was still listed.",
              say="“You said at least eight sets of terms. It's eleven — and we found we "
                  "were transmitting to a provider that appeared nowhere in our own manifest.”",
              tail="Then make the connection they'll appreciate: if the disagreement-rate "
                   "measurement shows six providers buy little accuracy, cutting providers fixes "
                   "cost, latency and compliance at once. That is the strongest single argument we "
                   "have, and it is their own logic.")

    talk_step(doc, 5, "Round two — six more items", "5 min",
              "Cover these quickly; the detail is in the thirteen-item table. Symptom checker "
              "reframed (no probabilities, alphabetical, questions for the doctor, disclaimer). "
              "Reference ranges now read from the patient's own report with a disclosed fallback. "
              "Inter-provider disagreement is measured on every run. Interaction alerts scoped to "
              "8 curated entries, disabled until a pharmacist signs off. Association-not-causation "
              "disclaimer on every recovery result. Both Week 7 memos written.",
              say="“You asked for the disagreement rate. We built the measurement — and the "
                  "honest position is that we have the instrument but not yet the number.”",
              tail="The OCR harness is worth naming here too: built, with a fabrication count "
                   "aimed at a known failure, but the 100 photographs have to be taken by hand and "
                   "we have not collected them.")

    talk_step(doc, 6, "State the Gate 3 problem plainly", "4 min",
              "Their Week 10 gate is “report upload through pre-visit PDF end to end, including "
              "failure paths.” The pre-visit report does not exist. Neither does adherence "
              "tracking or prescription capture, which it depends on.",
              say="“Gate 3 as written needs the pre-visit report. That's a multi-week build we "
                  "haven't started, and it sits behind adherence tracking which also isn't built. "
                  "We want to agree now what Gate 3 should actually be.”",
              tail="Do not let this slide to the end and get cut for time. It is the single "
                   "decision we need from this meeting.")

    talk_step(doc, 7, "Be first to say what we haven't done", "3 min",
              "Volunteer the gaps before they find them — see the honesty list. The one that "
              "matters most: every safeguard we have added across both rounds is backend only. "
              "A patient today sees none of the explanations, questions or disclaimers we now "
              "store. That is the single largest gap between what the system enforces and what "
              "anyone actually sees.")

    talk_step(doc, 8, "Ask the five questions", "5 min",
              "Close by putting the decisions back to them.")

    doc.add_page_break()

    # ---- Demos -------------------------------------------------------------
    h1(doc, "Live demo")
    para(doc, "Run from medassist/server. All four are offline — no API keys, no network, "
              "nothing to fail on stage. Test them once before the meeting.",
         size=10.5, color=GRAY, space_after=8)

    para(doc, "A · The test suite", size=12, bold=True, color=SUBHEADING_COLOR, space_after=3)
    code_block(doc, [
        ("node tests/anemia/runClassifier.js", False),
        ("", True),
        ("ANEMIA CLASSIFIER VALIDATION — 29 synthetic CBC cases", True),
        ("  TP=23  FP=0  TN=6  FN=0", True),
        ("  Sensitivity 100.0%   Specificity 100.0%", True),
        ("  Overall field accuracy: 151/151 (100.0%)", True),
        ("  RESULT: PASS", True),
    ])
    para(doc, "Point out that the harness exits non-zero on any false negative — it is a safety "
              "gate, not a report. Field checks went 145 → 151 because the new dietary gate is "
              "now asserted on every case.", size=10.5, color=GRAY, space_after=10)

    para(doc, "B · The gate flipping  —  the money shot", size=12, bold=True,
         color=SUBHEADING_COLOR, space_after=3)
    code_block(doc, [
        ("node -e \"", False),
        ("const { classifyAnemia } = require('./services/anemiaClassifier');", False),
        ("const v = (p,val,u) => ({ parameter:p, abbreviation:'', value:String(val), unit:u });", False),
        ("const show = (l,a) => console.log(l, '->', a.status, '|', a.dietary_guidance);", False),
        ("show('no iron panel ', classifyAnemia([v('Hemoglobin',9.1,'g/dL'),", False),
        ("  v('MCV',76,'fL')], {gender:'male',age:58}));", False),
        ("show('ferritin 10   ', classifyAnemia([v('Hemoglobin',9.1,'g/dL'),", False),
        ("  v('MCV',76,'fL'),v('Ferritin',10,'ng/mL')], {gender:'male',age:58}));", False),
        ("\"", False),
        ("", True),
        ("no iron panel  -> SUSPECTED | general_only", True),
        ("ferritin 10    -> CONFIRMED | condition_specific", True),
    ])
    para(doc, "Same patient, same hemoglobin. One has an iron test on the report, one doesn't. "
              "Only the confirmed one unlocks iron-focused nutrition. That one-line difference is "
              "the entire fix — let it sit for a second.", size=10.5, color=GRAY, space_after=10)

    para(doc, "C · The instrument names are gone", size=12, bold=True,
         color=SUBHEADING_COLOR, space_after=3)
    code_block(doc, [
        ("grep -n \"Framingham\\|FINDRISC\\|CKD-EPI\\|Child-Pugh\" agents/riskScoringAgent.js", False),
        ("", True),
        ("60: - This is a heuristic triage signal... It is NOT a validated", True),
        ("     clinical risk score. Never name, cite, or claim to compute a", True),
        ("     published instrument (Framingham, PREVENT, ASCVD, FINDRISC,", True),
        ("     CKD-EPI, MDRD, Child-Pugh, MELD or any other)...", True),
    ])
    para(doc, "One hit, and it's the prohibition. Previously four hits on lines 51–54, each "
              "attached to a dimension the model was scoring.",
         size=10.5, color=GRAY, space_after=10)

    para(doc, "D · Lab reports can no longer be committed", size=12, bold=True,
         color=SUBHEADING_COLOR, space_after=3)
    code_block(doc, [
        ("git check-ignore -v sample-cbc-reports/CBC_1_iron_deficiency_anemia.pdf", False),
        ("", True),
        (".gitignore:37   sample-cbc-reports/", True),
    ])
    para(doc, "Ten seconds, but it directly answers their line about committing no photographed "
              "reports.", size=10.5, color=GRAY, space_after=8)

    doc.add_page_break()

    # ---- Thirteen items ----------------------------------------------------
    h1(doc, "All thirteen items")
    para(doc, "Have this open. If they ask about an item we didn't touch, the answer is here "
              "rather than improvised.", size=10.5, color=GRAY, space_after=8)

    rows = [
        ["Dietary iron on unconfirmed anemia", "PARTLY CLOSED",
         "Rule engine gates it, tested, referral forced. No UI renders the reason or the "
         "questions yet — say this out loud."],
        ["Framingham → PREVENT or remove", "CLOSED",
         "All four instrument names removed; naming any score now prohibited in the prompt."],
        ["Reframe condition inference (SaMD)", "CLOSED",
         "No probabilities, alphabetical order, clinician questions, not-a-diagnosis disclaimer. "
         "Likelihood stripped in code, not just prompted. Confirm we reframed the feature you meant."],
        ["Reference ranges from the patient's own report", "CLOSED",
         "Printed range wins; curated table is the disclosed fallback. Critical thresholds and WHO "
         "anemia cutoffs deliberately unchanged. 7 new fixtures, 7/7."],
        ["Inter-provider disagreement rate", "CLOSED",
         "Measured and logged on every multi-provider run; returns null, never 0%, when only one "
         "provider ran. The production number is still uncollected."],
        ["openFDA / RxNorm limits, curated alerts", "CLOSED",
         "8-entry curated set; RxNorm results forced to not_graded. No entry may advise stopping a "
         "medicine — enforced by test. Alerting disabled pending pharmacist review."],
        ["Adherence → outcome causal language", "CLOSED",
         "Association-not-causation disclaimer on every recovery result; constraint recorded for "
         "when adherence tracking is built."],
        ["Eight-vendor terms manifest", "CLOSED",
         "Eleven-row table with data flows and BAA gap stated. Generator edited, not the output."],
        ["SaMD posture memo", "CLOSED",
         "One page, as the milestone plan asks — plus PHI-DATA-FLOW.md."],
        ["No report images in the repo", "PARTLY CLOSED",
         "Sample PDFs and the OCR image set are ignored. 33 tracked image files still unaudited."],
        ["BAAs / PHI across providers", "OPEN",
         "Documented with a dependency-ordered plan. Signing is a legal act, not a code change."],
        ["Deterministic parsing + LOINC / UCUM", "OPEN",
         "Extraction is still fully generative. One to two weeks."],
        ["100-photograph real-world OCR test set", "OPEN",
         "Harness built with a fabrication count; the photographs must be taken by hand. Exits 2 "
         "rather than fake a pass."],
        ["Pre-visit report as FHIR", "NOT BUILT · GATE 3",
         "Doesn't exist in any form. This is the schedule risk."],
    ]
    fills = [
        (PARTIAL_FILL, AMBER), (FIXED_FILL, GREEN), (FIXED_FILL, GREEN), (FIXED_FILL, GREEN),
        (FIXED_FILL, GREEN), (FIXED_FILL, GREEN), (FIXED_FILL, GREEN), (FIXED_FILL, GREEN),
        (FIXED_FILL, GREEN), (PARTIAL_FILL, AMBER), (OPEN_FILL, RED), (OPEN_FILL, RED),
        (OPEN_FILL, RED), (NONE_FILL, GRAY),
    ]
    table(doc, ["Review item", "Status", "Where it stands"], rows,
          widths=[2.0, 1.15, 3.55], flag_fills=fills)

    # ---- Honesty list ------------------------------------------------------
    h1(doc, "Say these before they ask")
    para(doc, "Volunteering a limitation costs far less than having it found. Each of these is "
              "genuinely unverified.", size=10.5, color=GRAY, space_after=6)
    bullet(doc, "The dietary gate's reason and questions, the range-source disclosure, the "
                "not-a-diagnosis disclaimer, the association notice and the interaction disclosure "
                "are all stored and none is rendered. This is the single largest gap between what "
                "the system enforces and what a patient sees.",
           bold_prefix="Every safeguard we added is backend-only. ")
    bullet(doc, "We drop the structured fields deterministically, but nothing in code stops a "
                "model listing iron-rich foods inside a correctly-labelled general plan. Untested "
                "against a live provider.",
           bold_prefix="The food lists are still model-written. ")
    bullet(doc, "Because we gated macrocytic and normocytic anemia too, not just iron. "
                "Defensible, but it's a big behavioural change and we'd welcome a view on whether "
                "it's too broad.",
           bold_prefix="The referral now fires on 21 of 23 anemic test cases. ")
    bullet(doc, "Their review asks for anemia, thyroid and renal.",
           bold_prefix="Only anemia is gated. ")
    bullet(doc, "All six offline suites pass and every touched module loads, but nothing was "
                "exercised against a live provider or a running server. The reframed symptom "
                "endpoint has never returned a real response.",
           bold_prefix="No live end-to-end run. ")
    bullet(doc, "We built the measurement, not the finding. Nobody has gathered a sample of real "
                "runs yet — so we cannot yet tell you whether the providers are worth their cost.",
           bold_prefix="The disagreement rate is instrumented but uncollected. ")
    bullet(doc, "Class-level mechanisms from standard references, not a pharmacist's judgement. "
                "Alerting stays disabled until that review happens.",
           bold_prefix="The curated interaction severities are not pharmacist-reviewed. ")

    para(doc, "One extra, if there's time", size=11.5, bold=True, color=SUBHEADING_COLOR,
         space_before=8, space_after=3)
    para(doc, "Separately from the review, we found and fixed a bug where a model's private "
              "reasoning — “We need to produce 2–3 sentences… Count words…” "
              "— was being shown to patients as the explanation of their abnormal finding, and "
              "cached. Not a review item, but it's the same class of problem: trusting model "
              "output without validating it.", size=10.5, color=GRAY, space_after=8)

    # ---- Questions ---------------------------------------------------------
    h1(doc, "Five questions to close on")
    para(doc, "Put the decisions back to them. This is what turns a review into a working "
              "relationship.", size=10.5, color=GRAY, space_after=6)

    questions = [
        ("Which feature did you mean by condition inference?",
         "Ours is symptom-driven and ships today with ICD-10 codes and probabilities. Yours "
         "describes inference from the pattern of abnormal lab parameters. We'll reframe the "
         "right one."),
        ("What should Gate 3 actually be, given the pre-visit report doesn't exist?",
         "The decision we most need from this meeting."),
        ("Is removing the score claim acceptable, rather than adopting PREVENT?",
         "PREVENT needs the same inputs Framingham does, none of which a lab panel carries."),
        ("Keep WHO cutoffs for anemia while moving other parameters to the printed range?",
         "WHO cutoffs are deliberately not assay-specific. We don't want to undo cited work by "
         "applying the reference-range change uniformly."),
        ("Is forcing a referral on every unconfirmed anemia too broad?",
         "21 of 23 anemic cases in our test set. We can narrow it to the microcytic path if "
         "that's the preference."),
    ]
    for i, (q, a) in enumerate(questions, 1):
        rich(doc, [(f"{i}.  ", {"bold": True, "color": HEADING_COLOR, "size": 11}),
                   (q, {"bold": True, "size": 11})], space_after=2)
        para(doc, a, size=10, color=GRAY, indent=0.25, space_after=7)

    # ---- Footer ------------------------------------------------------------
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    bottom_border(p, color='CBD5E1')
    para(doc, "Detail: MedAssist_AI_Phase2_Review_Response_Analysis.md  ·  CHECKPOINT-06  ·  "
              "CHECKPOINT-07  ·  SAMD-POSTURE-MEMO.md  ·  PHI-DATA-FLOW.md",
         size=8.5, color=LIGHT_GRAY, space_after=1)
    para(doc, "Test suites: 29 anemia + 7 range + 29 guardrail + 30 recovery + 16 disagreement + 16 interaction — all green",
         size=8.5, color=LIGHT_GRAY, space_after=0)

    doc.save(OUTPUT)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    build()
