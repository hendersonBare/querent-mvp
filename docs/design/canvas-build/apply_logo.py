import re, glob, os
P = r"design\project"

def svg(size, color):
    return ('<svg width="%d" height="%d" viewBox="10 10 80 80" fill="none" stroke="%s" stroke-width="7.5" stroke-linecap="round" role="img" aria-label="Querent">'
            '<circle cx="49" cy="49" r="28.5"/><path d="M60 60 81 82"/></svg>') % (size, size, color)

DIRECT = {
    'RailMoss': '#8FD1A6', 'RailEmerald': '#6EE0B0', 'RailKelly': '#7FDBA0', 'RailSpruce': '#A5E8CB', 'RailForest': '#2FB36B', 'RailFern': '#84D3AE',
}
pat = re.compile(r'<div style="([^"]*)">Q</div>')
done = 0
for path in sorted(glob.glob(P + "\\*.dc.html")):
    name = os.path.basename(path).replace('.dc.html', '')
    s = open(path, encoding='utf-8').read()
    direct = None
    if name in DIRECT:
        direct = DIRECT[name]
    elif name.startswith('K') or name.startswith('QO'):
        direct = '#7FDBA0'

    def sub(m):
        style = m.group(1)
        w = int(re.search(r'width: (\d+)px', style).group(1))
        if direct:
            return svg(w + 4, direct)
        return '<div style="' + style + '">' + svg(int(round(w * 0.64)), 'currentColor') + '</div>'

    n, c = pat.subn(sub, s)
    if c:
        open(path, 'w', encoding='utf-8', newline='\n').write(n)
        done += c
        print(name, c, 'direct' if direct else 'tile')
print('replaced', done)
