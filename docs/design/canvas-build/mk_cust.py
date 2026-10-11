import json
P = r"design\project"
ACC = "#14803C"; DARK = "#0F3B22"; HEAD = "#1F4A39"; CANVAS = "#D9E3DC"; INK = "#151D18"; MUT = "#4B5E52"; LINE = "#CBD7CF"
MONO = "'Geist Mono', monospace"

def wr(n, s):
    open(P + "\\" + n, "w", encoding="utf-8", newline="\n").write(s)

def svg(d, size=18, sw=2):
    return '<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="%s"/></svg>' % (size, size, sw, d)

LOGO = '<svg width="40" height="40" viewBox="10 10 80 80" fill="none" stroke="#7FDBA0" stroke-width="7.5" stroke-linecap="round" role="img" aria-label="Querent"><circle cx="49" cy="49" r="28.5"/><path d="M60 60 81 82"/></svg>'
NAV = [('Quotes', 'M6 3h9l4 4v14H6V3z M14 3v5h5 M9 13h7 M9 17h5'), ('Customers', 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21c1-4 4-6 8-6s7 2 8 6'), ('Orders', 'M3 8l9-5 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9'), ('Stock', 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z'), ('Analytics', 'M4 20V10 M10 20V4 M16 20v-8 M22 20H2'), ('Teams and Reps', 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M17 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M2 20c.8-3.5 3.3-5 7-5s6.2 1.5 7 5 M17 14c3 0 4.7 1.4 5 4'), ('Settings', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2')]

def rail(active):
    out = ''
    for i, (lab, d) in enumerate(NAV):
        on = i == active
        out += ('<a href="#" style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; background: %s; color: %s; font-weight: %d">%s<span style="font-size: 14px; white-space: nowrap">%s</span></a>'
                % (ACC if on else 'transparent', '#fff' if on else '#9CC8AB', 700 if on else 500, svg(d, 20, 1.8), lab))
    return ('<aside style="flex: 0 0 216px; align-self: stretch; background: %s"><div style="position: sticky; top: 0; height: 900px; box-sizing: border-box; padding: 20px 14px; display: flex; flex-direction: column; gap: 3px">'
            '<div style="display: flex; align-items: center; gap: 10px; padding: 0 8px">%s<span style="font-weight: 800; font-size: 20px; letter-spacing: -0.03em; color: #fff">Querent</span></div>'
            '<div style="padding: 6px 8px 22px; font-size: 13px; font-weight: 800; white-space: nowrap; color: #7FDBA0">Herrick Industrial Supply</div>%s<div style="flex: 1 1 auto"></div>'
            '<div style="border-top: 1px solid #25573A; padding: 14px 8px 0; display: flex; flex-direction: column; gap: 12px"><div style="display: flex; align-items: center; gap: 10px">'
            '<div style="width: 38px; height: 38px; border-radius: 50%%; background: #fff; color: %s; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center">BG</div>'
            '<div><div style="font-weight: 700; color: #fff">Brian G.</div><div style="font-size: 12.5px; color: #8FBFA0">Manager</div></div></div>'
            '<button style="height: 36px; border-radius: 9px; border: 1px solid #3A7050; background: transparent; color: #fff; font-weight: 600">Sign out</button></div></div></aside>') % (DARK, LOGO, out, DARK)

# name, code, rep, terms, balance, limit, last order, orders, quotes
CUST = [
    ('Canyon Ridge Builders', 'CRB-3318', 'Brandi Gallegos', 'Net 30', '$9,650.00', '$40,000.00', 'No orders yet', '0', '23'),
    ('Great Basin Fabrication', 'GBF-2207', 'Brandi Gallegos', 'Not on file', '', '', 'No orders yet', '0', '0'),
    ('Wasatch Mechanical Contractors', 'WAS-1142', 'Brandi Gallegos', 'Net 30', '$18,420.00', '$50,000.00', 'Sep 25, 2026', '23', '28'),
    ('Utah Valley Electric', 'UVE-5126', 'Eli Porter', 'Net 30', '$4,210.00', '$30,000.00', 'No orders yet', '0', '12'),
    ('Weber Basin Fabricators', 'WBF-6074', 'Eli Porter', 'Net 45', '$2,875.00', '$25,000.00', 'No orders yet', '0', '12'),
    ('Uinta Facility Services', 'UFS-4051', 'Nora Chen', 'Not on file', '', '', 'No orders yet', '0', '0'),
]
REPS = {'Brandi Gallegos': ('BG', '$28,070.00', '51'), 'Eli Porter': ('EP', '$7,085.00', '24'), 'Nora Chen': ('NC', 'None', '0')}
GRID = 'minmax(210px, 2fr) 1.2fr 0.8fr 1.3fr 1.1fr 0.7fr 0.7fr 28px'

def check(label, on, n=''):
    box = '<span style="width: 16px; height: 16px; border-radius: 4px; border: 2px solid %s; background: %s; display: inline-block; flex: none"></span>' % (ACC, ACC if on else '#fff')
    return '<div style="display: flex; align-items: center; gap: 8px; padding: 5px 0">%s<span>%s</span>%s</div>' % (box, label, ('<span style="margin-left: auto; font-family: %s; font-size: 12px; color: %s">%s</span>' % (MONO, MUT, n)) if n else '')

def fld(label, val):
    return '<div style="margin-bottom: 10px"><div style="font-size: 12px; font-weight: 700; color: %s; margin-bottom: 4px">%s</div><div style="height: 38px; box-sizing: border-box; border: 1px solid %s; border-radius: 8px; display: flex; align-items: center; padding: 0 12px; color: %s; background: #fff">%s</div></div>' % (MUT, label, LINE, MUT, val)

def lab(t):
    return '<div style="font-size: 12px; font-weight: 700; color: %s; margin: 6px 0 2px">%s</div>' % (MUT, t)

def filter_panel(sel):
    return ('<div style="position: absolute; top: 48px; left: 0; width: 400px; box-sizing: border-box; background: #fff; border: 1px solid #B9C9BF; border-radius: 14px; box-shadow: 0 20px 44px rgba(15,59,34,0.24); z-index: 6; padding: 18px; color: %s; font-size: 14px">'
            '<div style="font-weight: 800; font-size: 16px; margin-bottom: 2px">Filter customers</div>' % INK
            + '<div style="color: %s; font-size: 13px">Pick one rep or several to see their customers together.</div>' % MUT
            + lab('Rep') + check('Brandi Gallegos', 'Brandi Gallegos' in sel, '3') + check('Eli Porter', 'Eli Porter' in sel, '2') + check('Nora Chen', 'Nora Chen' in sel, '1')
            + lab('Terms') + '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 8px">' + check('Net 30', False) + check('Net 45', False) + check('Not on file', False) + '</div>'
            + '<div style="height: 6px"></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">' + fld('Open balance from', '$0.00') + fld('Open balance to', '$50,000.00') + '</div>'
            + lab('Only show') + check('Has open quotes', False) + check('Over 80% of credit limit', False) + check('Never ordered', False)
            + '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px"><span style="font-weight: 700; color: %s">Clear all</span><span style="height: 38px; padding: 0 22px; border-radius: 9px; background: %s; color: #fff; font-weight: 700; display: flex; align-items: center">Apply filters</span></div></div>' % (MUT, ACC))

def cust_row(c, show_rep=False):
    name, code, rep, terms, bal, lim, last, orders, quotes = c
    terms_html = '<span style="color: #6A7F73">Not on file</span>' if terms == 'Not on file' else terms
    bal_html = ('<div style="font-weight: 700; font-variant-numeric: tabular-nums">%s</div><div style="font-size: 12.5px; color: %s">of %s</div>' % (bal, MUT, lim)) if bal else '<span style="color: #6A7F73">-</span>'
    last_html = '<span style="color: #6A7F73">No orders yet</span>' if last == 'No orders yet' else last
    return ('<div style="display: grid; grid-template-columns: %s; gap: 16px; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5">'
            '<div><div style="font-weight: 800">%s</div><div style="font-family: %s; font-size: 12px; color: %s; margin-top: 2px">%s</div></div>'
            '<div style="font-weight: 600">%s</div><div>%s</div><div style="text-align: right">%s</div><div>%s</div><div style="text-align: right; font-variant-numeric: tabular-nums">%s</div><div style="text-align: right; font-variant-numeric: tabular-nums">%s</div><div></div></div>'
            % (GRID, name, MONO, MUT, code, rep, terms_html, bal_html, last_html, orders, quotes))

def group(rep):
    rows = [c for c in CUST if c[2] == rep]
    ini, bal, q = REPS[rep]
    bar = ('<div style="display: flex; align-items: center; gap: 12px; padding: 11px 20px; background: %s; color: #fff"><span style="width: 30px; height: 30px; border-radius: 50%%; background: #fff; color: %s; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center">%s</span>'
           '<span style="font-weight: 800; font-size: 15px">%s</span><span style="color: #CFE6D6; font-size: 13px">%d customer%s</span>'
           '<span style="margin-left: auto; font-size: 13px; color: #CFE6D6">Open balance <b style="color: #fff">%s</b>, <b style="color: #fff">%s</b> quotes</span></div>') % (HEAD, DARK, ini, rep, len(rows), '' if len(rows) == 1 else 's', bal, q)
    return '<section style="background: #fff; border-radius: 14px; overflow: hidden">%s%s</section>' % (bar, ''.join(cust_row(c) for c in rows))

def build(title, filt_open=False, applied=False):
    bell = svg('M6 17v-6a6 6 0 1 1 12 0v6l1.5 2h-15L6 17z M10 21a2 2 0 0 0 4 0', 19, 2)
    caut = svg('M12 3 2 20h20L12 3z M12 10v4 M12 17.5v.01', 19, 2)
    reps = ['Brandi Gallegos', 'Eli Porter'] if applied else ['Brandi Gallegos', 'Eli Porter', 'Nora Chen']
    n = sum(1 for c in CUST if c[2] in reps)
    count = '%d customers' % n
    fbtn_border = '2px solid %s' % ACC if (filt_open or applied) else '1px solid %s' % LINE
    badge = '<span style="font-family: %s; font-size: 12px; background: %s; color: #fff; border-radius: 999px; padding: 1px 8px">1</span>' % (MONO, ACC) if applied else ''
    chips = ''
    if applied:
        chips = ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 14px"><span style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: #fff; border: 1px solid %s; font-weight: 700">Rep: Brandi Gallegos, Eli Porter<span style="color: #6A7F73">x</span></span><span style="font-weight: 700; color: %s">Clear all</span></div>') % (LINE, MUT)
    heads = ['Customer', 'Rep', 'Terms', 'Open balance', 'Last order', 'Orders', 'Quotes']
    hh = ''.join('<div style="text-align: %s">:: %s</div>' % ('right' if h in ('Open balance', 'Orders', 'Quotes') else 'left', h) for h in heads)
    colicon = '<div style="display: flex; justify-content: flex-end"><button aria-label="Choose columns" style="width: 28px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: rgba(0,0,0,0.08); color: inherit; display: flex; align-items: center; justify-content: center">%s</button></div>' % svg('M4 5h16v14H4z M9.5 5v14 M14.5 5v14', 16, 2)
    html = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>%(title)s</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600;700;800&amp;family=Geist+Mono:wght@400;500&amp;display=swap">
<style>
body{margin:0}
button{font-family:inherit;cursor:pointer}
a{color:inherit;text-decoration:none}
*{scrollbar-width:thin;scrollbar-color:#B4C5BA transparent}
*::-webkit-scrollbar{height:8px;width:8px}
*::-webkit-scrollbar-track{background:transparent}
*::-webkit-scrollbar-thumb{background:#B4C5BA;border-radius:8px}
</style>
</helmet>
<div style="position: relative; min-height: 900px; display: flex; flex-wrap: nowrap; align-items: stretch; font-family: 'Albert Sans', sans-serif; background: %(canvas)s; color: %(ink)s; font-size: 14.5px">
%(rail)s
<main style="flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 24px 32px 32px">
  <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px">
    <h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.035em">Customers</h1>
    <div style="width: 320px; max-width: 100%%; box-sizing: border-box; height: 42px; border-radius: 10px; background: #fff; border: 1px solid %(line)s; display: flex; align-items: center; gap: 10px; padding: 0 14px">%(search)s<span style="color: #6A7F73">Search customers</span></div>
    <div style="position: relative"><button style="height: 40px; padding: 0 14px; border: %(fb)s; background: #fff; border-radius: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px">%(funnel)sFilter%(badge)s</button>%(panel)s</div>
    <span style="color: %(mut)s; font-weight: 600">%(count)s</span>
    <div style="display: flex; align-items: center; gap: 10px; margin-left: auto"><button aria-label="Needs attention, 2 items" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid #E8A8A0; background: #FFEDEA; color: #C92A1C; display: flex; align-items: center; justify-content: center">%(caut)s</button>
    <button aria-label="Notifications" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid %(line)s; background: #fff; color: %(mut)s; display: flex; align-items: center; justify-content: center">%(bell)s</button></div>
  </div>
  %(chips)s
  <div style="overflow-x: auto; margin-top: 22px"><div style="min-width: 900px; display: flex; flex-direction: column; gap: 14px">
    <div style="display: grid; grid-template-columns: %(grid)s; gap: 16px; padding: 10px 20px; border-radius: 10px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40">%(hh)s%(colicon)s</div>
    %(groups)s
  </div></div>
</main>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1440,"height":900}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
''' % dict(title=title, canvas=CANVAS, ink=INK, line=LINE, mut=MUT, rail=rail(1), search=svg('M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M20 20l-4-4', 17, 2), fb=fbtn_border, funnel=svg('M3 5h18l-7 8v6l-4-2v-4L3 5z', 15, 2), badge=badge,
           panel=filter_panel(['Brandi Gallegos', 'Eli Porter']) if filt_open else '', count=count, caut=caut, bell=bell, chips=chips, grid=GRID, hh=hh, colicon=colicon, groups='<section style="background: #fff; border-radius: 14px; overflow: hidden">' + ''.join(cust_row(c) for c in sorted([c for c in CUST if c[2] in reps], key=lambda c: c[0])) + '</section>')
    return html

FILES = [('CUBase.dc.html', 'Customers', {}), ('CU1.dc.html', 'Filter open', {'filt_open': True}), ('CU2.dc.html', 'Filter applied', {'applied': True})]
for f, t, kw in FILES:
    wr(f, build(t, **kw))
exec(open('cust_detail.py', encoding='utf-8').read())
wr('CU3.dc.html', detail_page('Customer page'))

# ---------- canvas: merge onto the latest saved copy ----------
SRC = r"artifact-files\project\canvas.json"
cj = json.load(open(SRC, encoding="utf-8"))
if not any(p['id'] == 'customers' for p in cj['pages']):
    cj['pages'].append({'id': 'customers', 'name': 'Customers'})
def put(f, title, x, y):
    cj['boards'][f] = {'expand': 'fill', 'h': 900, 'w': 1440, 'x': x, 'y': y, 'title': title, 'page': 'customers'}
    if f not in cj['order']:
        cj['order'].append(f)
put('CUBase.dc.html', 'Customers', 0, 0)
put('CU1.dc.html', 'Filter open', 1520, 0)
put('CU2.dc.html', 'Filter applied', 3040, 0)
put('CU3.dc.html', 'Customer page', 4560, 0)
cj['notes']['cu1'] = {'kind': 'title1', 'maxW': 5960, 'text': 'Customers', 'x': 0, 'y': -300, 'page': 'customers'}
cj['notes']['cu2'] = {'text': 'Manager view. One list with the rep on every row. Filter by one rep or several. Clicking a customer opens the customer page.', 'x': 1520, 'y': -240, 'w': 520, 'page': 'customers'}
json.dump(cj, open(P + "\\canvas.json", "w", encoding="utf-8", newline="\n"), indent=2, ensure_ascii=False)
print("ok")
