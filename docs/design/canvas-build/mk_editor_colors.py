# Three lower-green colour options for the base quote editor (QEBase).
# Usage: python -I mk_editor_colors.py <project dir with QEBase.dc.html>   -> writes QEV1/2/3.dc.html beside it
import os, re, sys

D = sys.argv[1]
src = open(os.path.join(D, 'QEBase.dc.html'), encoding='utf-8').read()

# green-tinted greys become neutral greys (all options)
NEUTRAL = {'#CBD7CF': '#D6D9D7', '#4B5E52': '#585F5B', '#6A7F73': '#767D79', '#5A6E62': '#666C69', '#E3EAE5': '#E8EAE9',
           '#E4EAE5': '#E8EAE9', '#B4C5BA': '#C4C7C5', '#B9C6BE': '#BFC3C1', '#8FA699': '#9DA29F', '#2F4A3A': '#343A37',
           '#3A4A40': '#3A403D', '#151D18': '#1B1F1D', '#DDF1E4': '#E8EAE9'}
BAR = 'background: #1F4A39; color: #fff'


def swap(t, m):
    for a, b in m.items():
        t = t.replace(a, b)
    return t


def split(t):
    a, b = t.index('<aside'), t.index('</aside>') + len('</aside>')
    return t[:a], t[a:b], t[b:]


def light_bars(main):
    main = main.replace('background: #7FDBA0; color: #0F3B22', 'background: #14803C; color: #fff')
    main = main.replace('rgba(255,255,255,0.16)', 'rgba(0,0,0,0.08)').replace('#CFE6D6', '#585F5B')
    # white text inside the Items bar
    main = main.replace('<div style="color: #fff"><div style="display: flex; align-items: center; gap: 10px"><span style="font-weight: 700; color: #fff">',
                        '<div style="color: #1B1F1D"><div style="display: flex; align-items: center; gap: 10px"><span style="font-weight: 700; color: #1B1F1D">')
    return main


def build(name, page_bg, aside_map, bar_style, light):
    pre, aside, post = split(src)
    pre = pre.replace('background: #D9E3DC', 'background: ' + page_bg)
    post = post.replace(BAR, bar_style).replace('background: #0F3B22; color: #fff; font-size: 11.5px', 'background: #2A302D; color: #fff; font-size: 11.5px')
    if light:
        post = light_bars(post)
    else:
        post = post.replace('background: #7FDBA0; color: #0F3B22', 'background: #14803C; color: #fff').replace('#CFE6D6', '#C7CBC9')
    aside = swap(aside, aside_map)
    out = swap(pre + aside + post, NEUTRAL)
    out = re.sub(r'<title>[^<]*</title>', '<title>Quote Editor ' + name + '</title>', out, count=1)
    open(os.path.join(D, name + '.dc.html'), 'w', encoding='utf-8', newline='\n').write(out)


# A: gray bars, green rail kept
build('QEV1', '#E9EBEA', {}, 'background: #E8EAE9; color: #1B1F1D', True)

# B: charcoal rail and bars, green only for actions
build('QEV2', '#E9EBEA',
      {'background: #0F3B22': 'background: #1F2422', '#9CC8AB': '#A9AEAB', '#25573A': '#343A37', '#8FBFA0': '#A9AEAB', '#3A7050': '#4A514D',
       '#7FDBA0': '#FFFFFF', 'color: #0F3B22': 'color: #1F2422'},
      'background: #2A302D; color: #fff', False)

# C: white rail, white bars, green only for actions
# order matters: the active nav item first, then the remaining white text
cmap = {}
build('QEV3', '#F3F4F3', cmap, 'background: #fff; color: #1B1F1D; border-bottom: 1px solid #E3E5E4', True)
p = os.path.join(D, 'QEV3.dc.html')
t = open(p, encoding='utf-8').read()
pre, aside, post = split(t)
aside = aside.replace('background: #14803C; color: #fff; font-weight: 700', 'background: #E8EAE9; color: #14803C; font-weight: 700')
aside = aside.replace('background: #0F3B22', 'background: #fff').replace('#9CC8AB', '#585F5B').replace('#25573A', '#E3E5E4').replace('#8FBFA0', '#767D79')
aside = aside.replace('stroke="#7FDBA0"', 'stroke="#14803C"').replace('color: #7FDBA0', 'color: #585F5B')
aside = aside.replace('border: 1px solid #3A7050', 'border: 1px solid #D6D9D7')
aside = aside.replace('width: 38px; height: 38px; border-radius: 50%; background: #fff; color: #0F3B22', 'width: 38px; height: 38px; border-radius: 50%; background: #1B1F1D; color: #fff')
aside = aside.replace('color: #fff', 'color: #1B1F1D')
aside = aside.replace('background: #1B1F1D; color: #1B1F1D', 'background: #1B1F1D; color: #fff')  # avatar text stays white
open(p, 'w', encoding='utf-8', newline='\n').write(pre + aside + post)
print('ok')
