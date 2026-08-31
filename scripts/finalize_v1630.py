from pathlib import Path

files = {
    'app.js': [
        ('hidden: "Ukryte",', 'hidden: "Odrzucone",'),
    ],
    'admin.js': [
        ('hidden: "Ukryte",', 'hidden: "Odrzucone",'),
    ],
    'index.html': [
        ('style.css?v=16.2.5', 'style.css?v=16.3.0'),
        ('app.js?v=16.2.5', 'app.js?v=16.3.0'),
        ('>Ukryte</button>', '>Odrzucone</button>'),
    ],
    'admin.html': [
        ('style.css?v=16.2.5', 'style.css?v=16.3.0'),
        ('admin.js?v=16.2.5', 'admin.js?v=16.3.0'),
        ('id="uiLabelHidden" value="Ukryte"', 'id="uiLabelHidden" value="Odrzucone"'),
    ],
}

for name, replacements in files.items():
    path = Path(name)
    text = path.read_text(encoding='utf-8')
    for old, new in replacements:
        if old not in text:
            raise RuntimeError(f'{name}: missing expected text: {old}')
        text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')

print('v16.3.0 labels/cache finalized')
