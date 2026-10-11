# Builds the rep-view frames from the manager frames already on the canvas.
# Usage: python -I mk_rep.py <dir with downloaded project/*.dc.html> <out dir>
# Rep = Brandi Gallegos (owns Canyon Ridge Builders, Great Basin Fabrication, Wasatch Mechanical Contractors).
# Output frames: RQBoard RQB1 RQB2 RQTable  RCUBase RCU1  RAN1..RAN5  RS1 RS2 RS3 RS4
import re, sys, os

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def rd(n):
    return open(os.path.join(SRC, n + '.dc.html'), encoding='utf-8').read()


def wr(n, t):
    open(os.path.join(OUT, n + '.dc.html'), 'w', encoding='utf-8', newline='\n').write(t)


def rep(t, a, b, count=None):
    assert a in t, 'missing: ' + a[:70]
    return t.replace(a, b) if count is None else t.replace(a, b, count)


def rx(t, pat, repl, flags=re.S):
    new, n = re.subn(pat, repl, t, flags=flags)
    assert n, 'no match: ' + pat[:70]
    return new


def balanced(s, start):
    """index just after the div that opens at s[start]"""
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


def map_rows(t, marker, fn):
    """replace every balanced div that starts with marker by fn(row)"""
    out, i = [], 0
    while True:
        j = t.find(marker, i)
        if j == -1:
            out.append(t[i:])
            return ''.join(out)
        e = j + balanced(t[j:], 0)
        out.append(t[i:j])
        out.append(fn(t[j:e]))
        i = e


def repify(t, title=None):
    a, b = t.index('<aside'), t.index('</aside>')
    side = t[a:b]
    side = re.sub(r'<a [^>]*>(?:(?!</a>).)*?Teams and Reps(?:(?!</a>).)*?</a>', '', side, flags=re.S)
    side = side.replace('>Analytics</span>', '>My Analytics</span>')
    side = side.replace('Brian G.', 'Brandi G.').replace('>Manager<', '>Rep<')
    t = t[:a] + side + t[b:]
    t = re.sub(r"\['Teams and Reps', '[^']*'\], ", '', t)  # nav built in the script block
    t = t.replace("['Analytics',", "['My Analytics',")
    if title:
        t = re.sub(r'<title>[^<]*</title>', '<title>' + title + '</title>', t, count=1)
    return t


# ---------------------------------------------------------------- Quotes
POOL_OLD = 'const pool = [W, CR, BE, SP, RR, TC, W];'
POOL_NEW = 'const pool = [W, CR, W, CR, W, CR, W];'
for src, dst, ttl in [('QOBoard', 'RQBoard', 'Rep Board'), ('QOTable', 'RQTable', 'Rep Table'),
                      ('QOB1', 'RQB1', 'Rep Board Customer Picker'), ('QOB2', 'RQB2', 'Rep Board Filter')]:
    t = repify(rd(src), ttl)
    t = rep(t, POOL_OLD, POOL_NEW)
    t = rep(t, '<span style="font-weight: 600">All customers</span>', '<span style="font-weight: 600">All my customers</span>', 1)
    if dst == 'RQB1':
        i = t.index('<div style="position: absolute; top: 48px; left: 0; width: 360px')
        endm = 'type to search.</div>'
        j = t.index(endm) + len(endm) + len('</div>')
        drop = t[i:j]
        head = drop[:drop.index('>') + 1]
        row = '<div style="display: flex; justify-content: space-between; padding: 9px 10px; border-radius: 8px; background: %s"><span style="font-weight: 600">%s</span><span style="font-family: \'Geist Mono\', monospace; font-size: 11.5px; color: #5C6E62">%s</span></div>'
        body = row % ('#E3F1E8', 'All my customers', '') + ''.join(
            row % ('transparent', n, c) for n, c in [('Wasatch Mechanical Contractors', 'WAS-1142'), ('Canyon Ridge Builders', 'CRB-3318'), ('Great Basin Fabrication', 'GBF-2207')])
        foot = '<div style="padding: 7px 10px 3px; font-size: 11.5px; color: #5C6E62; border-top: 1px solid #E3EAE5; margin-top: 4px">Your 3 customers. Type to search.</div>'
        t = t[:i] + head + body + foot + '</div>' + t[j:]
    if dst == 'RQB2':
        t = rx(t, r'<div style="margin-bottom: 10px"><div style="[^"]*">Rep</div><div style="[^"]*">All reps</div></div>', '')
        t = rep(t, '>Any customer<', '>Any of my customers<')
    wr(dst, t)

# ---------------------------------------------------------------- Customers
MK = '<div style="display: grid; grid-template-columns: minmax(210px, 2fr) 1.2fr 0.8fr 1.3fr 1.1fr 0.7fr 0.7fr 28px;'
NEWGRID = 'minmax(210px, 2fr) 0.8fr 1.3fr 1.1fr 0.7fr 0.7fr 28px'
OLDGRID = 'minmax(210px, 2fr) 1.2fr 0.8fr 1.3fr 1.1fr 0.7fr 0.7fr 28px'
for src, dst, ttl in [('CUBase', 'RCUBase', 'Rep Customers'), ('CU1', 'RCU1', 'Rep Customers Filter')]:
    t = repify(rd(src), ttl)
    def cu(r):
        if not any(n in r for n in ('Canyon Ridge Builders', 'Great Basin Fabrication', 'Wasatch Mechanical Contractors', ':: Customer')):
            return ''
        return re.sub(r'<div style="font-weight: 600">(Brandi Gallegos|Eli Porter|Nora Chen)</div>', '', r)
    t = map_rows(t, MK, cu)
    t = rep(t, '<div style="text-align: left">:: Rep</div>', '')
    t = t.replace(OLDGRID, NEWGRID)
    t = rep(t, '6 customers', '3 customers')
    if dst == 'RCU1':
        k = t.index('Filter customers')
        i = t.index('>Rep</div>', k)
        i = t.rindex('<div style="font-size: 12px; font-weight: 700', 0, i)
        j = t.index('>Terms</div>')
        j = t.rindex('<div style="font-size: 12px; font-weight: 700', 0, j)
        t = t[:i] + t[j:]
        t = rep(t, 'Pick one rep or several to see their customers together.', 'Narrow your customers by terms, balance or open quotes.')
    wr(dst, t)

# ---------------------------------------------------------------- My Analytics
TAB = r'<span[^>]*>Rep leaderboard</span>'


def an_common(t, ttl):
    t = repify(t, ttl)
    t = rx(t, TAB, '')
    t = rep(t, '>Analytics</h1>', '>My Analytics</h1>')
    t = rep(t, 'Quotes and customer questions for the whole organization', 'Quotes and customer questions for your customers')
    return t


OVERVIEW = [('From request to first send, 47 quotes', 'From request to first send, 27 quotes'), ('>73%<', '>74%<'),
            ('29 won, 11 lost, 11 open', '17 won, 6 lost, 6 open'), ('>$47,016<', '>$27,410<'),
            ('$31,059 accepted, 66%', '$18,120 accepted, 66%'), ('>15.7<', '>9.0<'),
            ('20 min for each of 47 quotes sent', '20 min for each of 27 quotes sent'), ('>+$10.20<', '>+$6.40<'),
            ('2 lines you kept, on 2 accepted quotes', '1 line you kept, on 1 accepted quote'),
            ('41 quotes requested in the last 26 weeks, 22 won so far.', '24 quotes requested in the last 26 weeks, 14 won so far.'),
            ('3 lines of 120 under the floor.', '1 line of 71 under the floor.'), ('3 lines under the 22.2% floor', '1 line under the 22.2% floor')]


def overview(t):
    for a, b in OVERVIEW:
        t = rep(t, a, b)
    return t


wr('RAN1', overview(an_common(rd('ANBase'), 'Rep My Analytics')))

t = overview(an_common(rd('AN4'), 'Rep My Analytics Filter'))
t = rep(t, 'Pick any mix of reps and teams, then break the numbers down.', 'Narrow your numbers to one customer or a period.')
k = t.index('Filter analytics')
i = t.index('>Reps</div>', k)
i = t.rindex('<div style="font-size: 12px; font-weight: 700', 0, i)
j = t.index('<div style="height: 6px"></div>')
t = t[:i] + t[j:]
t = rx(t, r'Break the numbers down by(</div><div style="display: flex; background: #EEF3EF[^>]*>)(.*?)</div>',
       lambda m: 'Period' + m.group(1) + m.group(2).replace('Whole organization', '7 days').replace('>Rep<', '>30 days<').replace('>Team<', '>90 days<').replace('>Customer<', '>Custom<') + '</div>')
t = rep(t, '>Any customer<', '>Any of my customers<')
wr('RAN2', t)

# Decline reasons
t = an_common(rd('AN7'), 'Rep Decline Reasons')
t = rep(t, '6 declined quotes', '4 declined quotes')
t = rep(t, ', Mara Jensen, Sep 28', ', Canyon Ridge Builders, Sep 28')
G7 = '<div style="display: grid; grid-template-columns: 2fr 0.8fr 0.8fr 1.1fr 1fr 1fr 1fr;'
data = {'Price too high': (2, 50), 'Found other source': (1, 25), 'Need it sooner than quoted': (1, 25),
        'Wrong items or quantity': (0, 0), 'Other': (0, 0), 'No reason given': (0, 0)}


def dec(r):
    if ':: Reason' in r:
        r = r.replace('grid-template-columns: 2fr 0.8fr 0.8fr 1.1fr 1fr 1fr 1fr', 'grid-template-columns: 2fr 0.8fr 0.8fr')
        return rx(r, r'<div style="text-align: right">:: (Brandi Gallegos|Eli Porter|Mara Jensen|Nora Chen)</div>', '')
    name = re.search(r'<div style="font-weight: 700">([^<]*)</div>', r).group(1)
    n, pct = data[name]
    return ('<div style="display: grid; grid-template-columns: 2fr 0.8fr 0.8fr; gap: 14px; padding: 13px 18px; border-top: 1px solid #E3EAE5">'
            '<div style="font-weight: 700">%s</div><div style="text-align: right"><span style="color: %s; font-weight: 700; font-variant-numeric: tabular-nums">%d</span></div>'
            '<div style="text-align: right">%d%%</div></div>') % (name, '#14803C' if n else '#8DA195', n, pct)


t = map_rows(t, G7, dec)
wr('RAN3', t)

# Untouched quotes
t = an_common(rd('AN8'), 'Rep Untouched Quotes')
G8 = '<div style="display: grid; grid-template-columns: 1.4fr 1fr 1.2fr 1.4fr 1.1fr 1.3fr 1.2fr;'
t = map_rows(t, G8, lambda r: r.replace(':: Rep<', ':: Whose quotes<').replace('>Brandi Gallegos<', '>Your quotes<') if (':: Rep' in r or 'Brandi Gallegos' in r) else '')
wr('RAN4', t)

# Customer questions
t = an_common(rd('AN2'), 'Rep Customer Questions')
for a, b in [(r'>40</span>(<span[^>]*>)of 40<', r'>19</span>\1of 19<'), (r'(Answered with live data</span><span[^>]*>)37<', r'\g<1>17<'),
             (r'(nothing matched</span><span[^>]*>)3<', r'\g<1>2<'), (r'(Total queries.*?<span[^>]*>)40<', r'\g<1>19<'),
             (r'(Estimated time saved.*?)>5\.0<', r'\1>2.4<'), (r'font-weight: 700">16</span>', 'font-weight: 700">6</span>'),
             (r'font-weight: 700">11</span>', 'font-weight: 700">5</span>')]:
    t = rx(t, a, b)
# Pricing and Account both read 10 in the manager frame
t = t.replace('font-weight: 700">10</span>', 'font-weight: 700">4</span>')
t = rep(t, '<div>:: Assigned rep</div>', '')
t = rx(t, r'<div style="color: #4B5E52; font-weight: 600">Brandi Gallegos</div>', '')
t = t.replace('grid-template-columns: 1.6fr 0.8fr 1.4fr', 'grid-template-columns: 1.6fr 0.8fr')
t = rx(t, r'<div style="margin-top: 16px; font-weight: 800; color: #7FDBA0">Manage customer access</div>', '')
wr('RAN5', t)

# ---------------------------------------------------------------- Settings (Margins, Profile)
S2 = rd('S2')
m0 = S2.index('<main')
tabs_at = S2.index('<div style="display: flex; flex-wrap: wrap; gap: 6px 26px; margin-top: 18px; border-bottom')
tail = S2[S2.index('</main>'):]
shell = repify(S2[:m0] + '<main></main>' + tail, None)  # nav and user block fixed
pre = shell[:shell.index('<main></main>')]
post = shell[shell.index('<main></main>') + len('<main></main>'):]
top = S2[m0:tabs_at]


def tabs(active):
    def one(label, on):
        w, c, bc = ('800', '#151D18', '#14803C') if on else ('600', '#4B5E52', 'transparent')
        return '<span style="padding: 10px 2px; font-weight: %s; color: %s; border-bottom: 3px solid %s; margin-bottom: -1px">%s</span>' % (w, c, bc, label)
    return '<div style="display: flex; flex-wrap: wrap; gap: 6px 26px; margin-top: 18px; border-bottom: 1px solid #B9C9BF">' + one('Margins', active == 0) + one('Profile', active == 1) + one('Notifications', active == 2) + '</div>'


def card_head(title, sub, btn, disabled=False):
    bg = '#B9C9BF' if disabled else '#14803C'
    return ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 12px 20px; background: #1F4A39; color: #fff">'
            '<span style="font-weight: 800; font-size: 15.5px; flex: none">%s</span>'
            '<span style="color: #CFE6D6; font-size: 13px; flex: 1 1 260px; min-width: 0; line-height: 1.35">%s</span>'
            '<span style="margin-left: auto; flex: none"><span style="height: 38px; padding: 0 20px; border-radius: 9px; background: %s; color: #fff; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap">%s</span></span></div>') % (title, sub, bg, btn)


CATS = [('Fasteners', 20.0, 24.0), ('Abrasives and Cutting', 25.0, 27.0), ('Safety and PPE', 30.0, 30.0),
        ('Material Handling and Tie-downs', 20.0, 22.0), ('Tools', 18.0, 20.0), ('Janitorial and MRO', 20.0, 23.0)]
G = 'grid-template-columns: 1.4fr 3fr 150px 120px; gap: 24px'


def margin_row(name, floor, mine, shown=None, err=''):
    val = mine if shown is None else shown
    bad = bool(err)
    track = ('<div style="position: relative; height: 10px; border-radius: 5px; background: #E4EAE5"><div style="width: %.1f%%; height: 10px; border-radius: 5px; background: %s"></div>'
             '<div style="position: absolute; left: %.1f%%; top: -4px; width: 4px; height: 18px; border-radius: 2px; background: #1F4A39; margin-left: -2px"></div>'
             '<div style="position: absolute; left: %.1f%%; top: -4px; width: 4px; height: 18px; border-radius: 2px; background: %s; margin-left: -2px"></div></div>') % (
        val * 2, '#F1BEB8' if bad else '#BFE0CC', floor * 2, val * 2, '#C92A1C' if bad else '#14803C')
    box = ('<div style="width: 80px; height: 38px; box-sizing: border-box; border: %s; border-radius: 8px; background: #fff; display: flex; align-items: center; justify-content: flex-end; padding: 0 12px; font-weight: 700; font-variant-numeric: tabular-nums%s">%.1f</div>') % (
        '2px solid #C92A1C' if bad else '1px solid #CBD7CF', '; color: #C92A1C' if bad else '', val)
    msg = '<div style="grid-column: 2 / span 3; color: #C92A1C; font-size: 12.5px; font-weight: 700; margin-top: -8px">%s</div>' % err if bad else ''
    return ('<div style="display: grid; %s; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5"><div style="font-weight: 700">%s</div>%s'
            '<div style="display: flex; align-items: center; gap: 8px">%s<span style="color: #4B5E52">%%</span></div>'
            '<div style="color: #4B5E52; font-variant-numeric: tabular-nums">%.1f%%</div>%s</div>') % (G, name, track, box, floor, msg)


def margins(err_cat=None):
    head = ('<div style="display: grid; %s; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Category</div>'
            '<div style="display: flex; justify-content: space-between"><span>0%%</span><span>25%%</span><span>50%%</span></div><div>:: Your margin</div><div>:: Organization floor</div></div>') % G
    body = ''.join(margin_row(n, f, m, 28.0, 'Below the 30.0% organization floor. Pick 30.0% or higher.') if n == err_cat else margin_row(n, f, m) for n, f, m in CATS)
    legend = ('<div style="padding: 12px 20px; border-top: 1px solid #E3EAE5; color: #4B5E52; font-size: 12.5px; display: flex; gap: 22px; flex-wrap: wrap">'
              '<span><span style="display: inline-block; width: 4px; height: 12px; background: #1F4A39; border-radius: 2px; margin-right: 6px"></span>Organization floor, set by your manager</span>'
              '<span><span style="display: inline-block; width: 4px; height: 12px; background: #14803C; border-radius: 2px; margin-right: 6px"></span>Your margin</span></div>')
    sec = ('<section style="background: #fff; border-radius: 14px; overflow: hidden">' + card_head('Your margins', 'Each rep sets their own. You cannot go below the organization floor.', 'Save margins', bool(err_cat)) + head + body + legend + '</section>')
    return '<div style="display: flex; flex-direction: column; gap: 16px; margin-top: 20px">' + sec + '</div>'


def profile():
    av = '<div style="width: 96px; height: 96px; border-radius: 50%; background: #1F4A39; color: #fff; font-size: 32px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex: none">BG</div>'
    b = lambda l: '<span style="height: 38px; padding: 0 16px; border-radius: 9px; border: 1px solid #CBD7CF; background: #fff; font-weight: 700; display: inline-flex; align-items: center">%s</span>' % l
    pic = '<div style="display: flex; align-items: center; gap: 20px">' + av + '<div style="display: flex; flex-direction: column; gap: 10px"><div style="font-weight: 700">Picture</div><div style="display: flex; gap: 10px">' + b('Upload picture') + b('Remove') + '</div></div></div>'
    def fld(label, val, hint=''):
        h = '<div style="font-size: 12.5px; color: #4B5E52; margin-top: 4px">%s</div>' % hint if hint else ''
        return ('<div><div style="font-size: 12px; font-weight: 700; color: #4B5E52; margin-bottom: 4px">%s</div>'
                '<div style="height: 42px; box-sizing: border-box; border: 1px solid #CBD7CF; border-radius: 8px; background: #fff; display: flex; align-items: center; padding: 0 12px; font-weight: 600">%s</div>%s</div>') % (label, val, h)
    name = ('<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px 24px; max-width: 760px">' +
            fld('Name', 'Brandi Gallegos') + fld('Phone', '(801) 555-0142') + fld('Email', 'brandi.gallegos@example.com') + '</div>')
    sec = ('<section style="background: #fff; border-radius: 14px; overflow: hidden">' + card_head('Profile', 'Customers see your name, phone and email on quotes you send.', 'Save profile') +
           '<div style="padding: 24px 20px; display: flex; flex-direction: column; gap: 26px">' + pic + name + '</div></section>')
    return '<div style="display: flex; flex-direction: column; gap: 16px; margin-top: 20px">' + sec + '</div>'


def toggle(on):
    return ('<span style="position: relative; width: 40px; height: 22px; border-radius: 999px; background: %s; display: block"><span style="position: absolute; top: 3px; %s: 3px; width: 16px; height: 16px; border-radius: 50%%; background: #fff"></span></span>' % (('#14803C', 'right') if on else ('#B9C9BF', 'left')))


def notifications():
    GN = 'grid-template-columns: 1fr 90px 90px; gap: 24px'
    def group(title, sub, items):
        head = ('<div style="display: grid; %s; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: %s</div><div>:: In app</div><div>:: Email</div></div>') % (GN, title)
        body = ''.join('<div style="display: grid; %s; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5"><div><div style="font-weight: 700">%s</div><div style="color: #4B5E52; font-size: 12.5px; margin-top: 2px">%s</div></div>%s%s</div>' % (GN, n, d, toggle(a), toggle(b)) for n, d, a, b in items)
        return '<section style="background: #fff; border-radius: 14px; overflow: hidden">' + card_head(title, sub, 'Save notifications') + head[:0] + head + body + '</section>'
    caution = group('Needs attention', 'Shown in the red caution dropdown. Only your quotes.', [
        ('Quote overdue', 'A quote of yours passes its overdue time.', True, True),
        ('Quote aging', 'A sent quote has had no reply for a while.', True, False),
        ('Below margin floor', 'A draft has a line under the floor.', True, False),
        ('Change requested', 'A customer asks to change a quote.', True, True)])
    bell = group('Notifications', 'Shown in the bell dropdown.', [
        ('Quote accepted', 'A customer accepts one of your quotes.', True, True),
        ('Quote declined', 'A customer declines, with their reason.', True, True),
        ('Quote expired', 'A sent quote reaches its valid until date.', True, False),
        ('Customer chat needs a rep', 'Querent could not answer a customer question.', True, True)])
    return '<div style="display: flex; flex-direction: column; gap: 16px; margin-top: 20px">' + caution + bell + '</div>'


def page(ttl, active, body):
    t = pre + top + tabs(active) + body + '</main>' + post[post.index('</main>') + len('</main>'):]
    t = t.replace('>Settings</h1>', '>Settings</h1>')
    return re.sub(r'<title>[^<]*</title>', '<title>' + ttl + '</title>', t, count=1)


wr('RS1', page('Rep Settings Margins', 0, margins()))
wr('RS2', page('Rep Settings Profile', 1, profile()))
wr('RS3', page('Rep Settings Margin Below Floor', 0, margins('Safety and PPE')))
wr('RS4', page('Rep Settings Notifications', 2, notifications()))
print('ok')
