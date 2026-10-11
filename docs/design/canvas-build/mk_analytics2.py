import json
_a = open(r"mk_analytics.py", encoding="utf-8").read()
exec(_a[:_a.index("wr('ANBase.dc.html'")])   # all Analytics pieces and helpers (apage, panel, KPIS, weekly, margin_card, items_card, no_rep, query, scope_panel, check, fld, lab, svg, ICONS...)

TABS = ['Overview', 'Rep leaderboard', 'Decline reasons', 'Untouched quotes', 'Customer questions']

def head(active, filt=False, export=False):
    fb = '2px solid %s' % ACC if filt else '1px solid %s' % LINE
    top = ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px"><div><h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.035em">Analytics</h1><div style="color: ' + MUT + '; margin-top: 2px">Quotes and customer questions for the whole organization</div></div>'
           '<div style="position: relative"><button style="height: 40px; padding: 0 14px; border: ' + fb + '; background: #fff; border-radius: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px">' + svg('M3 5h18l-7 8v6l-4-2v-4L3 5z', 15, 2) + 'Filter</button>' + (scope_panel() if filt else '') + '</div>'
           + ('<button style="height: 40px; padding: 0 14px; border: 1px solid ' + LINE + '; background: #fff; border-radius: 10px; font-weight: 700; display: flex; align-items: center; gap: 8px">' + svg('M12 4v11 M7 10l5 5 5-5 M5 20h14', 15, 2) + 'Export CSV</button>' if export else '') + ICONS + '</div>')
    tabs = '<div style="display: flex; flex-wrap: wrap; gap: 6px 26px; margin-top: 18px; border-bottom: 1px solid #B9C9BF">' + ''.join(
        '<span style="padding: 10px 2px; font-weight: %d; color: %s; border-bottom: 3px solid %s; margin-bottom: -1px">%s</span>' % (800 if t == active else 600, INK if t == active else MUT, ACC if t == active else 'transparent', t) for t in TABS) + '</div>'
    return top + tabs

def stack(*parts):
    return '<div style="display: flex; flex-direction: column; gap: 16px; margin-top: 20px">' + ''.join(parts) + '</div>'

def overview(filt=False, show_table=False):
    return head('Overview', filt) + stack(KPIS, weekly(show_table), '<div style="display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start"><div style="flex: 1 1 520px; min-width: 0">' + margin_card + '</div><div style="flex: 1 1 420px; min-width: 0">' + items_card + '</div></div>')

def window_seg():
    return ('<span style="display: flex; align-items: center; gap: 10px"><span style="color: #CFE6D6; font-size: 13px">Created</span><span style="display: flex; background: rgba(255,255,255,0.14); border-radius: 9px; padding: 3px">'
            '<span style="padding: 5px 12px; font-size: 13px; color: #fff">7 days</span><span style="padding: 5px 12px; border-radius: 7px; background: #7FDBA0; color: %s; font-weight: 800; font-size: 13px">30 days</span><span style="padding: 5px 12px; font-size: 13px; color: #fff">90 days</span><span style="padding: 5px 12px; font-size: 13px; color: #fff">Custom</span></span></span>' % DARK)

LB_COLS = [('Rep', 170, 'left'), ('Created', 80, 'right'), ('Ok', 56, 'right'), ('Aging', 64, 'right'), ('Overdue', 78, 'right'), ('Draft ready', 100, 'right'), ('Changes req.', 110, 'right'), ('Sent', 70, 'right'), ('Accepted', 100, 'right'), ('Declined', 90, 'right'), ('Expired', 90, 'right'),
           ('Quote-to-order', 130, 'right'), ('Unaccepted', 110, 'right'), ('Decided win rate', 150, 'right'), ('Time to send', 130, 'right'), ('Customer response', 160, 'right'), ('In draft ready', 130, 'right'), ('In sent', 90, 'right')]
LB_GRID = ' '.join('%dpx' % w for _, w, _ in LB_COLS)
LB_ROWS = [('Brandi Gallegos', 7, (1, 1, 2), 1, 1, 2, 2, 0, 1, '29%', '14%', '67%', '1 h 23 min', '2.3 days', '6 h 38 min', '4.6 d'),
           ('Eli Porter', 20, (1, 5, 1), 3, 1, 3, 7, 3, 3, '35%', '30%', '54%', '2 h 17 min', '3.4 days', '4 h 37 min', '4.4 d'),
           ('Mara Jensen', 13, (0, 2, 3), 2, 1, 2, 4, 3, 1, '31%', '31%', '50%', '1 h 59 min', '3.2 days', '5 h 54 min', '4.2 d'),
           ('Nora Chen', 0, (0, 0, 0), 0, 0, 0, 0, 0, 0, '-', '-', '-', '-', '-', '-', '-')]
LB_TOTAL = ('Total', 40, (2, 8, 6), 6, 3, 7, 13, 6, 5, '33%', '28%', '54%', '2 h 1 min', '3.2 days', '5 h 23 min', '4.4 d')

def num(v):
    s = str(v)
    return '<span style="color: %s; font-weight: 700; font-variant-numeric: tabular-nums">%s</span>' % (ACC if s not in ('0', '-') else '#8DA195', s)

def lb_row(r, total=False):
    name, created, op, *rest = r
    ok, ag, ov = op
    ovh = '<span style="color: %s; font-weight: 700; font-variant-numeric: tabular-nums">%s</span>' % ('#C92A1C' if ov else '#8DA195', ov)
    rest_cells = [num(x) if i < 6 else '<span style="font-variant-numeric: tabular-nums; font-weight: %d">%s</span>' % (800 if total else 500, x) for i, x in enumerate(rest)]
    cells = [('<span style="font-weight: 800">%s</span>' % name), num(created), num(ok), num(ag), ovh] + rest_cells
    out = ''
    for (lab_, w, al), c in zip(LB_COLS, cells):
        out += '<div style="text-align: %s; %s">%s</div>' % (al, 'font-weight: 800;' if total else '', c)
    return '<div style="display: grid; grid-template-columns: %s; gap: 16px; align-items: center; padding: %s 20px; border-top: %s; background: %s">%s</div>' % (LB_GRID, '14px', '2px solid #CBD7CF' if total else '1px solid #E3EAE5', '#F2F6F3' if total else '#fff', out)

def leaderboard():
    heads = ''.join('<div style="text-align: %s">:: %s</div>' % (al, n) for n, w, al in LB_COLS)
    grp = '<div style="display: grid; grid-template-columns: %s; gap: 16px; padding: 8px 20px 0; background: #E4EAE5"><div style="grid-column: 3 / span 3; text-align: center; font-size: 12.5px; font-weight: 800; color: #3A4A40; border-bottom: 1px solid #B9C9BF; padding-bottom: 4px">Open</div></div>' % LB_GRID
    tbl = ('<div style="overflow-x: auto"><div style="min-width: %dpx">%s<div style="display: grid; grid-template-columns: %s; gap: 16px; padding: 6px 20px 10px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40">%s</div>%s%s</div></div>'
           % (sum(w for _, w, _ in LB_COLS) + 16 * len(LB_COLS) + 40, grp, LB_GRID, heads, ''.join(lb_row(r) for r in LB_ROWS), lb_row(LB_TOTAL, True)))
    return panel('Leaderboard', 'Quotes created Sep 12, 2026 to Oct 11, 2026, counted under the rep who owns them now', '<div style="padding: 12px 20px; color: %s; font-size: 13.5px">Rates use the quotes created in the window. Open quotes are shown on their own. Pick a count to see its quotes.</div>' % MUT + tbl, '<span style="margin-left: auto">' + window_seg() + '</span>')

def declines():
    g = '2fr 0.8fr 0.8fr 1.1fr 1fr 1fr 1fr'
    hh = '<div style="display: grid; grid-template-columns: %s; gap: 14px; padding: 10px 18px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Reason</div><div style="text-align: right">:: Quotes</div><div style="text-align: right">:: Share</div><div style="text-align: right">:: Brandi Gallegos</div><div style="text-align: right">:: Eli Porter</div><div style="text-align: right">:: Mara Jensen</div><div style="text-align: right">:: Nora Chen</div></div>' % g
    data = [('Price too high', 0, 0, 1, 0), ('Found other source', 0, 1, 0, 0), ('Need it sooner than quoted', 0, 0, 1, 0), ('Wrong items or quantity', 0, 1, 0, 0), ('Other', 0, 0, 1, 0), ('No reason given', 0, 1, 0, 0)]
    rows = ''.join('<div style="display: grid; grid-template-columns: %s; gap: 14px; padding: 13px 18px; border-top: 1px solid #E3EAE5"><div style="font-weight: 700">%s</div><div style="text-align: right">%s</div><div style="text-align: right">17%%</div>%s</div>' % (g, n, num(1), ''.join('<div style="text-align: right">%s</div>' % num(v) for v in vals)) for n, *vals in data)
    quote = ('<div style="flex: 1 1 360px; min-width: 0"><div style="font-weight: 800">Other, in the customer\'s words</div><div style="margin-top: 10px; border-left: 3px solid %s; background: #F2F6F3; border-radius: 0 10px 10px 0; padding: 14px 16px"><div style="font-size: 15.5px; line-height: 1.4">"The general contractor is supplying the anchors on this job."</div>'
             '<div style="margin-top: 6px; color: %s; font-size: 13px"><span style="color: %s; font-weight: 800">Q-24767</span>, Mara Jensen, Sep 28</div></div></div>') % (ACC, MUT, ACC)
    inner = '<div style="padding: 18px 20px; display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start"><div style="flex: 2 1 520px; min-width: 0; border: 1px solid #E3EAE5; border-radius: 10px; overflow: hidden">' + hh + rows + '</div>' + quote + '</div>'
    return panel('Decline reasons', '<span style="color: #7FDBA0; font-weight: 800">6 declined quotes</span> in the window. Expired quotes are counted apart.', inner)

def untouched():
    g = '1.4fr 1fr 1.2fr 1.4fr 1.1fr 1.3fr 1.2fr'
    cols = ['Rep', 'Draft never opened', 'Draft opened but never sent', 'Changes requested but never revised', 'Sent but never opened', 'Sent and opened but no reply', 'Expired with no response']
    hh = '<div style="display: grid; grid-template-columns: %s; gap: 14px; padding: 10px 18px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40">%s</div>' % (g, ''.join('<div style="text-align: %s">:: %s</div>' % ('left' if i == 0 else 'right', c) for i, c in enumerate(cols)))
    data = [('Brandi Gallegos', 0, 1, 1, 1, 0, 1), ('Eli Porter', 2, 1, 1, 1, 1, 3), ('Mara Jensen', 2, 0, 1, 1, 1, 1), ('Nora Chen', 0, 0, 0, 0, 0, 0)]
    rows = ''.join('<div style="display: grid; grid-template-columns: %s; gap: 14px; padding: 14px 18px; border-top: 1px solid #E3EAE5"><div style="font-weight: 800">%s</div>%s</div>' % (g, n, ''.join('<div style="text-align: right">%s</div>' % num(v) for v in vals)) for n, *vals in data)
    tot = '<div style="display: grid; grid-template-columns: %s; gap: 14px; padding: 14px 18px; border-top: 2px solid #CBD7CF; background: #F2F6F3; font-weight: 800"><div>Total</div>%s</div>' % (g, ''.join('<div style="text-align: right">%s</div>' % v for v in (4, 2, 3, 3, 2, 5)))
    inner = '<div style="padding: 16px 20px 20px"><div style="color: %s; max-width: 720px; line-height: 1.45">Read from what happened to each quote, never typed by a rep. Open quotes count once they are aging or overdue.</div><div style="margin-top: 14px; border: 1px solid #E3EAE5; border-radius: 10px; overflow: hidden">%s%s%s</div></div>' % (MUT, hh, rows, tot)
    return panel('Why quotes went untouched', '', inner)

def page(title, body, offset=0):
    return apage(title, body, offset)

wr('ANBase.dc.html', page('Analytics overview', overview()))
wr('AN1.dc.html', page('Analytics overview scrolled', overview(), 640))
wr('AN3.dc.html', page('Analytics weekly table', overview(False, True)))
wr('AN4.dc.html', page('Analytics filter', overview(True)))
wr('AN6.dc.html', page('Analytics rep leaderboard', head('Rep leaderboard', False, True) + stack(leaderboard())))
wr('AN7.dc.html', page('Analytics decline reasons', head('Decline reasons') + stack(declines())))
wr('AN8.dc.html', page('Analytics untouched quotes', head('Untouched quotes') + stack(untouched())))
wr('AN2.dc.html', page('Analytics customer questions', head('Customer questions') + stack(no_rep, query)))
wr('AN5.dc.html', page('Analytics customer questions scrolled', head('Customer questions') + stack(no_rep, query), 330))

# ---------- canvas ----------
cj = json.load(open(P + "\\canvas.json", encoding="utf-8"))
def put(f, title, x, y):
    cj['boards'][f] = {'expand': 'fill', 'h': 900, 'w': 1440, 'x': x, 'y': y, 'title': title, 'page': 'quote'}
    if f not in cj['order']:
        cj['order'].append(f)
row1 = [('ANBase.dc.html', 'Overview'), ('AN1.dc.html', 'Overview scrolled'), ('AN3.dc.html', 'Overview, show table'), ('AN4.dc.html', 'Overview, filter open')]
row2 = [('AN6.dc.html', 'Rep leaderboard'), ('AN7.dc.html', 'Decline reasons'), ('AN8.dc.html', 'Untouched quotes'), ('AN2.dc.html', 'Customer questions'), ('AN5.dc.html', 'Customer questions scrolled')]
for i, (f, t) in enumerate(row1):
    put(f, t, 1520 * i, 13800)
for i, (f, t) in enumerate(row2):
    put(f, t, 1520 * i, 14820)
# push the Teams and Reps section down so the two rows fit
for i in range(8):
    f = ['TRBase', 'TR1', 'TR2', 'TR3', 'TR4', 'TR5', 'TR6', 'TR7'][i] + '.dc.html'
    if f in cj['boards']:
        cj['boards'][f]['y'] = 16120
for k, y in (('tr1', 16430), ('tr2', 15780)):
    if k in cj['notes']:
        cj['notes'][k]['y'] = y
cj['notes']['an2'] = {'text': 'Analytics now has 5 tabs: Overview, Rep leaderboard, Decline reasons, Untouched quotes and Customer questions. The Filter button works on every tab. The first row is the Overview tab, the second row is the other tabs.', 'x': 1520, 'y': 13500, 'w': 560, 'page': 'quote'}
json.dump(cj, open(P + "\\canvas.json", "w", encoding="utf-8", newline="\n"), indent=2, ensure_ascii=False)
print('ok', len(cj['boards']))
