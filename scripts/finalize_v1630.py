from pathlib import Path


def maybe_replace(path_name, old, new):
    path = Path(path_name)
    text = path.read_text(encoding='utf-8')
    if old in text:
        text = text.replace(old, new, 1)
        path.write_text(text, encoding='utf-8')
        print(f'{path_name}: updated {old!r} -> {new!r}')
    elif new in text:
        print(f'{path_name}: already finalized: {new!r}')
    else:
        raise RuntimeError(f'{path_name}: neither old nor new marker found: {old!r} / {new!r}')

# JS already contains most v16.3 rejected-photo logic on stable main.
# These replacements are deliberately idempotent.
maybe_replace('app.js', 'hidden: "Ukryte",', 'hidden: "Odrzucone",')
maybe_replace('admin.js', 'hidden: "Ukryte",', 'hidden: "Odrzucone",')

# Expose the feature in visible UI and force fresh browser cache.
maybe_replace('index.html', 'style.css?v=16.2.5', 'style.css?v=16.3.0')
maybe_replace('index.html', 'app.js?v=16.2.5', 'app.js?v=16.3.0')
maybe_replace('index.html', '>Ukryte</button>', '>Odrzucone</button>')

maybe_replace('admin.html', 'style.css?v=16.2.5', 'style.css?v=16.3.0')
maybe_replace('admin.html', 'admin.js?v=16.2.5', 'admin.js?v=16.3.0')
maybe_replace('admin.html', 'id="uiLabelHidden" value="Ukryte"', 'id="uiLabelHidden" value="Odrzucone"')

print('v16.3.0 labels/cache finalized safely')
