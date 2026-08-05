"""Render docs/DEPLOY.md to a printable PDF."""
from __future__ import annotations

import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "DEPLOY.md"
OUT = ROOT / "docs" / "DEPLOY.pdf"

INK = colors.HexColor("#0f1c24")
MUTED = colors.HexColor("#4a5d68")
LINE = colors.HexColor("#c5d3d9")
CODE_BG = colors.HexColor("#f0f4f6")
HEAD_BG = colors.HexColor("#e6eef2")
ACCENT = colors.HexColor("#1a4f6e")


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def inline(text: str) -> str:
    text = esc(text)
    text = re.sub(r"`([^`]+)`", r'<font face="Courier" size="9">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(
        r"\[([^\]]+)\]\((https?://[^)]+)\)",
        r'<link href="\2" color="#1a4f6e"><u>\1</u></link>',
        text,
    )
    text = re.sub(
        r"(?<![\"\">])(https?://[^\s<]+)",
        r'<link href="\1" color="#1a4f6e"><u>\1</u></link>',
        text,
    )
    return text


def parse_table(rows: list[str]) -> Table:
    data = []
    for i, row in enumerate(rows):
        if re.match(r"^\|?\s*-+", row):
            continue
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        data.append([Paragraph(inline(c), styles["docTd"]) for c in cells])
    col_count = max(len(r) for r in data)
    for row in data:
        while len(row) < col_count:
            row.append(Paragraph("", styles["docTd"]))
    width = 178 * mm
    col_w = width / col_count
    table = Table(data, colWidths=[col_w] * col_count, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
                ("TEXTCOLOR", (0, 0), (-1, -1), INK),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        "docTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        textColor=INK,
        spaceAfter=6,
        leading=22,
    )
)
styles.add(
    ParagraphStyle(
        "docH2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        textColor=ACCENT,
        spaceBefore=14,
        spaceAfter=6,
        leading=16,
    )
)
styles.add(
    ParagraphStyle(
        "docH3",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=INK,
        spaceBefore=10,
        spaceAfter=4,
        leading=14,
    )
)
styles.add(
    ParagraphStyle(
        "docBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        textColor=INK,
        leading=13,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        "docTd",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        textColor=INK,
        leading=11,
    )
)
styles.add(
    ParagraphStyle(
        "docCode",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=8,
        textColor=INK,
        leading=11,
        backColor=CODE_BG,
        leftIndent=0,
        rightIndent=0,
    )
)
styles.add(
    ParagraphStyle(
        "docLi",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        textColor=INK,
        leading=12,
    )
)


def build() -> None:
    md = SRC.read_text(encoding="utf-8")
    lines = md.splitlines()
    story: list = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("# "):
            story.append(Paragraph(inline(line[2:]), styles["docTitle"]))
            story.append(
                HRFlowable(width="100%", thickness=1, color=ACCENT, spaceAfter=8)
            )
            i += 1
            continue
        if line.startswith("## "):
            story.append(Paragraph(inline(line[3:]), styles["docH2"]))
            i += 1
            continue
        if line.startswith("### "):
            story.append(Paragraph(inline(line[4:]), styles["docH3"]))
            i += 1
            continue
        if line.strip() == "---":
            story.append(Spacer(1, 4))
            story.append(
                HRFlowable(width="100%", thickness=0.5, color=LINE, spaceAfter=8)
            )
            i += 1
            continue
        if line.startswith("```"):
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i])
                i += 1
            i += 1  # closing fence
            code = "\n".join(block) if block else " "
            pre = Preformatted(code, styles["docCode"], maxLineLength=96)
            story.append(KeepTogether([Spacer(1, 2), pre, Spacer(1, 6)]))
            continue
        if line.lstrip().startswith("|"):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append(lines[i])
                i += 1
            story.append(parse_table(rows))
            story.append(Spacer(1, 8))
            continue
        if re.match(r"^[-*] ", line):
            items = []
            while i < len(lines) and re.match(r"^[-*] ", lines[i]):
                items.append(
                    ListItem(
                        Paragraph(inline(lines[i][2:]), styles["docLi"]), leftIndent=8
                    )
                )
                i += 1
            story.append(
                ListFlowable(
                    items,
                    bulletType="bullet",
                    start="•",
                    leftIndent=12,
                    bulletFontSize=9,
                    spaceAfter=6,
                )
            )
            continue
        if re.match(r"^\d+\. ", line):
            items = []
            n = 1
            while i < len(lines) and re.match(r"^\d+\. ", lines[i]):
                text = re.sub(r"^\d+\. ", "", lines[i])
                items.append(
                    ListItem(
                        Paragraph(inline(text), styles["docLi"]), leftIndent=8, value=n
                    )
                )
                n += 1
                i += 1
            story.append(
                ListFlowable(
                    items,
                    bulletType="1",
                    leftIndent=16,
                    bulletFontSize=9,
                    spaceAfter=6,
                )
            )
            continue
        # paragraph (possibly continued)
        para = [line]
        i += 1
        while (
            i < len(lines)
            and lines[i].strip()
            and not lines[i].startswith("#")
            and not lines[i].startswith("```")
            and not lines[i].lstrip().startswith("|")
            and not re.match(r"^[-*] ", lines[i])
            and not re.match(r"^\d+\. ", lines[i])
            and lines[i].strip() != "---"
        ):
            para.append(lines[i])
            i += 1
        story.append(Paragraph(inline(" ".join(para)), styles["docBody"]))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.4)
        y = 12 * mm
        canvas.line(16 * mm, y + 6, A4[0] - 16 * mm, y + 6)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(16 * mm, y, "Property25 — Deploy manual")
        canvas.drawRightString(A4[0] - 16 * mm, y, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="Property25 — team deploy manual",
        author="Property25",
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUT)


if __name__ == "__main__":
    build()
