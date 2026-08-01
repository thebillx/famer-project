"""User-facing remote-sensing language policy."""

from __future__ import annotations

ALLOWED_PHRASES = frozenset(
    {
        "พบความเปลี่ยนแปลง",
        "พบพื้นที่ที่ควรตรวจสอบ",
        "พบสัญญาณที่ควรตรวจสอบ",
        "พบแนวโน้มความชื้นลดลง",
        "พบแนวโน้มปริมาณน้ำในพืชลดลง",
        "พบค่าความเขียวลดลง",
        "ข้อมูลยังไม่เพียงพอ",
        "ข้อมูลไม่เพียงพอ",
        "ไม่สามารถวิเคราะห์ได้เนื่องจากเมฆ",
        "ควรตรวจสอบภาคสนาม",
    }
)

PROHIBITED_PHRASES = frozenset(
    {
        "เป็นโรคแน่นอน",
        "ขาดน้ำแน่นอน",
        "ขาดปุ๋ยแน่นอน",
        "เป็นเชื้อราชนิดใดชนิดหนึ่ง",
        "มีแมลงชนิดใดชนิดหนึ่ง",
        "พบแมลงชนิดใดชนิดหนึ่ง",
        "ต้องใช้สารเคมีชนิดใด",
    }
)


def is_allowed_phrase(text: str) -> bool:
    return text.strip() in ALLOWED_PHRASES


def is_prohibited_phrase(text: str) -> bool:
    normalized = text.strip()
    return any(phrase in normalized for phrase in PROHIBITED_PHRASES)
