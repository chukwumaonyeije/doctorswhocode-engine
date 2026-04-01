import json
import os
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: export_record_pdf.py <input.json> <output.pdf>")

    input_json = sys.argv[1]
    output_pdf = sys.argv[2]

    with open(input_json, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    os.makedirs(os.path.dirname(output_pdf), exist_ok=True)

    styles = build_styles()
    doc = SimpleDocTemplate(
        output_pdf,
        pagesize=LETTER,
        rightMargin=0.7 * inch,
        leftMargin=0.7 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title=payload["title"],
    )

    story = []
    story.append(Paragraph(escape(payload["title"]), styles["Title"]))
    story.append(Spacer(1, 0.18 * inch))

    meta_lines = [
        f"<b>Record ID:</b> {escape(payload['id'])}",
        f"<b>Source type:</b> {escape(payload['sourceType'])}",
        f"<b>Action:</b> {escape(payload['requestedAction'])}",
        f"<b>Created:</b> {escape(payload['createdAt'])}",
        f"<b>Source reference:</b> {escape(payload['sourceReference'])}",
    ]
    for line in meta_lines:
        story.append(Paragraph(line, styles["Meta"]))
        story.append(Spacer(1, 0.04 * inch))

    story.append(Spacer(1, 0.16 * inch))
    story.append(Paragraph("Analysis", styles["Heading"]))
    story.append(Spacer(1, 0.08 * inch))

    for block in split_blocks(payload["body"]):
        style = styles["Bullet"] if block.strip().startswith("-") else styles["Body"]
        story.append(Paragraph(format_block(block), style))
        story.append(Spacer(1, 0.06 * inch))

    doc.build(story)
    return 0


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Meta",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=12,
            textColor=colors.HexColor("#444444"),
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Heading",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#111111"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=14,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Bullet",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=14,
            leftIndent=12,
            bulletIndent=0,
            spaceAfter=4,
        )
    )
    return styles


def split_blocks(body: str):
    return [block.strip() for block in body.split("\n\n") if block.strip()]


def format_block(block: str) -> str:
    lines = [line.strip() for line in block.splitlines() if line.strip()]
    if not lines:
        return ""

    if all(line.startswith("-") for line in lines):
        formatted = []
        for line in lines:
            formatted.append(f"&bull; {escape(line[1:].strip())}")
        return "<br/>".join(formatted)

    return "<br/>".join(escape(line) for line in lines)


def escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


if __name__ == "__main__":
    raise SystemExit(main())
