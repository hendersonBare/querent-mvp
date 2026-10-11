# Table spacing fixes on the New UI pages.
# 1. Quote editor item rows: plain-text cells (Available, Cost, Total, remove) sit on the same centre line as the 34px input boxes,
#    and the item name lines up with them. Also fixes a stray "50%%" that broke the round ? badge.
# 2. Customers (CUBase and C_CUBase only): the customer list was in the frame twice, remove the duplicate block.
# Usage: python -I mk_table_fix.py <project dir>   -> rewrites the frames in place and prints the files it changed
import glob, os, re, sys

D = sys.argv[1]
ROW = '<div style="display: grid; grid-template-columns: '


def balanced(s, start):
    depth, i = 0, start
    while True:
        a, b = s.find('<div', i), s.find('</div>', i)
        if a != -1 and a < b:
            depth += 1
            i = a + 4
        else:
            depth -= 1
            i = b + 6
            if depth == 0:
                return i


def fix_row(r):
    r = r.replace('<div style="font-weight: 700; line-height: 1.3">', '<div style="font-weight: 700; line-height: 1.3; margin-top: 7px">')
    r = r.replace('<div style="font-size: 13.5px"><div>', '<div style="font-size: 13.5px; min-height: 34px; display: flex; align-items: center"><div>')
    r = r.replace('<div style="font-variant-numeric: tabular-nums">$', '<div style="font-variant-numeric: tabular-nums; min-height: 34px; display: flex; align-items: center">$')
    r = r.replace('<div style="text-align: right; font-weight: 800; font-variant-numeric: tabular-nums">',
                  '<div style="text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; min-height: 34px; display: flex; align-items: center; justify-content: flex-end">')
    r = r.replace('font-size: 16px; padding: 0">x</button>', 'font-size: 16px; padding: 0; height: 34px">x</button>')
    return r


def fix_items(t):
    out, i = [], 0
    while True:
        j = t.find(ROW, i)
        if j == -1:
            out.append(t[i:])
            break
        e = j + balanced(t[j:], 0)
        row = t[j:e]
        out.append(t[i:j])
        out.append(fix_row(row) if 'align-items: start' in row.split('>')[0] else row)
        i = e
    return ''.join(out).replace('50%%', '50%')


changed = []
files = [f for f in glob.glob(os.path.join(D, '*.dc.html')) if re.match(r'(C_)?(QE\d*|QEBase|QEV\d)\.dc\.html$', os.path.basename(f))]
for f in sorted(files):
    t = open(f, encoding='utf-8').read()
    n = fix_items(t)
    if n != t:
        open(f, 'w', encoding='utf-8', newline='\n').write(n)
        changed.append(os.path.basename(f))

for name in ('CUBase.dc.html', 'C_CUBase.dc.html'):
    p = os.path.join(D, name)
    t = open(p, encoding='utf-8').read()
    secs = list(re.finditer(r'<section.*?</section>', t, flags=re.S))
    if len(secs) == 2 and secs[0].group(0) == secs[1].group(0):
        t = t[:secs[1].start()] + t[secs[1].end():]
        open(p, 'w', encoding='utf-8', newline='\n').write(t)
        changed.append(name)
print(len(changed), changed)
