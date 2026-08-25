"""
Generate MedAssist AI — Phase 2 Changes Explained (plain language) DOCX
Output: MedAssist_AI_Phase2_Changes_Explained.docx  (written to the project root)

The non-technical companion to MedAssist_AI_Phase2_Review_Meeting_Brief.docx.
Written to be read aloud: each change is told as Before → Why that was wrong →
Now, and closes with a single sentence the presenter can actually say.

No file paths, no function names, no jargon — that detail lives in
MedAssist_AI_Phase2_Review_Response_Analysis.md and CHECKPOINT-06.
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
OUTPUT = os.path.join(PROJECT_ROOT, "MedAssist_AI_Phase2_Changes_Explained.docx")

TITLE_COLOR = (17, 94, 89)
HEADING_COLOR = (15, 118, 110)
SUBHEADING_COLOR = (20, 83, 45)
GRAY = (75, 85, 99)
LIGHT_GRAY = (107, 114, 128)
AMBER = (146, 64, 14)
RED = (153, 27, 27)
GREEN = (22, 101, 52)

HEADER_FILL = "CCFBF1"
BEFORE_FILL = "FEF2F2"
AFTER_FILL = "F0FDF4"
WHY_FILL = "FEF3C7"
SAY_FILL = "F0FDFA"
CLOSE_FILL = "ECFEFF"


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
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    if indent:
        p.paragraph_format.left_indent = Inches(indent)
    for text, opts in parts:
        font(p.add_run(text), size=opts.get("size", size), bold=opts.get("bold", False),
             italic=opts.get("italic", False), color=opts.get("color"))
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


def shade(cell, hexfill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:fill'), hexfill)
    tcPr.append(shd)


def change_header(doc, n, title, subtitle=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(4)
    font(p.add_run(f"{n}.  "), size=15, bold=True, color=HEADING_COLOR)
    font(p.add_run(title), size=15, bold=True, color=TITLE_COLOR)
    if subtitle:
        font(p.add_run(f"     {subtitle}"), size=10, bold=True, color=AMBER)
    bottom_border(p)


def two_col(doc, before_lines, after_lines):
    """BEFORE | NOW side by side."""
    t = doc.add_table(rows=2, cols=2)
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER

    hdr = t.rows[0].cells
    for i, (htext, fill, col) in enumerate([
        ("WHAT IT DID BEFORE", BEFORE_FILL, RED),
        ("WHAT IT DOES NOW", AFTER_FILL, GREEN),
    ]):
        shade(hdr[i], fill)
        p = hdr[i].paragraphs[0]
        p.paragraph_format.space_after = Pt(2)
        font(p.add_run(htext), size=9, bold=True, color=col)

    body = t.rows[1].cells
    for i, lines in enumerate([before_lines, after_lines]):
        shade(body[i], "FFFFFF")
        first = True
        for text, opts in lines:
            p = body[i].paragraphs[0] if first else body[i].add_paragraph()
            first = False
            p.paragraph_format.space_after = Pt(5)
            if opts.get("bullet"):
                font(p.add_run("•  "), size=10, bold=True, color=HEADING_COLOR)
            font(p.add_run(text), size=opts.get("size", 10),
                 bold=opts.get("bold", False), italic=opts.get("italic", False),
                 color=opts.get("color", GRAY))
    for r in t.rows:
        r.cells[0].width = Inches(3.35)
        r.cells[1].width = Inches(3.35)
    para(doc, "", space_after=6)
    return t


def why_box(doc, lines):
    t = doc.add_table(rows=1, cols=1)
    t.style = 'Table Grid'
    cell = t.rows[0].cells[0]
    shade(cell, WHY_FILL)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(4)
    font(p.add_run("WHY THAT WAS A PROBLEM"), size=9, bold=True, color=AMBER)
    for text in lines:
        cp = cell.add_paragraph()
        cp.paragraph_format.space_after = Pt(4)
        font(cp.add_run(text), size=10.5, color=GRAY)
    para(doc, "", space_after=6)
    return t


def say_box(doc, sentence):
    t = doc.add_table(rows=1, cols=1)
    t.style = 'Table Grid'
    cell = t.rows[0].cells[0]
    shade(cell, SAY_FILL)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(4)
    font(p.add_run("SAY IT IN ONE SENTENCE"), size=9, bold=True, color=TITLE_COLOR)
    cp = cell.add_paragraph()
    cp.paragraph_format.space_after = Pt(2)
    font(cp.add_run(sentence), size=11.5, italic=True, color=TITLE_COLOR)
    para(doc, "", space_after=8)
    return t


# -- document ----------------------------------------------------------------

def build():
    doc = Document()
    set_margins(doc)

    # ---- Cover -------------------------------------------------------------
    para(doc, "MEDASSIST AI  ·  TEAM ALPHA", size=9.5, bold=True,
         color=HEADING_COLOR, space_after=2)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    font(p.add_run("What We Changed, In Plain Language"), size=23, bold=True, color=TITLE_COLOR)
    bottom_border(p)
    para(doc, "Changes made in response to the Phase 2 faculty review. Each one is written "
              "the way you would say it out loud — what the system used to do, why that was a "
              "problem, and what it does now.",
         size=11.5, color=GRAY, space_after=10)

    para(doc, "Changes 1-4 and 6-9 answer points raised in Dr. Leibovitz's review. Change 5 was "
              "a separate bug we found ourselves, worth mentioning because it is the same "
              "underlying mistake. Eight of the thirteen review points are now closed, two "
              "partly, three still open.",
         size=10.5, color=LIGHT_GRAY, italic=True, space_after=4)

    # ---- 1. Iron ------------------------------------------------------------
    change_header(doc, 1, "The iron diet", "THE IMPORTANT ONE")

    two_col(doc,
        [("Someone uploads a blood report. Their hemoglobin is low and their red blood cells "
          "are small.", {}),
         ("Our system looked at that shape and decided: iron deficiency.", {}),
         ("It then told the AI to build a diet plan around iron deficiency, and the patient got "
          "a meal plan full of spinach, red meat and lentils.", {})],
        [("We now ask one question first: is there an iron test on this report?", {"bold": True,
                                                                                   "color": GRAY}),
         ("Yes, and it confirms iron deficiency — full iron-focused diet plan, exactly as "
          "before.", {"bullet": True}),
         ("No iron test — no iron plan. Instead: a general healthy-eating plan, an explanation "
          "that the cause isn't known yet, three specific questions to ask the doctor, and a "
          "referral flag.", {"bullet": True})])

    why_box(doc, [
        "That shape — low hemoglobin, small cells — genuinely does look like iron deficiency. "
        "But it looks identical to several other things: an inherited blood condition, anemia "
        "from a long-term illness, or slow bleeding somewhere inside, which in an older adult "
        "can mean an undiagnosed cancer.",
        "Our system never checked. It guessed the most common answer and handed over a diet "
        "plan. The patient reads it, feels like they have an answer, and doesn't see a doctor. "
        "That delay is the actual harm.",
    ])

    say_box(doc, "“We used to guess the cause and give diet advice based on the guess. Now we "
                 "only give targeted advice when a test has actually confirmed the cause.”")

    # ---- 2. Scores ----------------------------------------------------------
    change_header(doc, 2, "The famous medical scores we weren't calculating")

    two_col(doc,
        [("Our risk feature told the AI to work out “Framingham cardiovascular risk,” plus "
          "three other named medical scoring systems — FINDRISC, CKD-EPI and Child-Pugh.", {}),
         ("We never built any of them.", {"bold": True, "color": RED})],
        [("All four names are deleted.", {}),
         ("The instruction now explicitly forbids naming any published medical score.", {}),
         ("The risk number still exists — it just no longer borrows credibility it hasn't "
          "earned.", {})])

    why_box(doc, [
        "Framingham genuinely needs the patient's blood pressure, whether they smoke, and "
        "whether they are on blood-pressure medication. We never ask for any of that.",
        "So the AI was producing a number, and we were putting a famous medical name on it.",
    ])

    say_box(doc, "“We were putting the names of real medical instruments on numbers we weren't "
                 "actually calculating. The professor spotted one; we found four.”")

    doc.add_page_break()

    # ---- 3. Vendors ---------------------------------------------------------
    change_header(doc, 3, "The list of outside companies")

    two_col(doc,
        [("One sentence naming ten outside services we send data to.", {}),
         ("It still listed a company we had stopped using.", {"bullet": True}),
         ("It was missing Groq — the main AI provider we use today.", {"bullet": True,
                                                                      "bold": True,
                                                                      "color": RED})],
        [("A proper table: every service, what we use it for, what patient data it receives, "
          "and what terms we still need to check.", {}),
         ("Plus an honest line stating that none of them has a healthcare data agreement with "
          "us yet.", {})])

    why_box(doc, [
        "A company currently receiving patients' blood results appeared nowhere in our own "
        "records.",
        "The professor estimated we had at least eight sets of terms to account for. It is "
        "actually eleven.",
    ])

    say_box(doc, "“We were sending blood results to a company that wasn't written down "
                 "anywhere. Now every one is listed with exactly what it receives.”")

    # ---- 4. Files -----------------------------------------------------------
    change_header(doc, 4, "Loose lab reports in the project folder")

    two_col(doc,
        [("Three sample lab report PDFs sat in the project folder, unprotected.", {}),
         ("One routine save command would have committed them into the project's permanent "
          "history, where they cannot easily be removed.", {})],
        [("Protected. They cannot be committed by accident.", {}),
         ("Still to do: 33 image files already in the project have not been checked to confirm "
          "none of them is a photographed patient report.", {"italic": True,
                                                             "color": LIGHT_GRAY})])

    say_box(doc, "“Sample lab reports were one keystroke away from being permanently published. "
                 "Now they're blocked.”")

    # ---- 5. Reasoning leak --------------------------------------------------
    change_header(doc, 5, "The bug we found ourselves", "NOT FROM THE REVIEW")

    two_col(doc,
        [("When a patient clicked an abnormal result for an explanation, they sometimes got the "
          "AI's private thinking-out-loud instead of the answer:", {}),
         ("“We need to produce 2–3 sentences… Let's craft… Count words: 65. Under 70. Good.”",
          {"italic": True, "color": RED}),
         ("And it was saved, so it kept showing.", {})],
        [("We now detect that kind of text and pull the real answer out of it.", {}),
         ("If there isn't one, we ask a different AI provider instead of showing anything.", {}),
         ("Previously saved bad ones are replaced automatically.", {})])

    say_box(doc, "“Patients were occasionally shown the AI's rough notes instead of its answer. "
                 "We now check what we're about to show before showing it.”")


    doc.add_page_break()

    # ---- 6. Symptom checker ------------------------------------------------
    change_header(doc, 6, "The symptom checker that named diseases", "BIGGEST LEGAL ONE")

    two_col(doc,
        [("You typed in your symptoms and it returned five diseases, each with an official "
          "medical code and a confidence percentage.", {}),
         (u"\u201cType 2 Diabetes \u2014 85%\u201d", {"italic": True, "color": RED}),
         ("It was ranked most likely first.", {})],
        [("The same conditions, but presented as things a doctor would want to rule out.", {}),
         ("No percentages at all - the numbers are stripped out in code, not just left out of "
          "the instruction.", {"bullet": True}),
         (u"Listed alphabetically, so the order cannot be read as \u201cmost likely first\u201d.",
          {"bullet": True}),
         ("Each one comes with questions to ask your doctor, and what test would settle it.",
          {"bullet": True}),
         (u"Every response opens with \u201cthis is not a diagnosis\u201d.", {"bullet": True})])

    why_box(doc, [
        "Naming a condition for a patient, with a confidence number, when no doctor is involved, "
        "is diagnosis. That puts the product into medical-device territory with everything that "
        "follows.",
        u"It is also unhelpful in the wrong way: \u201c85%\u201d makes people stop looking. The "
        u"professor's suggestion was the clever part \u2014 same screen, same information, "
        u"completely different risk.",
    ])

    say_box(doc, u"\u201cIt used to tell you what you probably had. Now it tells you what to ask "
                 u"your doctor about.\u201d")

    # ---- 7. Reference ranges ------------------------------------------------
    change_header(doc, 7, "We ignored the normal range printed on your own report")

    two_col(doc,
        [(u"Every lab prints its own \u201cnormal\u201d column, because normal depends on the "
          u"machine, the lab, and the patient.", {}),
         ("We compared everyone against one fixed table we had written down - and we were already "
          "reading the printed range off the report and throwing it away.", {})],
        [("Your own report's range is used first.", {}),
         ("If we cannot read it, we fall back to our table and label it, so nobody thinks we "
          "checked against their lab when we did not.", {"bullet": True}),
         ("Garbled ranges are rejected rather than applied.", {"bullet": True}),
         (u"Emergency thresholds stay on our table \u2014 those are call-a-doctor-now limits, "
          u"not lab-specific ones.", {"bullet": True})])

    say_box(doc, u"\u201cWe were judging everyone against one fixed table. Now we read the normal "
                 u"range off the patient's own report, and we say so when we can't.\u201d")

    # ---- 8. Six AIs ---------------------------------------------------------
    change_header(doc, 8, "Nobody had checked whether six AIs were worth it")

    two_col(doc,
        [("We send the same question to several AI providers and merge the answers, on the "
          "assumption that this improves accuracy.", {}),
         ("Nobody had ever measured whether they actually disagree.",
          {"bold": True, "color": RED})],
        [("Every run now measures and logs how much the providers differed.", {}),
         (u"When only one provider answers, it reports \u201cnot measured\u201d rather than "
          u"\u201c0% disagreement\u201d \u2014 one answer is not agreement.", {"bullet": True}),
         ("Still to do: gather the number from real runs.",
          {"italic": True, "color": LIGHT_GRAY})])

    why_box(doc, [
        "If the providers mostly agree, we are paying several times over in cost and waiting time "
        "for the same answer.",
        "And there is a bonus: fewer providers also means fewer companies receiving patient blood "
        "results. One measurement could justify fixing cost, speed and privacy together.",
    ])

    say_box(doc, u"\u201cWe built the measurement. The honest position is that we have the "
                 u"instrument but not yet the number.\u201d")

    # ---- 9. Drug warnings ---------------------------------------------------
    change_header(doc, 9, "Drug interaction warnings")

    two_col(doc,
        [("We asked a public drug database for interactions and passed on whatever came back, "
          "including its severity field.", {}),
         ("That database does not actually grade severity - so a trivial interaction and a "
          "dangerous one looked the same.", {})],
        [("A short, curated list of eight genuinely serious interactions.", {}),
         (u"Anything from the public database is now marked \u201cnot graded\u201d with the "
          u"limitation stated.", {"bullet": True}),
         ("No warning ever tells a patient to stop a medicine - every one says speak to your "
          "doctor or pharmacist. A test fails if anyone writes one that does.", {"bullet": True}),
         ("Switched off until a real pharmacist reviews the list.",
          {"bullet": True, "italic": True})])

    why_box(doc, [
        "A wall of warnings is worse than none: people learn to dismiss all of them.",
        "And the dangerous failure is the one the professor named - a scary-looking warning that "
        "makes someone stop a drug they actually need.",
    ])

    say_box(doc, u"\u201cWe were passing on ungraded warnings as if they were graded. Now it is a "
                 u"short reviewed list, and no warning ever tells you to stop taking something.\u201d")

    # ---- Closing ------------------------------------------------------------
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(6)
    font(p.add_run("The thread that ties it together"), size=15, bold=True, color=TITLE_COLOR)
    bottom_border(p)
    para(doc, "If the professor asks what the pattern is, this is the answer:",
         size=10.5, color=GRAY, space_after=6)

    t = doc.add_table(rows=1, cols=1)
    t.style = 'Table Grid'
    cell = t.rows[0].cells[0]
    shade(cell, CLOSE_FILL)
    cp = cell.paragraphs[0]
    cp.paragraph_format.space_after = Pt(4)
    cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    font(cp.add_run("“Every one of these was the same mistake — we were trusting the AI's "
                    "output without checking it. Now the rules decide, and the AI only explains "
                    "what the rules already decided.”"),
         size=13, bold=True, italic=True, color=TITLE_COLOR)
    para(doc, "", space_after=6)

    para(doc, "That is genuinely what changed, and it is the sentence worth landing.",
         size=10.5, color=GRAY, space_after=10)

    # ---- Honest note --------------------------------------------------------
    para(doc, "One thing to volunteer, not hide", size=12, bold=True,
         color=AMBER, space_before=6, space_after=3)
    para(doc, "Change 1 is only half finished. The system now withholds the iron diet plan and "
              "stores the explanation and the doctor questions — but no screen shows them to the "
              "patient yet. Someone using the app today gets a general diet plan with no "
              "explanation of why it is general. Say this before they ask; it costs far less "
              "than having it found.",
         size=10.5, color=GRAY, space_after=10)

    # ---- Footer -------------------------------------------------------------
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    bottom_border(p, color='CBD5E1')
    para(doc, "Companion documents: MedAssist_AI_Phase2_Review_Meeting_Brief.docx (talk track "
              "and live demo) · MedAssist_AI_Phase2_Review_Response_Analysis.md (all thirteen "
              "review items, technical)",
         size=8.5, color=LIGHT_GRAY, space_after=1)
    para(doc, "Prepared 24 Aug 2026  ·  Commits ff51c4d · ee88bd2 · 4c363ce — pushed to main",
         size=8.5, color=LIGHT_GRAY, space_after=0)

    doc.save(OUTPUT)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    build()
