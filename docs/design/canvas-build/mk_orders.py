import json
_src = open(r"mk_cust.py", encoding="utf-8").read()
exec(_src[:_src.index("# name, code, rep, terms")])   # constants, wr, svg, LOGO, NAV, rail(active)

def check(label, on):
    box = '<span style="width: 16px; height: 16px; border-radius: 4px; border: 2px solid %s; background: %s; display: inline-block; flex: none"></span>' % (ACC, ACC if on else '#fff')
    return '<div style="display: flex; align-items: center; gap: 8px; padding: 5px 0">%s<span>%s</span></div>' % (box, label)

def fld(label, val):
    return '<div style="margin-bottom: 10px"><div style="font-size: 12px; font-weight: 700; color: %s; margin-bottom: 4px">%s</div><div style="height: 38px; box-sizing: border-box; border: 1px solid %s; border-radius: 8px; display: flex; align-items: center; padding: 0 12px; color: %s; background: #fff">%s</div></div>' % (MUT, label, LINE, MUT, val)

def lab(t):
    return '<div style="font-size: 12px; font-weight: 700; color: %s; margin: 6px 0 2px">%s</div>' % (MUT, t)

GRID = 'minmax(170px, 1.5fr) minmax(190px, 2fr) 1.2fr 1.1fr 1.2fr 0.8fr 0.5fr 0.9fr 28px'
ORDERS = [
    ('SO-51223', 'PO 7777, from Q-24816', 'Sep 25, 2026', 'Delivery, SLC', 'Shipped', '3', '$698.22'),
    ('SO-51222', 'PO 7776, from Q-24814', 'Sep 11, 2026', 'Delivery, Provo', 'Closed', '2', '$304.23'),
    ('SO-51221', 'PO 7775, from Q-24812', 'Aug 28, 2026', 'Will call, SLC', 'Closed', '3', '$481.87'),
    ('SO-51220', 'PO 7774, from Q-24811', 'Aug 14, 2026', 'Delivery, SLC', 'Closed', '2', '$303.38'),
    ('SO-51219', 'PO 7773', 'Jul 31, 2026', 'Will call, SLC', 'Closed', '2', '$175.03'),
    ('SO-51218', 'PO 7772, from Q-24809', 'Jul 17, 2026', 'Will call, Ogden', 'Closed', '3', '$203.45'),
    ('SO-51217', 'PO 7771, from Q-24808', 'Jul 4, 2026', 'Delivery, SLC', 'Closed', '2', '$483.99'),
    ('SO-51216', 'PO 7770, from Q-24807', 'Jun 18, 2026', 'Will call, SLC', 'Closed', '2', '$219.70'),
    ('SO-51215', 'PO 7769', 'Jun 3, 2026', 'Delivery, SLC', 'Closed', '2', '$219.94'),
    ('SO-51214', 'PO 7768', 'May 21, 2026', 'Will call, SLC', 'Closed', '2', '$397.68'),
]

def order_row(o):
    so, sub, dt, ful, st, lines, tot = o
    st_html = '<span style="font-weight: 800; color: %s">Shipped</span>' % ACC if st == 'Shipped' else '<span style="color: #6A7F73; font-weight: 600">Closed</span>'
    return ('<div style="display: grid; grid-template-columns: %s; gap: 16px; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5">'
            '<div><div style="font-weight: 800">%s</div><div style="font-size: 12.5px; color: %s; margin-top: 2px">%s</div></div>'
            '<div><div style="font-weight: 600">Wasatch Mechanical Contractors</div><div style="font-family: %s; font-size: 12px; color: %s; margin-top: 2px">WAS-1142</div></div>'
            '<div style="font-weight: 600">Brandi Gallegos</div><div>%s</div><div>%s</div><div>%s</div><div style="text-align: right; font-variant-numeric: tabular-nums">%s</div><div style="text-align: right; font-weight: 800; font-variant-numeric: tabular-nums">%s</div><div></div></div>'
            % (GRID, so, MUT, sub, MONO, MUT, dt, ful, st_html, lines, tot))

def filter_panel():
    return ('<div style="position: absolute; top: 48px; left: 0; width: 400px; box-sizing: border-box; background: #fff; border: 1px solid #B9C9BF; border-radius: 14px; box-shadow: 0 20px 44px rgba(15,59,34,0.24); z-index: 6; padding: 18px; color: %s; font-size: 14px">'
            '<div style="font-weight: 800; font-size: 16px; margin-bottom: 2px">Filter orders</div>' % INK
            + lab('Rep') + '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 8px">' + check('Brandi Gallegos', False) + check('Eli Porter', False) + check('Nora Chen', False) + '</div>'
            + lab('Status') + '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px">' + check('Shipped', False) + check('Closed', False) + '</div>'
            + lab('Fulfillment') + '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px">' + check('Delivery', True) + check('Will call', False) + '</div>'
            + lab('Branch') + '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 8px">' + check('SLC', True) + check('Ogden', False) + check('Provo', False) + '</div>'
            + '<div style="height: 6px"></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">' + fld('Ordered from', 'Jan 1, 2026') + fld('Ordered to', 'Oct 10, 2026') + '</div>'
            + '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px"><span style="font-weight: 700; color: %s">Clear all</span><span style="height: 38px; padding: 0 22px; border-radius: 9px; background: %s; color: #fff; font-weight: 700; display: flex; align-items: center">Apply filters</span></div></div>' % (MUT, ACC))

HEAD_HTML = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>@@TITLE@@</title>
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
<div style="position: relative; min-height: 900px; display: flex; flex-wrap: nowrap; align-items: stretch; font-family: 'Albert Sans', sans-serif; background: @@CANVAS@@; color: @@INK@@; font-size: 14.5px">
@@RAIL@@
<main style="flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 24px 32px 32px">
@@BODY@@
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
'''

def page(title, body):
    s = HEAD_HTML
    for k, v in [('@@TITLE@@', title), ('@@CANVAS@@', CANVAS), ('@@INK@@', INK), ('@@RAIL@@', rail(2)), ('@@BODY@@', body)]:
        s = s.replace(k, v)
    return s

BELL = svg('M6 17v-6a6 6 0 1 1 12 0v6l1.5 2h-15L6 17z M10 21a2 2 0 0 0 4 0', 19, 2)
CAUT = svg('M12 3 2 20h20L12 3z M12 10v4 M12 17.5v.01', 19, 2)
ICONS = ('<div style="display: flex; align-items: center; gap: 10px; margin-left: auto"><button aria-label="Needs attention, 2 items" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid #E8A8A0; background: #FFEDEA; color: #C92A1C; display: flex; align-items: center; justify-content: center">' + CAUT + '</button>'
         '<button aria-label="Notifications" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid ' + LINE + '; background: #fff; color: ' + MUT + '; display: flex; align-items: center; justify-content: center">' + BELL + '</button></div>')

def list_page(title, filt):
    heads = ['Order', 'Customer', 'Rep', 'Ordered', 'Fulfillment', 'Status', 'Lines', 'Total']
    hh = ''.join('<div style="text-align: %s">:: %s</div>' % ('right' if h in ('Lines', 'Total') else 'left', h) for h in heads)
    colicon = '<div style="display: flex; justify-content: flex-end"><button aria-label="Choose columns" style="width: 28px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: rgba(0,0,0,0.08); color: inherit; display: flex; align-items: center; justify-content: center">' + svg('M4 5h16v14H4z M9.5 5v14 M14.5 5v14', 16, 2) + '</button></div>'
    fb = '2px solid %s' % ACC if filt else '1px solid %s' % LINE
    body = ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px"><h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.035em">Orders</h1>'
            '<div style="width: 320px; max-width: 100%; box-sizing: border-box; height: 42px; border-radius: 10px; background: #fff; border: 1px solid ' + LINE + '; display: flex; align-items: center; gap: 10px; padding: 0 14px">' + svg('M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M20 20l-4-4', 17, 2) + '<span style="font-weight: 600">All customers</span></div>'
            '<div style="position: relative"><button style="height: 40px; padding: 0 14px; border: ' + fb + '; background: #fff; border-radius: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px">' + svg('M3 5h18l-7 8v6l-4-2v-4L3 5z', 15, 2) + 'Filter</button>' + (filter_panel() if filt else '') + '</div>'
            '<span style="color: ' + MUT + '; font-weight: 600">23 orders</span>' + ICONS + '</div>'
            '<div style="overflow-x: auto; margin-top: 22px"><div style="min-width: 1040px; display: flex; flex-direction: column; gap: 12px">'
            '<div style="display: grid; grid-template-columns: ' + GRID + '; gap: 16px; padding: 10px 20px; border-radius: 10px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40">' + hh + colicon + '</div>'
            '<section style="background: #fff; border-radius: 14px; overflow: hidden">' + ''.join(order_row(o) for o in ORDERS)
            + '<div style="padding: 14px 20px; border-top: 1px solid #E3EAE5; text-align: center"><button style="height: 38px; padding: 0 22px; border: 1px dashed #8FA699; background: transparent; border-radius: 9px; color: #2F4A3A; font-weight: 700">Show 13 more orders</button></div></section></div></div>')
    return page(title, body)

def kv(k, v, link=False):
    return '<div style="display: flex; justify-content: space-between; gap: 12px; padding: 6px 0"><span style="color: %s">%s</span><span style="font-weight: 700; text-align: right; color: %s">%s</span></div>' % (MUT, k, ACC if link else INK, v)

def card(title, side, body):
    return '<section style="background: #fff; border-radius: 14px; overflow: hidden"><div style="display: flex; align-items: center; gap: 12px; padding: 12px 18px; background: %s; color: #fff"><span style="font-weight: 800">%s</span>%s</div>%s</section>' % (HEAD, title, ('<span style="color: #CFE6D6; font-size: 13px">%s</span>' % side) if side else '', body)

def detail_page(title):
    lines = [('Cut-off wheel 4.5 x .045 x 7/8 in, Type 1', 'CW-45-045-T1', 'Box of 25', '4', '$36.00', '$144.00'), ('Nitrile disposable gloves, 8 mil, black, size L', 'GLV-N8-L-1000', 'Case of 1,000', '4', '$79.00', '$316.00'), ('Flap disc 4.5 in, 60 grit zirconia', 'FD-45-60Z', 'Box of 10', '3', '$44.25', '$132.75')]
    cols = '1fr 80px 120px 120px'
    th = '<div style="display: grid; grid-template-columns: %s; gap: 16px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Item</div><div style="text-align: right">:: Qty</div><div style="text-align: right">:: Price paid</div><div style="text-align: right">:: Total</div></div>' % cols
    rows = ''.join('<div style="display: grid; grid-template-columns: %s; gap: 16px; align-items: center; padding: 16px 20px; border-top: 1px solid #E3EAE5"><div><div style="font-weight: 700">%s</div><div style="font-size: 12.5px; color: %s; margin-top: 2px"><span style="font-family: %s">%s</span>, %s</div></div><div style="text-align: right; font-variant-numeric: tabular-nums">%s</div><div style="text-align: right; font-variant-numeric: tabular-nums">%s</div><div style="text-align: right; font-weight: 800; font-variant-numeric: tabular-nums">%s</div></div>' % (cols, n, MUT, MONO, s, u, q, p, t) for n, s, u, q, p, t in lines)
    total = ('<section style="background: #fff; border-radius: 14px; padding: 20px"><div style="font-size: 38px; font-weight: 800; letter-spacing: -0.03em; line-height: 1">$698.22</div><div style="color: ' + MUT + '; margin-top: 6px">Order total</div>'
             '<div style="margin-top: 14px; border-top: 1px solid #E3EAE5; padding-top: 8px">' + kv('Items', '$592.75') + kv('Freight', '$62.50') + kv('Sales tax', '$42.97') + '</div></section>')
    details = card('Order details', '', '<div style="padding: 10px 18px 16px">' + kv('Customer', 'Wasatch Mechanical Contractors', True) + kv('Account', '<span style="font-family: ' + MONO + '">WAS-1142</span>') + kv('Customer PO', '7777') + kv('Ordered', 'Sep 25, 2026') + kv('Fulfillment', 'Delivery, SLC') + kv('Shipped', 'Sep 26, 2026') + kv('From quote', 'Q-24816', True) + kv('Rep', 'Brandi Gallegos') + '</div>')
    body = ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px"><div><div style="display: flex; align-items: center; gap: 14px"><h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.035em; font-family: ' + MONO + '">SO-51223</h1>'
            '<span style="background: ' + ACC + '; color: #fff; font-size: 12px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; padding: 5px 12px; border-radius: 999px">Shipped</span></div>'
            '<div style="color: ' + MUT + '; margin-top: 4px">Wasatch Mechanical Contractors, PO 7777, ordered Sep 25, 2026</div></div>' + ICONS + '</div>'
            '<div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; margin-top: 22px"><div style="flex: 1 1 560px; min-width: 0">'
            + card('Items', '3 lines', th + rows) + '</div><div style="flex: 0 0 340px; max-width: 100%; display: flex; flex-direction: column; gap: 16px">' + total + details + '</div></div>')
    return page(title, body)

wr('ORBase.dc.html', list_page('Orders', False))
wr('OR1.dc.html', list_page('Orders filter', True))
wr('OR2.dc.html', detail_page('Order page'))

# ---------- canvas ----------
SRC = r"artifact-files\project\canvas.json"
cj = json.load(open(SRC, encoding="utf-8"))
page_id = 'quote'
def put(f, title, x, y):
    cj['boards'][f] = {'expand': 'fill', 'h': 900, 'w': 1440, 'x': x, 'y': y, 'title': title, 'page': page_id}
    if f not in cj['order']:
        cj['order'].append(f)
put('ORBase.dc.html', 'Orders', 0, 11200)
put('OR1.dc.html', 'Filter open', 1520, 11200)
put('OR2.dc.html', 'Order page', 3040, 11200)
cj['notes']['or1'] = {'kind': 'title1', 'maxW': 5960, 'size': 200, 'w': 240, 'text': 'Orders', 'x': -1474, 'y': 11437, 'page': page_id}
cj['notes']['or2'] = {'text': 'Orders come from the ERP and are read-only. Clicking an order opens the order page.', 'x': 1520, 'y': 10960, 'w': 520, 'page': page_id}
json.dump(cj, open(P + "\\canvas.json", "w", encoding="utf-8", newline="\n"), indent=2, ensure_ascii=False)
print('ok', [p['id'] for p in cj['pages']])
