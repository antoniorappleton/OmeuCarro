import os

replacements = {
    'í§í£o' : 'ção',
    'í§íµes': 'ções',
    'í§íµ'  : 'çõ',
    'í§'    : 'ç',
    'í­'    : 'í',
    'í¡'    : 'á',
    'íª'    : 'ê',
    'í³'    : 'ó',
    'í©'    : 'é',
    'í '    : 'à',
    'íº'    : 'ú',
    'â‚¬'   : '€',
    'Âº'    : 'º',
    'â€“'   : '–',
    'Ã³'    : 'ó',
    'Ã§'    : 'ç',
    'Ã£'    : 'ã',
    'Ã¡'    : 'á',
    'Ã©'    : 'é',
    'Ã'     : 'í',
    'íµ'    : 'õ',
    'â—'    : '●',
    'í²'    : 'ò',
    'íˆ'    : 'È',
    'í€'    : 'À',
    'í‰'    : 'É',
    'í¢'    : 'â',
    'í’'    : 'Ò',
    'í„'    : 'Ä',
    'í'     : 'í',
    'especí­fico': 'específico',
    'Veí­culos': 'Veículos',
    'Definií§íµes': 'Definições',
    'Notificaí§íµes': 'Notificações',
    'Aplicaí§í£o': 'Aplicação',
    'Sincronizaí§í£o': 'Sincronização',
    'Manutení§í£o': 'Manutenção',
    'Aparíªncia': 'Aparência'
}

def fix_file(path):
    try:
        # Read the file
        with open(path, 'rb') as f:
            raw_data = f.read()
        
        # Try to decode as utf-8
        try:
            content = raw_data.decode('utf-8')
        except UnicodeDecodeError:
            # If fail, ignore or try latin-1
            return

        original = content
        for k, v in replacements.items():
            content = content.replace(k, v)
        
        if content != original:
            with open(path, 'w', encoding='utf-8') as wf:
                wf.write(content)
            print(f'Fixed: {path}')
    except Exception as e:
        print(f'Error fixing {path}: {e}')

# Scope: root, pages, js, css
for root, dirs, files in os.walk('.'):
    # Skip .git or .gemini
    if '.git' in root or '.gemini' in root:
        continue
        
    for name in files:
        if name.endswith(('.html', '.js', '.css', '.json')):
            fix_file(os.path.join(root, name))
