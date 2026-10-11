# Copies every frame on the "New UI" page into option B (charcoal rail and bars) on a second page, "New UI (Charcoal)".
# Usage: python -I mk_charcoal.py <project dir>   (downloaded project/ with a fresh canvas.json)
# Writes C_<name>.dc.html next to the originals and adds the boards, notes and page to canvas.json.
import json, os, re, sys

D = sys.argv[1]
SRC_PAGE, NEW_PAGE, PREFIX = 'quote', 'charcoal', 'C_'

# green-tinted greys become neutral greys
M = {'#4B5E52': '#585F5B', '#CBD7CF': '#D6D9D7', '#E3EAE5': '#E8EAE9', '#151D18': '#1B1F1D', '#9CC8AB': '#A9AEAB', '#6A7F73': '#767D79',
     '#E4EAE5': '#E8EAE9', '#B4C5BA': '#C4C7C5', '#A9B3AE': '#B3B6B4', '#3A4A40': '#3A403D', '#8DA195': '#9DA29F', '#5A6E62': '#666C69',
     '#3A7050': '#4A514D', '#D9E3DC': '#E9EBEA', '#8FBFA0': '#A9AEAB', '#25573A': '#343A37', '#CFE6D6': '#C7CBC9', '#B9C9BF': '#C4C7C5',
     '#8FA699': '#9DA29F', '#2F4A3A': '#343A37', '#EEF3EF': '#F0F1F0', '#5E8C72': '#5A615D', '#BFE0CC': '#C9CCCA', '#D5DED8': '#DDDFDE',
     '#E8EEEA': '#ECEEED', '#B9C6BE': '#BFC3C1', '#DDF1E4': '#E8EAE9', '#5C6E62': '#666C69', '#E3F1E8': '#E8EAE9', '#70847A': '#767D79',
     '#9DB0A5': '#B0B4B2', '#3B4A40': '#3A403D', '#EEF6F0': '#F0F1F0', '#E3EAE6': '#E8EAE9', '#3A6A55': '#4A514D', '#D6EFE5': '#E8EAE9',
     '#D5E5DA': '#DDDFDE', '#DCE4DF': '#E3E5E4', '#9AAAA0': '#9DA29F', '#F2F6F3': '#F0F1F0', '#1F6E55': '#14803C',
     # charcoal rail and bars
     '#0F3B22': '#1F2422', '#1F4A39': '#2A302D'}


def convert(t):
    t = t.replace('background: #7FDBA0; color: #0F3B22', 'background: #14803C; color: #fff')
    t = t.replace('stroke="#7FDBA0"', 'stroke="#FFFFFF"').replace('color: #7FDBA0', 'color: #E6E8E7')
    t = t.replace('border-radius: 3px; background: #7FDBA0', 'border-radius: 3px; background: #14803C')
    t = t.replace('border-right: 3px solid #7FDBA0', 'border-right: 3px solid #14803C')
    t = t.replace('rgba(15,59,34,', 'rgba(20,24,22,')
    pat = re.compile('|'.join(re.escape(k) for k in sorted(M, key=len, reverse=True)), re.I)
    t = pat.sub(lambda m: M[m.group(0).upper()], t)
    return t


cj = os.path.join(D, 'canvas.json')
c = json.load(open(cj, encoding='utf-8'))
boards = [(k, b) for k, b in c['boards'].items() if b.get('page') == SRC_PAGE and not k.startswith('QEV')]
for k, b in boards:
    t = convert(open(os.path.join(D, k), encoding='utf-8').read())
    t = re.sub(r'<title>([^<]*)</title>', lambda m: '<title>' + m.group(1) + ' Charcoal</title>', t, count=1)
    open(os.path.join(D, PREFIX + k), 'w', encoding='utf-8', newline='\n').write(t)
    nb = dict(b)
    nb['page'] = NEW_PAGE
    c['boards'][PREFIX + k] = nb
    c['order'].append(PREFIX + k)

for k, n in list(c['notes'].items()):
    if n.get('page') == SRC_PAGE:
        nn = dict(n)
        nn['page'] = NEW_PAGE
        c['notes'][NEW_PAGE + '_' + k] = nn
c['notes'][NEW_PAGE + '_label'] = dict(page=NEW_PAGE, x=-1781, y=-2750, w=1100, maxH=400, size='s', fill='gray',
                                       text='Option B: charcoal rail and charcoal card title bars, light gray table and board headers, green only for actions. '
                                            'A copy of every frame on the New UI page. Change the layout on New UI first, then regenerate this page with mk_charcoal.py.')
if not any(p['id'] == NEW_PAGE for p in c['pages']):
    c['pages'].append({'id': NEW_PAGE, 'name': 'New UI (Charcoal)'})
json.dump(c, open(cj, 'w', encoding='utf-8', newline='\n'), indent=2, ensure_ascii=False)
print(len(boards), 'frames')
