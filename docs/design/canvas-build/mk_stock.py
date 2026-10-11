import json
_o = open(r"mk_orders.py", encoding="utf-8").read()
exec(_o[:_o.index("wr('ORBase.dc.html'")])   # helpers: rail, check, fld, lab, kv, card, ICONS, HEAD_HTML, svg, wr ...

def spage(title, body):
    s = HEAD_HTML
    for k, v in [('@@TITLE@@', title), ('@@CANVAS@@', CANVAS), ('@@INK@@', INK), ('@@RAIL@@', rail(3)), ('@@BODY@@', body)]:
        s = s.replace(k, v)
    return s

STOCK_GRID = 'minmax(250px, 3fr) 1.1fr 0.9fr 0.6fr 0.6fr 0.6fr 0.7fr 124px'
ITEMS = [
    ('Wedge anchor 1/2 x 4-1/4 in, zinc plated', 'ANC-12-414-W', 'Box of 25', '$31.50', '30', '12', '9', '51'),
    ('Flat washer 1/2 in, Grade 8, yellow zinc', 'FW-12-G8', 'Box of 100', '$15.75', '60', '31', '14', '105'),
    ('Flat washer 1/2 in, SAE, zinc plated', 'FW-12-SAE', 'Box of 100', '$8.25', '70', '28', '16', '114'),
    ('Hex cap screw 1/2-13 x 1-1/2 in, Grade 8, yellow zinc', 'HCS-12-13-112G8', 'Box of 50', '$34.50', '41', '18', '6', '65'),
    ('Hex cap screw 1/2-13 x 2 in, Grade 5, zinc plated', 'HCS-12-13-2G5', 'Box of 50', '$26.50', '58', '30', '12', '100'),
    ('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc', 'HCS-12-13-2G8', 'Box of 50', '$38.95', '64', '22', '8', '94'),
    ('Hex cap screw 1/2-13 x 3 in, Grade 8, yellow zinc', 'HCS-12-13-3G8', 'Box of 25', '$32.40', '36', '14', '5', '55'),
    ('Hex cap screw 3/8-16 x 1 in, Grade 5, zinc plated', 'HCS-38-16-1G5', 'Box of 100', '$17.25', '88', '45', '20', '153'),
    ('Hex cap screw 5/8-11 x 3 in, Grade 8, yellow zinc', 'HCS-58-11-3G8', 'Box of 25', '$49.80', '22', '10', '4', '36'),
]

def item_row(it):
    n, sku, uom, price, a, b, c, t = it
    return ('<div style="display: grid; grid-template-columns: %s; gap: 16px; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5">'
            '<div><div style="font-weight: 800">%s</div><div style="font-size: 12.5px; color: %s; margin-top: 2px"><span style="font-family: %s">%s</span>, %s</div></div>'
            '<div>Fasteners</div><div style="text-align: right; font-weight: 700; font-variant-numeric: tabular-nums">%s</div>'
            '<div style="text-align: right; font-variant-numeric: tabular-nums">%s</div><div style="text-align: right; font-variant-numeric: tabular-nums">%s</div><div style="text-align: right; font-variant-numeric: tabular-nums">%s</div>'
            '<div style="text-align: right; font-weight: 800; font-variant-numeric: tabular-nums">%s</div><div style="display: flex; justify-content: flex-end"><button style="height: 32px; padding: 0 12px; border: 1px solid #CBD7CF; background: #fff; border-radius: 8px; font-weight: 700; color: #14803C; white-space: nowrap">Add to quote</button></div></div>' % (STOCK_GRID, n, MUT, MONO, sku, uom, price, a, b, c, t))

def stock_filter():
    cats = [('Fasteners', '14', True), ('Abrasives and Cutting', '11', False), ('Safety and PPE', '11', False), ('Material Handling and Tie-downs', '10', False), ('Tools', '8', False), ('Janitorial and MRO', '8', False)]
    rows = ''.join('<div style="display: flex; align-items: center; gap: 8px; padding: 5px 0"><span style="width: 16px; height: 16px; border-radius: 4px; border: 2px solid %s; background: %s; display: inline-block; flex: none"></span><span>%s</span><span style="margin-left: auto; font-family: %s; font-size: 12px; color: %s">%s</span></div>' % (ACC, ACC if on else '#fff', n, MONO, MUT, c) for n, c, on in cats)
    return ('<div style="position: absolute; top: 48px; left: 0; width: 400px; box-sizing: border-box; background: #fff; border: 1px solid #B9C9BF; border-radius: 14px; box-shadow: 0 20px 44px rgba(15,59,34,0.24); z-index: 6; padding: 18px; color: %s; font-size: 14px">'
            '<div style="font-weight: 800; font-size: 16px; margin-bottom: 2px">Filter stock</div><div style="color: %s; font-size: 13px">62 items across 6 categories.</div>' % (INK, MUT)
            + lab('Category') + rows
            + lab('In stock at') + '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 8px">' + check('SLC', False) + check('Ogden', False) + check('Provo', False) + '</div>'
            + lab('Only show') + check('Low stock', False) + check('On order', False)
            + '<div style="height: 6px"></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">' + fld('List price from', '$0.00') + fld('List price to', '$500.00') + '</div>'
            + '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px"><span style="font-weight: 700; color: %s">Clear all</span><span style="height: 38px; padding: 0 22px; border-radius: 9px; background: %s; color: #fff; font-weight: 700; display: flex; align-items: center">Apply filters</span></div></div>' % (MUT, ACC))

def stock_list(title, filt):
    heads = ['Item', 'Category', 'List price', 'SLC', 'Ogden', 'Provo', 'Total']
    hh = ''.join('<div style="text-align: %s">:: %s</div>' % ('right' if h in ('List price', 'SLC', 'Ogden', 'Provo', 'Total') else 'left', h) for h in heads)
    colicon = '<div style="display: flex; justify-content: flex-end"><button aria-label="Choose columns" style="width: 28px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: rgba(0,0,0,0.08); color: inherit; display: flex; align-items: center; justify-content: center">' + svg('M4 5h16v14H4z M9.5 5v14 M14.5 5v14', 16, 2) + '</button></div>'
    fb = '2px solid %s' % ACC if filt else '1px solid %s' % LINE
    badge = ''
    body = ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px"><h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.035em">Stock</h1>'
            '<div style="width: 340px; max-width: 100%; box-sizing: border-box; height: 42px; border-radius: 10px; background: #fff; border: 1px solid ' + LINE + '; display: flex; align-items: center; gap: 10px; padding: 0 14px">' + svg('M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M20 20l-4-4', 17, 2) + '<span style="color: #6A7F73">Search SKU or item name</span></div>'
            '<div style="position: relative"><button style="height: 40px; padding: 0 14px; border: ' + fb + '; background: #fff; border-radius: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px">' + svg('M3 5h18l-7 8v6l-4-2v-4L3 5z', 15, 2) + 'Filter</button>' + (stock_filter() if filt else '') + '</div>'
            '<span style="color: ' + MUT + '; font-weight: 600">62 items, stock at SLC, Ogden and Provo</span>' + ICONS + '</div>'
            '<div style="overflow-x: auto; margin-top: 22px"><div style="min-width: 960px; display: flex; flex-direction: column; gap: 12px">'
            '<div style="display: grid; grid-template-columns: ' + STOCK_GRID + '; gap: 16px; padding: 10px 20px; border-radius: 10px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40">' + hh + colicon + '</div>'
            '<section style="background: #fff; border-radius: 14px; overflow: hidden">' + ''.join(item_row(i) for i in ITEMS)
            + '<div style="padding: 14px 20px; border-top: 1px solid #E3EAE5; text-align: center"><button style="height: 38px; padding: 0 22px; border: 1px dashed #8FA699; background: transparent; border-radius: 9px; color: #2F4A3A; font-weight: 700">Show 53 more items</button></div></section></div></div>')
    return spage(title, body)

def item_page(title):
    g = '1fr 130px 130px 150px'
    th = '<div style="display: grid; grid-template-columns: %s; gap: 16px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Branch</div><div style="text-align: right">:: Available</div><div style="text-align: right">:: On order</div><div style="text-align: right">:: Next receipt</div></div>' % g
    def br(name, sub, av, oo, nr, bold=False):
        return '<div style="display: grid; grid-template-columns: %s; gap: 16px; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5; font-weight: %d"><div>%s%s</div><div style="text-align: right; font-variant-numeric: tabular-nums">%s</div><div style="text-align: right; font-variant-numeric: tabular-nums">%s</div><div style="text-align: right; color: %s">%s</div></div>' % (g, 800 if bold else 600, name, ('<div style="font-size: 12.5px; color: %s; font-weight: 500; margin-top: 2px">%s</div>' % (MUT, sub)) if sub else '', av, oo, MUT, nr)
    stock = th + br('Salt Lake City', 'SLC', '30', '0', '-') + br('Ogden', '', '12', '0', '-') + br('Provo', '', '9', '0', '-') + br('All branches', '', '51', '0', '', True)
    og = '1.1fr 2fr 1.2fr 0.6fr 1fr'
    oth = '<div style="display: grid; grid-template-columns: %s; gap: 16px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Order</div><div>:: Customer</div><div>:: Ordered</div><div style="text-align: right">:: Qty</div><div style="text-align: right">:: Price paid</div></div>' % og
    def orow(so, c, d, q, p):
        return '<div style="display: grid; grid-template-columns: %s; gap: 16px; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5"><div style="font-weight: 800">%s</div><div style="font-weight: 600">%s</div><div>%s</div><div style="text-align: right; font-variant-numeric: tabular-nums">%s</div><div style="text-align: right; font-weight: 800; font-variant-numeric: tabular-nums">%s</div></div>' % (og, so, c, d, q, p)
    orders = oth + orow('SO-51215', 'Wasatch Mechanical Contractors', 'Jun 3, 2026', '3', '$25.60') + orow('SO-51204', 'Wasatch Mechanical Contractors', 'Dec 3, 2025', '2', '$25.20')
    price = ('<section style="background: #fff; border-radius: 14px; padding: 20px"><div style="font-size: 38px; font-weight: 800; letter-spacing: -0.03em; line-height: 1">$31.50</div><div style="color: ' + MUT + '; margin-top: 6px">List price per box of 25</div>'
             '<div style="margin-top: 14px; border-top: 1px solid #E3EAE5; padding-top: 10px; display: flex; justify-content: space-between"><span style="color: ' + MUT + '">In stock, all branches</span><span style="font-weight: 800">51</span></div>'
             '<button style="width: 100%; height: 46px; margin-top: 16px; border: 0; border-radius: 10px; background: ' + ACC + '; color: #fff; font-weight: 800; font-size: 15.5px">Add to quote</button></section>')
    details = card('Item details', '', '<div style="padding: 10px 18px 16px">' + kv('SKU', '<span style="font-family: ' + MONO + '">ANC-12-414-W</span>') + kv('Category', 'Fasteners') + kv('Sold as', 'Box of 25') + kv('Full case', '4 packs') + kv('List price', '$31.50') + '</div>')
    body = ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px"><div><h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.035em">Wedge anchor 1/2 x 4-1/4 in, zinc plated</h1>'
            '<div style="color: ' + MUT + '; margin-top: 4px"><span style="font-family: ' + MONO + '">ANC-12-414-W</span>, Fasteners, Box of 25</div></div>' + ICONS + '</div>'
            '<div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; margin-top: 22px"><div style="flex: 1 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 16px">'
            + card('Stock by branch', '51 available', stock) + card('Recent orders', 'All customers', orders) + '</div>'
            '<div style="flex: 0 0 340px; max-width: 100%; display: flex; flex-direction: column; gap: 16px">' + price + details + '</div></div>')
    return spage(title, body)


SCRIM = '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(15,35,25,0.45); z-index: 20"></div>'
def quote_opt(qid, cust, sub, total, sel):
    dot = '<span style="width: 18px; height: 18px; border-radius: 50%%; border: 2px solid %s; display: flex; align-items: center; justify-content: center; flex: none">%s</span>' % (ACC if sel else '#9DB0A5', ('<span style="width: 8px; height: 8px; border-radius: 50%%; background: %s"></span>' % ACC) if sel else '')
    return ('<div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; border: %s; background: %s; margin-top: 8px">%s<div style="flex: 1"><div style="font-weight: 800"><span style="font-family: %s">%s</span>, %s</div><div style="font-size: 12.5px; color: %s">%s</div></div><span style="font-weight: 800; font-variant-numeric: tabular-nums">%s</span></div>'
            % ('2px solid ' + ACC if sel else '1px solid ' + LINE, '#EEF6F0' if sel else '#fff', dot, MONO, qid, cust, MUT, sub, total))
ADD_DIALOG = (SCRIM + '<div style="position: absolute; left: 50%; top: 120px; margin-left: -290px; width: 580px; box-sizing: border-box; background: #fff; border-radius: 16px; box-shadow: 0 28px 60px rgba(15,35,25,0.4); z-index: 30; padding: 26px 28px; color: ' + INK + '">'
    '<div style="font-size: 22px; font-weight: 800">Add to quote</div>'
    '<div style="margin-top: 12px; padding: 12px 14px; background: #F2F6F3; border-radius: 10px"><div style="font-weight: 800">Wedge anchor 1/2 x 4-1/4 in, zinc plated</div><div style="font-size: 12.5px; color: ' + MUT + '; margin-top: 2px"><span style="font-family: ' + MONO + '">ANC-12-414-W</span>, Box of 25, list price $31.50, 51 in stock</div></div>'
    '<div style="font-size: 12.5px; font-weight: 700; color: ' + MUT + '; margin: 16px 0 0">Which quote?</div>'
    + quote_opt('Q-24817', 'Wasatch Mechanical Contractors', 'Draft ready, 4 lines', '$1,122.40', True)
    + quote_opt('Q-24788', 'Canyon Ridge Builders', 'Draft ready, 3 lines', 'Not sent', False)
    + quote_opt('Q-24785', 'Canyon Ridge Builders', 'Draft ready, 2 lines', 'Not sent', False)
    + '<div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; border: 1px dashed #8FA699; margin-top: 8px; font-weight: 700; color: ' + ACC + '"><span style="font-size: 20px; line-height: 1">+</span>Start a new quote</div>'
    '<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 18px"><div><div style="font-size: 12.5px; font-weight: 700; color: ' + MUT + '; margin-bottom: 4px">Quantity</div><div style="width: 90px; height: 40px; box-sizing: border-box; border: 1px solid ' + LINE + '; border-radius: 8px; display: flex; align-items: center; justify-content: flex-end; padding: 0 12px; font-weight: 700">2</div></div>'
    '<div style="color: ' + MUT + '; font-size: 13px; text-align: right; max-width: 280px">The customer price applies once it is on the quote. You can change it there.</div></div>'
    '<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px"><span style="height: 42px; padding: 0 22px; border-radius: 10px; border: 1px solid ' + LINE + '; font-weight: 700; display: flex; align-items: center">Cancel</span>'
    '<span style="height: 42px; padding: 0 26px; border-radius: 10px; background: ' + ACC + '; color: #fff; font-weight: 800; display: flex; align-items: center">Add to Q-24817</span></div></div>')

wr('STBase.dc.html', stock_list('Stock', False))
wr('ST1.dc.html', stock_list('Stock filter', True))
wr('ST2.dc.html', item_page('Item page'))
_i = item_page('Add to quote')
NL = chr(10)
wr('ST3.dc.html', _i.replace('</main>' + NL + '</div>' + NL + '</x-dc>', '</main>' + NL + ADD_DIALOG + NL + '</div>' + NL + '</x-dc>'))

SRC = P + "\canvas.json"
cj = json.load(open(SRC, encoding="utf-8"))
def put(f, title, x, y):
    cj['boards'][f] = {'expand': 'fill', 'h': 900, 'w': 1440, 'x': x, 'y': y, 'title': title, 'page': 'quote'}
    if f not in cj['order']:
        cj['order'].append(f)
put('STBase.dc.html', 'Stock', 0, 12500)
put('ST1.dc.html', 'Filter open', 1520, 12500)
put('ST2.dc.html', 'Item page', 3040, 12500)
put('ST3.dc.html', 'Add to quote', 4560, 12500)
cj['notes']['st1'] = {'kind': 'title1', 'maxW': 5960, 'size': 200, 'w': 240, 'text': 'Stock', 'x': -1474, 'y': 12737, 'page': 'quote'}
cj['notes']['st2'] = {'text': 'Items is now Stock. The category dropdown became the Filter button next to the search. Clicking an item opens the item page. Add to quote works from the list or the item page.', 'x': 1520, 'y': 12260, 'w': 520, 'page': 'quote'}
json.dump(cj, open(P + "\\canvas.json", "w", encoding="utf-8", newline="\n"), indent=2, ensure_ascii=False)
print('ok', 'ORBase.dc.html' in cj['boards'], len(cj['boards']))
