# Applies the recommended UI standard to every frame (New UI and New UI (Charcoal)).
# Standard: card title bar 12x20 padding with a 15.5px bold title; panel buttons 38px high;
#           table header row 10x20 padding with 12.5px bold text; table body row 14x20 padding; board column header 12x16.
# Usage: python -I mk_standard.py <project dir>   -> rewrites frames in place, prints per-rule counts
import collections, glob, os, re, sys

D = sys.argv[1]
BAR_BG = '(?:#1F4A39|#2A302D)'
counts = collections.Counter()


def sub(rule, pat, repl, t, flags=0):
    new, n = re.subn(pat, repl, t, flags=flags)
    counts[rule] += n
    return new


def bar_title(t):
    # first child of every card title bar gets the 15.5px title size
    def fix(m):
        head, child = m.group(1), m.group(2)
        if 'font-size' in child:
            child2 = re.sub(r'font-size: [0-9.]+px', 'font-size: 15.5px', child)
        elif 'font-weight: 800' in child:
            child2 = child[:-1] + '; font-size: 15.5px"'
        else:
            return m.group(0)
        if child2 != child:
            counts['bar title 15.5px'] += 1
        return head + child2
    return re.sub(r'(<div style="[^"]*padding: 12px 20px; background: ' + BAR_BG + r'[^"]*">\s*<(?:div|span)[^>]* style=)("[^"]*")', fix, t)


def convert(t):
    # 1 card title bars: 12x20
    t = sub('bar padding 12x20', r'padding: 12px (?:16|18)px; background: (' + BAR_BG + ')', r'padding: 12px 20px; background: \1', t)
    t = bar_title(t)
    # 2 panel buttons 38px
    t = sub('panel Save 38px', r'height: 34px; padding: 0 (16|20)px; border-radius: 9px; background: (#7FDBA0|#14803C)', r'height: 38px; padding: 0 \1px; border-radius: 9px; background: \2', t)
    t = sub('bar Filter 38px', r'height: (?:32|34)px; padding: 0 1[24]px; border: 1px solid (#5E8C72|#5A615D)', r'height: 38px; padding: 0 14px; border: 1px solid \1', t)
    # 3 quote table and board
    t = sub('quote table header', r'padding: 13px 22px; font-size: 13px', 'padding: 10px 20px; font-size: 12.5px', t)
    t = sub('quote table row', r'padding: 15px 22px; border-top', 'padding: 14px 20px; border-top', t)
    t = sub('board column header', r'padding: 11px 14px; background: (' + BAR_BG + '|#E4EAE5|#E8EAE9)', r'padding: 12px 16px; background: \1', t)
    # 4 header rows of every table (rows that start with a :: handle)
    def hdr(m):
        s = m.group(1)
        s2 = re.sub(r'padding: 10px (?:14|18)px', 'padding: 10px 20px', s)
        s2 = re.sub(r'font-size: 12px; font-weight: 800', 'font-size: 12.5px; font-weight: 800', s2)
        if s2 != s:
            counts['table header row'] += 1
        return '<div style="' + s2 + '">' + m.group(2)
    t = re.sub(r'<div style="(display: grid;[^"]*)">(<div[^>]*>:: )', hdr, t)
    # 5 body rows of every table: 14x20
    def row(m):
        s = m.group(1)
        s2 = re.sub(r'padding: (?:13|14|16)px (?:18|20)px', 'padding: 14px 20px', s)
        if s2 != s:
            counts['table body row'] += 1
        return '<div style="' + s2 + '">'
    t = re.sub(r'<div style="([^"]*display: grid;[^"]*border-top: 1px solid #(?:E3EAE5|E8EAE9)[^"]*)">', row, t)
    t = re.sub(r'<div style="(padding: (?:13|14|16)px (?:18|20)px; border-top: 1px solid #(?:E3EAE5|E8EAE9))">', row, t)
    return t


changed = []
for f in sorted(glob.glob(os.path.join(D, '*.dc.html'))):
    n = os.path.basename(f)
    if not re.match(r'(C_)?(AN\d*|ANBase|CU\d|CUBase|OR\d|ORBase|ST\d|STBase|QE\d*|QEBase|QEV\d|QOB\d|QOBoard|QOT\d|QOTable|RAN\d|RCU1|RCUBase|RQB\d|RQBoard|RQTable|RS\d|S\d|TR\d|TRBase|CV\d)\.dc\.html$', n):
        continue
    t = open(f, encoding='utf-8').read()
    c = convert(t)
    if c != t:
        open(f, 'w', encoding='utf-8', newline='\n').write(c)
        changed.append(n)
print(len(changed), 'files changed')
for k, v in sorted(counts.items()):
    print(' ', k, v)
open(os.path.join(D, '_changed.txt'), 'w').write('\n'.join(changed))
