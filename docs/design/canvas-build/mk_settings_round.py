# Settings round: right-aligned inputs, feature flags, customer dropdown, Data sources removed, descriptions trimmed, rep email toggles removed.
# Applies to the New UI and New UI (Charcoal) frames. Usage: python -I mk_settings_round.py <project dir>
# Not idempotent for the unit-text move (run once on a fresh download), the other steps are safe to re-run.
import glob, os, re, sys

D = sys.argv[1]
SETTINGS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']
REP = ['RS1', 'RS2', 'RS3', 'RS4']
SUBLINE = {
    'miles; farther is call for freight': 'Miles. Farther is call for freight',
    'x straight-line miles': 'Multiplier on straight-line miles',
    '% of goods': 'Percent of goods value',
    '% at most': 'Percent, at most',
    "% over a line's price": "Percent over a line's price, at most",
    'steps': 'Number of steps',
    'days': 'Days',
    'miles per gallon': 'Miles per gallon',
    'per gallon; blank uses the state price': 'Per gallon. Blank uses the state price',
    'mph': 'Miles per hour',
    'minutes per delivery': 'Minutes per delivery',
    'per mile': '',
    'per hour': '',
}
log = []


def rd(n):
    return open(os.path.join(D, n + '.dc.html'), encoding='utf-8').read()


def wr(n, t):
    open(os.path.join(D, n + '.dc.html'), 'w', encoding='utf-8', newline='\n').write(t)


def drop_text(t, text):
    """remove the element whose only content is `text`"""
    pat = r'<(div|span)[^>]*>\s*' + re.escape(text) + r'\s*</\1>'
    new, n = re.subn(pat, '', t)
    return new


def no_tab(t):
    return re.sub(r'<span style="padding: 10px 2px; [^"]*">Data sources</span>', '', t)


def card_sub(t):
    """the grey description span inside a settings card header"""
    return re.sub(r'<span style="color: #[0-9A-Fa-f]{6}; font-size: 13px; flex: 1 1 260px; min-width: 0; line-height: 1\.35">[^<]*</span>', '', t)


ROW = re.compile(
    r'(<div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: \d+px 20px; border-top: 1px solid #[0-9A-Fa-f]{6}">)'
    r'<div><div style="font-weight: 600">([^<]+)</div></div>'
    r'<div><div style="display: flex; align-items: center; gap: 8px">((?:<span style="[^"]*">\$</span>)?)(<div style="width: \d+px; height: 38px[^"]*">[^<]*</div>)'
    r'<span style="color: (#[0-9A-Fa-f]{6})">([^<]+)</span></div></div></div>')


def right_inputs(t):
    def fix(m):
        head, label, dollar, box, col, unit = m.groups()
        sub = SUBLINE.get(unit, unit)
        subhtml = '<div style="font-size: 12.5px; color: %s; margin-top: 2px">%s</div>' % (col, sub) if sub else ''
        return head + '<div><div style="font-weight: 600">%s</div>%s</div><div><div style="display: flex; align-items: center; gap: 8px">%s%s</div></div></div>' % (label, subhtml, dollar, box)
    return ROW.subn(fix, t)


def flag(t):
    n = 0
    for title in ('Free delivery pricing', 'Recovery pool', 'Delivery cost model'):
        m = re.search(r'<span style="font-weight: 800[^"]*">' + title + '</span>', t)
        if not m:
            continue
        pill = ('<span style="font-size: 11px; font-weight: 800; letter-spacing: 0.06em; padding: 3px 8px; border-radius: 6px; background: #FBE7A1; color: #5C4300; white-space: nowrap; flex: none">FEATURE FLAG: HIDDEN</span>')
        t = t[:m.end()] + pill + t[m.end():]
        s = t.rfind('<section style="background: #fff; border-radius: 14px; overflow: hidden', 0, m.start())
        if s != -1 and 'outline' not in t[s:s + 160]:
            t = t[:s] + t[s:].replace('overflow: hidden', 'overflow: hidden; outline: 2px dashed #9DA29F; outline-offset: -2px', 1)
        n += 1
    return t, n


changed = {}
for pre in ('', 'C_'):
    for base in SETTINGS:
        n = pre + base
        t = o = rd(n)
        t = no_tab(t)
        if base in ('S1', 'S2', 'S3', 'S8'):
            t = card_sub(t)
        if base == 'S1':
            t = re.sub(r'<div style="font-size: 13px; color: #[0-9A-Fa-f]{6}; margin-top: 2px">[^<]*</div>', '', t)
        if base == 'S3':
            t = drop_text(t, 'Type to search. Managers are not listed.')
        if base == 'S8':
            t = re.sub(r'<div style="font-size: 12\.5px; color: #[0-9A-Fa-f]{6}; margin-top: 2px; max-width[^"]*">[^<]*</div>', '', t)
        if base in ('S4', 'S5', 'S6', 'S7'):
            if 'font-weight: 600">Delivery radius' in t and 'Miles. Farther' not in t:
                t, k = right_inputs(t)
                log.append((n, 'rows moved', k))
            t, k = flag(t)
            log.append((n, 'flags', k))
        if t != o:
            wr(n, t)
            changed[n] = 1
    for base in REP:
        n = pre + base
        t = o = rd(n)
        if base in ('RS1', 'RS3', 'RS4', 'RS2'):
            t = card_sub(t)
        if base == 'RS2':
            t = drop_text(t, 'Customers see your name, phone and email on quotes you send.')
        if base == 'RS4':
            t = re.sub(r'<div style="color: #[0-9A-Fa-f]{6}; font-size: 12\.5px; margin-top: 2px">[^<]*</div>', '', t)
            t = t.replace('grid-template-columns: 1fr 90px 90px', 'grid-template-columns: 1fr 90px')
            t = re.sub(r'<div>:: Email</div>', '', t)
            tog = r'(<span style="position: relative; width: 40px; height: 22px; border-radius: 999px; background: #[0-9A-Fa-f]{6}; display: block"><span style="position: absolute; top: 3px; (?:right|left): 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff"></span></span>)'
            t = re.sub(tog + tog, r'\1', t)
        if t != o:
            wr(n, t)
            changed[n] = 1

# customer picker as a dropdown, plus an open state and a one-customer state
CUST = [('Wasatch Mechanical Contractors', 'WAS-1142'), ('Canyon Ridge Builders', 'CRB-3318'), ('Great Basin Fabrication', 'GBF-2207'),
        ('Utah Valley Electric', 'UVE-5126'), ('Weber Basin Fabricators', 'WBF-6074'), ('Uinta Facility Services', 'UFS-4051')]
CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-left: auto; flex: none"><path d="M6 9l6 6 6-6"/></svg>'
for pre in ('', 'C_'):
    n = pre + 'S1'
    t = rd(n)
    charcoal = pre == 'C_'
    sel_bg, border, mono = ('#E8EAE9', '#D6D9D7', '#767D79') if charcoal else ('#E3F1E8', '#CBD7CF', '#6A7F73')
    m = re.search(r'(<div style="width: \d+px; max-width: 100%; box-sizing: border-box; height: 42px; border-radius: 10px; background: #fff; border: 1px solid #[0-9A-Fa-f]{6}; display: flex; align-items: center; gap: 10px; padding: 0 14px">)(<svg.*?</svg>)<span style="font-weight: 600">All customers</span></div>', t, flags=re.S)
    assert m, n

    def picker(label, open_=False):
        head = re.sub(r'border: 1px solid #[0-9A-Fa-f]{6}', 'border: 2px solid #14803C', m.group(1)) if open_ else m.group(1)
        body = '<div style="position: relative">' + head + m.group(2) + '<span style="font-weight: 600">%s</span>' % label + CHEV + '</div>'
        if open_:
            rows = '<div style="display: flex; justify-content: space-between; padding: 9px 10px; border-radius: 8px; background: %s"><span style="font-weight: 600">All customers</span></div>' % sel_bg
            rows += ''.join('<div style="display: flex; justify-content: space-between; padding: 9px 10px; border-radius: 8px"><span style="font-weight: 600">%s</span><span style="font-family: Geist Mono, monospace; font-size: 11.5px; color: %s">%s</span></div>' % (x, mono, y) for x, y in CUST)
            body += '<div style="position: absolute; top: 48px; left: 0; width: 360px; box-sizing: border-box; background: #fff; border: 1px solid %s; border-radius: 12px; box-shadow: 0 18px 40px rgba(0,0,0,0.2); padding: 5px; z-index: 8; font-size: 14px; font-weight: 500">%s</div>' % (border, rows)
        return body + '</div>'
    wr(n, t[:m.start()] + picker('All customers') + t[m.end():])
    wr(pre + 'S1a', t[:m.start()] + picker('All customers', True) + t[m.end():])
    # one customer selected: Pricing is not shared with this customer
    t1 = t[:m.start()] + picker('Wasatch Mechanical Contractors') + t[m.end():]
    parts = t1.split('Querent answers</span>')
    assert len(parts) == 5
    off = re.sub(r'background: #[0-9A-Fa-f]{6}; display: block"><span style="position: absolute; top: 3px; right: 3px', 'background: #BFC3C1; display: block"><span style="position: absolute; top: 3px; left: 3px', parts[2], count=1)
    t1 = parts[0] + 'Querent answers</span>' + parts[1] + 'Not shared</span>' + off + 'Querent answers</span>' + parts[3] + 'Querent answers</span>' + parts[4]
    wr(pre + 'S1b', t1)
    changed[n] = 1
print(len(changed), 'files changed')
for l in log:
    print(l)
