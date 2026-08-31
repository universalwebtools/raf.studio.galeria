from pathlib import Path

root = Path('.')
index_path = root / 'index.html'
admin_path = root / 'admin.html'
workflow_path = root / '.github/workflows/raf-v16.4-client-zone.yml'
script_path = root / 'tools/v164_patch.py'

index = index_path.read_text(encoding='utf-8')
redirect = '''  <script>
    // v16.4: główny adres jest katalogiem galerii; konkretne linki ?g=... działają jak dotąd.
    if (!new URLSearchParams(location.search).get('g')) {
      location.replace('home.html');
    }
  </script>\n'''
if 'v16.4: główny adres jest katalogiem galerii' not in index:
    if '</head>' not in index:
        raise SystemExit('index.html: brak </head>')
    index = index.replace('</head>', redirect + '</head>', 1)
    index_path.write_text(index, encoding='utf-8')

admin = admin_path.read_text(encoding='utf-8')
module = '  <script type="module" src="gallery-index-sync.js?v=16.4"></script>\n'
if 'gallery-index-sync.js?v=16.4' not in admin:
    marker = '</body>'
    if marker not in admin:
        raise SystemExit('admin.html: brak </body>')
    admin = admin.replace(marker, module + marker, 1)
    admin_path.write_text(admin, encoding='utf-8')

# One-time installer cleans itself after applying the patch.
if workflow_path.exists():
    workflow_path.unlink()
if script_path.exists():
    script_path.unlink()
