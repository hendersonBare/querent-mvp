# Round 2 table fixes, applied to the New UI and New UI (Charcoal) frames.
# 1. Quote editor: one set of column widths in every frame (E7 adds Available and Cost between Qty and Unit price, nothing else moves).
# 2. E8: the Add item results drop down over the page instead of being clipped by the card.
# 3. E9: line details use three columns (Why this price and What Dana asked for stacked), and On hand / On order stay on one line.
# 4. Teams and Reps: the customer count has its own Customers column.
# Usage: python -I mk_round2.py <project dir>
import glob, os, re, sys

D = sys.argv[1]
BAR = '(?:#1F4A39|#2A302D)'
log = []


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


def children(s):
    """direct child divs of the div that s opens (s starts with that div's opening tag)"""
    i = s.index('>') + 1
    out = []
    while s.startswith('<div', i):
        e = i + balanced(s[i:], 0)
        out.append(s[i:e])
        i = e
    return out


def widths(t):
    return t.replace('1fr 70px 138px 90px 92px 16px', '1fr 60px 118px 78px 82px 16px')


def e8(t):
    pat = r'<section style="background: #fff; border-radius: 14px; overflow: hidden">(<div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: ' + BAR + '; color: #fff)'
    t, n = re.subn(pat, r'<section style="background: #fff; border-radius: 14px; overflow: visible">\1; border-radius: 14px 14px 0 0', t, count=1)
    assert n == 1
    return t


def e9(t):
    m = re.search(r'<div style="margin-top: 12px; background: #(?:EEF3EF|F0F1F0); border-radius: 10px; padding: 16px 18px; display: grid; grid-template-columns: 1\.15fr 1\.6fr 1\.05fr 1fr; gap: 26px; font-size: 13\.5px">', t)
    assert m
    start = m.start()
    end = start + balanced(t[start:], 0)
    panel = t[start:end]
    c = children(panel)
    assert len(c) == 4, len(c)
    c1, c2, c3, c4 = c
    c4 = c4.replace('<div>', '<div style="margin-top: 14px">', 1)
    c1 = c1[:-len('</div>')] + c4 + '</div>'
    c3 = c3.replace('<span>On hand</span>', '<span style="white-space: nowrap">On hand</span>').replace('<span>On order</span>', '<span style="white-space: nowrap">On order</span>')
    c3 = c3.replace('grid-template-columns: 1fr 1fr 1fr', 'grid-template-columns: 0.9fr 1fr 1fr')
    head = m.group(0).replace('1.15fr 1.6fr 1.05fr 1fr; gap: 26px', '1.2fr 1.5fr 1.2fr; gap: 24px')
    return t[:start] + head + c1 + c2 + c3 + '</div>' + t[end:]


def teams(t):
    t = t.replace('grid-template-columns: minmax(180px, 1.6fr) 1.2fr 1.1fr 70px 28px', 'grid-template-columns: minmax(160px, 1.4fr) 0.9fr 1.2fr 1.1fr 70px 28px')
    t, n1 = re.subn(r'(<div style="text-align: left">:: Rep name</div>)', r'\1<div style="text-align: left">:: Customers</div>', t)
    t, n2 = re.subn(r'<div style="display: flex; align-items: center; gap: 12px"><span style="font-weight: 800">([^<]*)</span>(<button [^>]*>[^<]*</button>)</div>',
                    r'<div style="font-weight: 800">\1</div><div>\2</div>', t)
    return t


changed = []
for f in sorted(glob.glob(os.path.join(D, '*.dc.html'))):
    n = os.path.basename(f)
    t = o = open(f, encoding='utf-8').read()
    if re.match(r'(C_)?(QE\d+|QEBase|QEV\d)\.dc\.html$', n):
        t = widths(t)
        if re.match(r'(C_)?QE8\.dc\.html$', n):
            t = e8(t)
        if re.match(r'(C_)?QE9\.dc\.html$', n):
            t = e9(t)
    if re.match(r'(C_)?(TR\d|TRBase)\.dc\.html$', n):
        t = teams(t)
    if t != o:
        open(f, 'w', encoding='utf-8', newline='\n').write(t)
        changed.append(n)
print(len(changed), changed)
