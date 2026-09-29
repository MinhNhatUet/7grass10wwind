"""Xuất lộ trình học ra lịch iCalendar (RFC 5545) để nhập vào Google Calendar/Outlook (D-37).

Không cần OAuth: người dùng tải file .ics rồi nhập vào lịch. Mỗi buổi học = 1 sự kiện, UID ổn định theo plan/buổi
nên nhập lại bản cập nhật sẽ ghi đè thay vì nhân đôi.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

from src.models.orm import StudyPlan

TZ = "Asia/Ho_Chi_Minh"  # ponytail: một múi giờ cố định cho pilot; thêm tham số tz khi có người dùng ngoài VN


def _esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def _fold(line: str) -> str:
    """RFC 5545 §3.1: dòng dài hơn 75 octet được gập, dòng tiếp theo bắt đầu bằng một dấu cách."""
    out, cur = [], ""
    for ch in line:
        if len((cur + ch).encode("utf-8")) > 74:
            out.append(cur)
            cur = " " + ch
        else:
            cur += ch
    out.append(cur)
    return "\r\n".join(out)


def plan_ics(plan: StudyPlan, start: date, at: time, app_url: str | None = None) -> str:
    """Ngày 1 của lộ trình = `start`; các buổi cùng ngày xếp liền nhau từ giờ `at`."""
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//EDU-04//Lo trinh hoc//VI",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_esc('EDU-04 · ' + plan.goal[:60])}",
        f"X-WR-TIMEZONE:{TZ}",
    ]
    offset: dict[int, int] = {}  # phút đã dùng trong mỗi ngày
    for s in sorted(plan.data.get("sessions", []), key=lambda x: (x.get("day", 0), x.get("id", ""))):
        day, minutes = int(s["day"]), int(s["minutes"])
        begin = datetime.combine(start + timedelta(days=day - 1), at) + timedelta(minutes=offset.get(day, 0))
        offset[day] = offset.get(day, 0) + minutes
        end = begin + timedelta(minutes=minutes)
        desc = [f"Mục tiêu: {s.get('objective', '')}", f"Hoạt động: {s.get('activity', '')}"]
        if s.get("self_check"):
            desc.append(f"Tự kiểm tra: {s['self_check']}")
        desc.append(f'Ôn tập: mở lộ trình trong EDU-04 và bấm "Ôn tập" ở ngày {day}.')
        if app_url:
            desc.append(app_url)
        lines += [
            "BEGIN:VEVENT",
            f"UID:{plan.id}-{s.get('id')}@edu04",
            f"DTSTAMP:{stamp}",
            f"DTSTART;TZID={TZ}:{begin:%Y%m%dT%H%M%S}",
            f"DTEND;TZID={TZ}:{end:%Y%m%dT%H%M%S}",
            f"SUMMARY:{_esc('Ngày ' + str(day) + ': ' + str(s.get('title', '')))}",
            f"DESCRIPTION:{_esc(chr(10).join(desc))}",
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_esc('Sắp đến giờ học: ' + str(s.get('title', '')))}",
            "TRIGGER:-PT15M",
            "END:VALARM",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"


if __name__ == "__main__":  # tự kiểm: python -m src.services.plan_calendar
    p = StudyPlan(id="plan_x", goal="Đồ thị, chu trình; Euler", days=2, minutes_per_day=90)
    p.data = {"sessions": [
        {"id": "s1", "day": 1, "title": "Đồ thị cơ bản", "objective": "a, b; c", "activity": "đọc", "minutes": 45},
        {"id": "s2", "day": 1, "title": "Bậc", "objective": "x" * 200, "activity": "làm", "minutes": 30},
        {"id": "s3", "day": 2, "title": "Euler", "objective": "y", "activity": "z", "minutes": 60},
    ]}  # fmt: skip
    ics = plan_ics(p, date(2026, 10, 1), time(19, 0))
    assert ics.count("BEGIN:VEVENT") == 3
    assert "DTSTART;TZID=Asia/Ho_Chi_Minh:20261001T190000" in ics  # buổi 1 ngày 1
    assert "DTSTART;TZID=Asia/Ho_Chi_Minh:20261001T194500" in ics  # buổi 2 nối sau 45'
    assert "DTSTART;TZID=Asia/Ho_Chi_Minh:20261002T190000" in ics  # ngày 2
    assert "a\\, b\\; c" in ics  # thoát ký tự đặc biệt
    assert all(len(line.encode()) <= 75 for line in ics.split("\r\n"))  # gập dòng
    print("ok")
