from pathlib import Path

p = Path("scripts/raf_v1625_update.py")
lines = p.read_text(encoding="utf-8").splitlines()
out = []
i = 0
while i < len(lines):
    if lines[i].startswith("pattern = re.compile("):
        out.extend([
            "start_marker = '      <div class=\"site-settings-section\">\\n        <h3>Układ zdjęć</h3>'",
            "end_marker = '      <div class=\"site-settings-section\">\\n        <h3>Kolory aktywne / filtry</h3>'",
        ])
        i += 1
        while i < len(lines):
            if lines[i].strip() == ")" and i > 0 and "re.S" in lines[i - 1]:
                i += 1
                break
            i += 1
        continue

    if "text, count = pattern.subn(replacement, text, count=1)" in lines[i]:
        out.extend([
            "start_pos = text.find(start_marker)",
            "end_pos = text.find(end_marker, start_pos)",
            "if start_pos < 0 or end_pos < 0:",
            "    raise RuntimeError(f'admin.html markers missing: start={start_pos}, end={end_pos}')",
            "text = text[:start_pos] + replacement + text[end_pos + len(end_marker):]",
            "count = 1",
        ])
        i += 1
        continue

    out.append(lines[i])
    i += 1

p.write_text("\n".join(out) + "\n", encoding="utf-8")
