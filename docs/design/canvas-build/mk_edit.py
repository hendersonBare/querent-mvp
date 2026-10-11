import json, re
P = r"design\project"
ACC = "#14803C"; DARK = "#0F3B22"; HEAD = "#1F4A39"; CANVAS = "#D9E3DC"; INK = "#151D18"; MUT = "#4B5E52"; LINE = "#CBD7CF"
MONO = "'Geist Mono', monospace"

def wr(n, s):
    open(P + "\\" + n, "w", encoding="utf-8", newline="\n").write(s)

def svg(d, size=18, sw=2, extra=""):
    return '<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"%s><path d="%s"/></svg>' % (size, size, sw, extra, d)

LOGO = '<svg width="40" height="40" viewBox="10 10 80 80" fill="none" stroke="#7FDBA0" stroke-width="7.5" stroke-linecap="round" role="img" aria-label="Querent"><circle cx="49" cy="49" r="28.5"/><path d="M60 60 81 82"/></svg>'

NAV = [('Quotes', 'M6 3h9l4 4v14H6V3z M14 3v5h5 M9 13h7 M9 17h5'), ('Customers', 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21c1-4 4-6 8-6s7 2 8 6'), ('Orders', 'M3 8l9-5 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9'), ('Stock', 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z'), ('Analytics', 'M4 20V10 M10 20V4 M16 20v-8 M22 20H2'), ('Teams and Reps', 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M17 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M2 20c.8-3.5 3.3-5 7-5s6.2 1.5 7 5 M17 14c3 0 4.7 1.4 5 4'), ('Settings', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2')]

def rail():
    out = ''
    for i, (lab, d) in enumerate(NAV):
        on = i == 0
        out += ('<a href="#" style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; background: %s; color: %s; font-weight: %d">%s<span style="font-size: 14px; white-space: nowrap">%s</span></a>'
                % (ACC if on else 'transparent', '#fff' if on else '#9CC8AB', 700 if on else 500, svg(d, 20, 1.8), lab))
    return ('<aside style="flex: 0 0 216px; align-self: stretch; background: %s"><div style="position: sticky; top: 0; height: 900px; box-sizing: border-box; padding: 20px 14px; display: flex; flex-direction: column; gap: 3px">'
            '<div style="display: flex; align-items: center; gap: 10px; padding: 0 8px">%s<span style="font-weight: 800; font-size: 20px; letter-spacing: -0.03em; color: #fff">Querent</span></div>'
            '<div style="padding: 6px 8px 22px; font-size: 13px; font-weight: 800; white-space: nowrap; color: #7FDBA0">Herrick Industrial Supply</div>%s<div style="flex: 1 1 auto"></div>'
            '<div style="border-top: 1px solid #25573A; padding: 14px 8px 0; display: flex; flex-direction: column; gap: 12px"><div style="display: flex; align-items: center; gap: 10px">'
            '<div style="width: 38px; height: 38px; border-radius: 50%%; background: #fff; color: %s; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center">BG</div>'
            '<div><div style="font-weight: 700; color: #fff">Brian G.</div><div style="font-size: 12.5px; color: #8FBFA0">Manager</div></div></div>'
            '<button style="height: 36px; border-radius: 9px; border: 1px solid #3A7050; background: transparent; color: #fff; font-weight: 600">Sign out</button></div></div></aside>') % (DARK, LOGO, out, DARK)

# ---------- items ----------
ROWS = [
    ('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc', 'HCS-12-13-2G8', 'Box of 50', '', '10', '64 at SLC', '', '$21.40', '31.50', 'Last paid', '32.1', '$315.00', ''),
    ('Cut-off wheel 4.5 x .045 x 7/8 in, Type 1', 'CW-45-045-T1', 'Box of 25', 'Contract', '6', '140 at SLC', '', '$24.10', '36.00', 'Contract', '33.1', '$216.00', ''),
    ('Nitrile disposable gloves, 8 mil, black, size L', 'GLV-N8-L-1000', 'Case of 1,000', '', '4', '9 at SLC', '', '$58.00', '79.00', 'Last paid', '26.6', '$316.00', "Below Brandi's 30% Safety & PPE floor"),
    ('Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks', 'RS-2-27-JH', 'Each', '', '12', '7 at SLC', 'Short 5', '$14.20', '22.95', 'Customer', '38.1', '$275.40', ''),
]

def box(val, w, red=False, align='right'):
    return '<div style="width: %dpx; height: 34px; box-sizing: border-box; border: 1px solid %s; border-radius: 8px; background: #fff; display: flex; align-items: center; justify-content: flex-end; padding: 0 10px; font-variant-numeric: tabular-nums; color: %s">%s</div>' % (w, '#C92A1C' if red else LINE, '#C92A1C' if red else INK, val)

HELP = '<span style="width: 18px; height: 18px; border-radius: 50%%; border: 1.5px solid #6A7F73; color: #6A7F73; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center">?</span>'

def item_row(r, cost, tokens, idx):
    name, sku, uom, tag, qty, avail, short, c, price, src, mg, tot, warn = r
    cols = '1fr 60px 92px 66px 118px 78px 82px 16px' if cost else '1fr 70px 138px 90px 92px 16px'
    cell_i = ('<div><div style="font-weight: 700; line-height: 1.3">%s</div><div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-top: 3px"><span style="font-family: %s; font-size: 11.5px; color: #5A6E62">%s</span><span style="font-size: 12.5px; color: #5A6E62">%s</span>%s'
              '<button style="border: 0; background: transparent; padding: 0; color: %s; font-weight: 700; font-size: 12.5px">Details</button></div></div>') % (name, MONO, sku, uom, ('<span style="font-size: 11px; font-weight: 700; color: %s; background: #DDF1E4; padding: 1px 7px; border-radius: 5px">CONTRACT</span>' % ACC) if tag else '', ACC)
    cell_q = '<div style="display: flex; justify-content: flex-end">%s</div>' % box(qty, 56)
    cell_a = '<div style="font-size: 13.5px"><div>%s</div>%s</div>' % (avail, ('<div style="font-size: 12px; font-weight: 700; color: #C92A1C">%s</div>' % short) if short else '') if cost else ''
    cell_c = '<div style="font-variant-numeric: tabular-nums">%s</div>' % c if cost else ''
    warn_html = ('<div style="font-size: 11.5px; font-weight: 700; color: #C92A1C; background: #FDE7E4; padding: 3px 8px; border-radius: 6px; margin-bottom: 4px; text-align: right">%s</div>' % warn.replace('&', '&amp;')) if warn else ''
    cell_p = ('<div style="position: relative; display: flex; flex-direction: column; align-items: flex-end">%s<div style="display: flex; align-items: center; gap: 6px"><span>$</span>%s</div>'
              '<div style="display: flex; align-items: center; gap: 6px; margin-top: 4px"><button style="border: 0; background: transparent; padding: 0; color: %s; font-weight: 700; font-size: 12.5px; text-decoration: underline">%s</button>%s</div>%s</div>') % (warn_html, box(price, 84, bool(warn)), MUT, src, HELP, tokens.get('PRICE%d' % idx, ''))
    cell_m = '<div style="display: flex; align-items: center; gap: 4px; justify-content: flex-end">%s<span>%%</span></div>' % box(mg, 52, bool(warn))
    cell_t = '<div style="text-align: right; font-weight: 800; font-variant-numeric: tabular-nums">%s</div>' % tot
    cell_x = '<button aria-label="Remove item" style="border: 0; background: transparent; color: #6A7F73; font-size: 16px; padding: 0">x</button>'
    inner = cell_i + cell_q + cell_a + cell_c + cell_p + cell_m + cell_t + cell_x
    return ('<div style="padding: 14px 18px; border-top: 1px solid #E3EAE5"><div style="display: grid; grid-template-columns: %s; gap: 8px; align-items: start">%s</div>%s</div>' % (cols, inner, tokens.get('ROW%d' % idx, '')))

def items_card(cost, tokens):
    cols = '1fr 60px 92px 66px 118px 78px 82px 16px' if cost else '1fr 70px 138px 90px 92px 16px'
    heads = ['Item', 'Qty'] + (['Available', 'Cost'] if cost else []) + ['Unit price', 'Margin', 'Total', '']
    hh = ''.join('<div style="text-align: %s">:: %s</div>' % ('right' if h in ('Qty', 'Unit price', 'Margin', 'Total') else 'left', h) if h else '<div></div>' for h in heads)
    sw_bg = ACC if cost else '#B9C6BE'
    sw_pos = 'right: 3px' if cost else 'left: 3px'
    toggle = ('<div style="display: flex; align-items: center; gap: 10px"><span style="font-weight: 700">Show cost and stock</span>'
              '<span style="position: relative; width: 40px; height: 22px; border-radius: 999px; background: %s; display: block"><span style="position: absolute; top: 3px; %s; width: 16px; height: 16px; border-radius: 50%%; background: #fff"></span></span></div>') % (sw_bg, sw_pos)
    rows = ''.join(item_row(r, cost, tokens, i + 1) for i, r in enumerate(ROWS))
    add = tokens.get('ADDROW', '<button style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%%; height: 46px; border: 1px dashed #8FA699; background: transparent; border-radius: 10px; color: %s; font-weight: 700"><span style="font-size: 20px; line-height: 1">+</span>Add item</button>' % '#2F4A3A')
    return ('<section style="background: #fff; border-radius: 14px; overflow: hidden"><div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; background: %s; color: #fff">'
            '<div style="font-weight: 800">Items <span style="font-family: %s; font-weight: 500; font-size: 12px; background: rgba(255,255,255,0.16); padding: 1px 8px; border-radius: 999px; margin-left: 6px">4</span></div>'
            '<div style="color: #fff">%s</div></div>'
            '<div style="display: grid; grid-template-columns: %s; gap: 8px; padding: 10px 18px; font-size: 12px; font-weight: 800; color: #3A4A40; background: #E4EAE5">%s</div>%s'
            '<div style="padding: 12px 18px 16px; border-top: 1px solid #E3EAE5">%s</div></section>') % (HEAD, MONO, toggle.replace('color: ', 'color: ').replace('<span style="font-weight: 700">', '<span style="font-weight: 700; color: #fff">'), cols, hh, rows, add)

def suggested(tokens):
    ideas = [('Hex nut 1/2-13, Grade 8, yellow zinc (box of 100)', 'Matches the 1/2-13 Grade 8 bolts: 5 boxes of 100 cover all 500. Bought with these bolts on all 5 orders that had them in the last 12 months.', 'HN-12-13-G8', '5 at $18.15', '46.0% margin', '+$41.75 GP', 'Add'),
             ('Flap disc 4.5 in, 60 grit zirconia (box of 10)', 'Bought with cut-off wheels on 4 of the 5 orders that had them in the last 12 months.', 'FD-45-60Z', '3 at $44.25', '29.9% margin', '+$39.75 GP', 'Add'),
             ('Flat washer 1/2 in, Grade 8, yellow zinc (box of 100)', 'Matches the 1/2-13 Grade 8 bolts: 5 boxes of 100 cover all 500. Bought with these bolts on 4 of the 5 orders that had them in the last 12 months.', 'FW-12-G8', '5 at $14.25', '48.1% margin', '+$34.25 GP', 'Add'),
             ('Bump cut-off wheels to 8 boxes (2 full cases)', 'A case holds 4 boxes, so 6 leaves a broken case.', 'CW-45-045-T1', '6 to 8 at $36.00', '33.1% margin', '+$23.80 GP', 'Apply'),
             ('Safety glasses, clear anti-fog (box of 12)', 'Bought with nitrile disposable gloves on 2 of the 4 orders that had them in the last 12 months.', 'SG-CLR-AF', '2 at $29.90', '39.1% margin', '+$23.40 GP', 'Add')]
    body = ''
    if tokens.get('SUGG_OPEN'):
        for t, d, sku, pr, mg, gp, btn in ideas:
            body += ('<div style="display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 12px 18px; border-top: 1px solid #E3EAE5"><div><div style="font-weight: 700">%s</div>'
                     '<div style="font-size: 12.5px; color: %s; margin-top: 2px; line-height: 1.35">%s</div><div style="font-size: 12px; color: %s; margin-top: 3px"><span style="font-family: %s">%s</span>, %s, %s, <b style="color: %s">%s</b></div></div>'
                     '<button style="height: 34px; padding: 0 18px; border: 1px solid %s; background: #fff; border-radius: 8px; font-weight: 700">%s</button></div>') % (t, MUT, d, MUT, MONO, sku, pr, mg, ACC, gp, LINE, btn)
    return ('<section style="background: #fff; border-radius: 14px; overflow: hidden"><div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 18px; background: %s; color: #fff">'
            '<div style="display: flex; align-items: center; gap: 10px; font-weight: 800">Suggested by Querent<span style="font-size: 12px; font-weight: 700; background: #7FDBA0; color: %s; padding: 2px 9px; border-radius: 999px">Querent found +$11.50 GP</span></div>'
            '<div style="font-size: 12.5px">5 ideas, up to +$162.95 gross profit%s</div></div>%s</section>') % (HEAD, DARK, '' if tokens.get('SUGG_OPEN') else '', body)

def icon_btn(d, label, token, tokens, wide=False):
    return ('<div style="position: relative"><button aria-label="%s" style="width: 46px; height: 46px; border-radius: 10px; border: 1px solid %s; background: #fff; color: %s; display: flex; align-items: center; justify-content: center">%s</button>%s</div>'
            % (label, LINE, INK, svg(d, 20, 2), tokens.get(token, '')))

def details_card(tokens):
    body = tokens.get('DETAILS', '')
    return ('<section style="background: #fff; border-radius: 14px; overflow: hidden"><div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 16px; background: %s; color: #fff">'
            '<span style="font-weight: 800">Quote details</span><span style="font-size: 12.5px; color: #CFE6D6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">Net 30, will call SLC, valid until Oct 25</span>'
            '<span style="width: 14px; display: flex">%s</span></div>%s</section>') % (HEAD, svg('m6 9 6 6 6-6' if not body else 'm6 15 6-6 6 6', 14, 2.4), body)

def build(title, tokens=None, cost=False, root_extra=''):
    tokens = tokens or {}
    bell = svg('M6 17v-6a6 6 0 1 1 12 0v6l1.5 2h-15L6 17z M10 21a2 2 0 0 0 4 0', 19, 2)
    caut = svg('M12 3 2 20h20L12 3z M12 10v4 M12 17.5v.01', 19, 2)
    meta = ''
    items = [('Quote', '<span style="font-family: %s; font-weight: 700">Q-24817</span>' % MONO), ('Status', '<span style="background: %s; color: #fff; font-size: 11.5px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px">Draft ready</span> <span style="color: #C92A1C; font-weight: 700; font-size: 13px; margin-left: 6px">Overdue</span>' % DARK),
             ('Purchasing agent', 'Dana Ortiz'), ('Requested', 'Fri Oct 9, 10:14 AM'), ('Valid until', 'Oct 25')]
    for k, v in items:
        meta += '<div><div style="font-size: 12px; font-weight: 700; color: %s; margin-bottom: 3px">%s</div><div style="font-weight: 600; min-height: 24px; display: flex; align-items: center">%s</div></div>' % (MUT, k, v)
    total = ('<div style="background: #fff; border-radius: 14px; padding: 20px"><div style="font-size: 38px; font-weight: 800; letter-spacing: -0.03em; line-height: 1">$1,122.40</div>'
             '<div style="color: %s; margin-top: 6px">Quote total, before tax</div>'
             '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px">'
             '<div style="border: 1px solid %s; border-radius: 10px; padding: 10px 12px"><div style="font-size: 18px; font-weight: 800">$361.40</div><div style="font-size: 12.5px; color: %s">Gross profit</div></div>'
             '<div style="border: 1px solid %s; border-radius: 10px; padding: 10px 12px"><div style="font-size: 18px; font-weight: 800">32.2%%</div><div style="font-size: 12.5px; color: %s">Margin, floor 23.8%%</div></div></div>'
             '<div style="position: relative; margin-top: 16px"><button style="width: 100%%; height: 48px; border: 0; border-radius: 10px; background: %s; color: #fff; font-weight: 800; font-size: 15.5px">Approve and send</button>%s</div></div>') % (MUT, LINE, MUT, LINE, MUT, ACC, tokens.get('SEND', ''))
    row = ('<div style="display: flex; gap: 10px; margin-top: 12px">%s%s%s%s</div>') % (
        icon_btn('M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6', 'Save draft', 'SAVE', tokens),
        icon_btn('M12 4v11 M7 10l5 5 5-5 M5 20h14', 'Export', 'EXPORT', tokens),
        icon_btn('M4 5h16v11H9l-5 4z', 'Customer chat, 5 messages', 'CHAT', tokens),
        icon_btn('M5 12h.01 M12 12h.01 M19 12h.01', 'More actions', 'MORE', tokens))
    header_icons = ('<div style="display: flex; align-items: center; gap: 10px; margin-left: auto"><button aria-label="Needs attention, 2 items" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid #E8A8A0; background: #FFEDEA; color: #C92A1C; display: flex; align-items: center; justify-content: center">%s</button>'
                    '<button aria-label="Notifications" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid %s; background: #fff; color: %s; display: flex; align-items: center; justify-content: center">%s</button></div>') % (caut, LINE, MUT, bell)
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
  <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px"><h1 style="margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -0.035em">Wasatch Mechanical Contractors</h1>%(hicons)s</div>
  <div style="display: flex; flex-wrap: wrap; gap: 14px 40px; margin-top: 14px">%(meta)s</div>
  <div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; margin-top: 20px">
    <div style="flex: 1 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 14px">%(items)s%(sugg)s</div>
    <div style="flex: 0 0 340px; max-width: 100%%; display: flex; flex-direction: column; gap: 0">%(total)s%(row)s<div style="height: 14px"></div>%(details)s</div>
  </div>
</main>
%(root)s
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1440,"height":900}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
''' % dict(title=title, canvas=CANVAS, ink=INK, rail=rail(), hicons=header_icons, meta=meta, items=items_card(cost, tokens), sugg=suggested(tokens), total=total, row=row, details=details_card(tokens), root=tokens.get('ROOT', ''))
    return html

# ---------- overlay pieces ----------
SCRIM = '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(15,35,25,0.45); z-index: 20"></div>'
def menu(pos, w, items):
    out = ''
    for lab, sub, dis, div in items:
        if div:
            out += '<div style="height: 1px; background: #E3EAE5; margin: 6px 4px"></div>'
        out += '<div style="padding: 9px 12px; border-radius: 8px"><div style="font-weight: 700; color: %s">%s</div>%s</div>' % ('#8DA195' if dis else INK, lab, ('<div style="font-size: 12.5px; color: %s; margin-top: 1px">%s</div>' % (MUT, sub)) if sub else '')
    return '<div style="position: absolute; %s; width: %dpx; box-sizing: border-box; background: #fff; border: 1px solid #B9C9BF; border-radius: 12px; box-shadow: 0 18px 40px rgba(15,59,34,0.22); padding: 6px; z-index: 12; font-size: 14px; color: %s">%s</div>' % (pos, w, INK, out)

EXPORT_MENU = menu('top: 54px; left: 0', 300, [('Customer quote (PDF)', 'What Dana sees. No cost or margin.', False, False), ('Internal worksheet (PDF)', 'Adds cost, margin, last paid and open checks', False, False), ('Line items (CSV)', 'Opens in Excel or Google Sheets', False, False), ('Copy quote summary', 'Plain text for an email or text message', False, True)])
MORE_MENU = menu('top: 54px; right: 0', 250, [('Duplicate quote', '', False, False), ('Reassign to another rep', '', False, False), ('Open customer in ERP', '', True, False), ('Reset sample quote', '', False, True)])

SEND_DIALOG = (SCRIM + '<div style="position: absolute; left: 50%; top: 110px; margin-left: -300px; width: 600px; box-sizing: border-box; background: #fff; border-radius: 16px; box-shadow: 0 28px 60px rgba(15,35,25,0.4); z-index: 30; padding: 26px 28px; color: ' + INK + '">'
    '<div style="font-size: 22px; font-weight: 800">Send quote to Dana Ortiz</div>'
    '<div style="color: ' + MUT + '; margin-top: 4px">4 items, $1,122.40 before tax. Will call at SLC, Thu Oct 15. Valid until Oct 25.</div>'
    '<div style="background: #FBE7A1; color: #5C4300; border-radius: 10px; padding: 14px 16px; margin-top: 16px; line-height: 1.45"><b>Still open:</b> Nitrile disposable gloves: 26.6% margin, below Brandi\'s 30% Safety &amp; PPE floor. Ratchet strap 2 in x 27 ft: short 5 at SLC. 20 at Ogden. 24 on order at SLC, due Oct 12. You can send anyway.</div>'
    '<div style="display: flex; align-items: center; gap: 22px; margin-top: 16px; font-weight: 600"><span style="color: ' + MUT + '">Send by</span>'
    '<span style="display: flex; align-items: center; gap: 8px"><span style="width: 16px; height: 16px; border-radius: 4px; background: #9DB0A5; display: inline-block"></span>Querent chat</span>'
    '<span style="display: flex; align-items: center; gap: 8px"><span style="width: 16px; height: 16px; border-radius: 4px; background: ' + ACC + '; display: inline-block"></span>Attach PDF</span>'
    '<span style="color: ' + ACC + '; font-weight: 800">Preview PDF</span></div>'
    '<div style="font-size: 12.5px; font-weight: 700; color: ' + MUT + '; margin: 16px 0 4px">Message to Dana</div>'
    '<div style="min-height: 104px; box-sizing: border-box; border: 1px solid ' + LINE + '; border-radius: 10px; padding: 12px 14px; line-height: 1.5">Hi Dana, your quote is ready: 4 items, $1,122.40 before tax, pickup at SLC on Thu, Oct 15. You can accept it or ask for changes from the link. Thanks, Brandi</div>'
    '<div style="font-size: 12.5px; color: ' + MUT + '; margin-top: 8px">Dana\'s chat shows it under "Quote Q-24817 is ready: $1,122.40, valid until Oct 25 - View quote".</div>'
    '<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px"><span style="height: 42px; padding: 0 22px; border-radius: 10px; border: 1px solid ' + LINE + '; font-weight: 700; display: flex; align-items: center">Cancel</span>'
    '<span style="height: 42px; padding: 0 26px; border-radius: 10px; background: ' + ACC + '; color: #fff; font-weight: 800; display: flex; align-items: center">Send quote</span></div></div>')

def kv(k, v):
    return '<div style="display: flex; justify-content: space-between; gap: 12px; padding: 4px 0"><span style="color: %s">%s</span><span style="font-weight: 700; text-align: right">%s</span></div>' % (MUT, k, v)

def sec(title, summ, body):
    return '<div style="padding: 14px 16px; border-top: 1px solid #E3EAE5"><div style="display: flex; justify-content: space-between; margin-bottom: 8px"><span style="font-size: 12.5px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase">%s</span><span style="font-size: 12.5px; color: %s">%s</span></div>%s</div>' % (title, MUT, summ, body)

def field(label, val, tall=False):
    return '<div style="margin-top: 8px"><div style="font-size: 12px; font-weight: 700; color: %s; margin-bottom: 3px">%s</div><div style="min-height: %dpx; box-sizing: border-box; border: 1px solid %s; border-radius: 8px; padding: 8px 10px; color: %s; background: #fff">%s</div></div>' % (MUT, label, 66 if tall else 36, LINE, INK if val and not val.startswith('~') else '#6A7F73', val.lstrip('~'))

DETAILS_BODY = ('<div style="max-height: 520px; overflow-y: auto; font-size: 13.5px">'
    + sec('Customer', 'Net 30, 39% of credit',
          '<div style="display: flex; justify-content: space-between; align-items: center"><div><div style="font-weight: 800">Dana Ortiz</div><div style="color: ' + MUT + '">Purchasing, (801) 555-0142</div></div><span style="height: 28px; padding: 0 12px; border: 1px solid ' + LINE + '; border-radius: 7px; font-weight: 700; display: flex; align-items: center">Copy</span></div>'
          + kv('Account', '<span style="font-family: ' + MONO + '">WAS-1142</span>') + kv('Terms', 'Net 30, nothing past due') + kv('Open balance', '$18,420.00') + kv('Credit limit', '$50,000.00') + kv('Last order', 'Sep 25, SO-51223') + kv('Wins on quotes', '71% over 12 months') + kv('Tax status', 'Taxable, UT') + kv('Credit used, with this quote', '39%'))
    + sec('Pickup or delivery', 'Will call, SLC, Thu Oct 15',
          '<div style="display: flex; background: #EEF3EF; border-radius: 9px; padding: 3px"><span style="flex: 1; text-align: center; padding: 7px; border-radius: 7px; background: ' + ACC + '; color: #fff; font-weight: 700">Will call</span><span style="flex: 1; text-align: center; padding: 7px; font-weight: 600; color: ' + MUT + '">Delivery</span></div>'
          + field('Branch', 'SLC - Salt Lake City') + kv('Pickup requested for', 'Thu Oct 15') + kv('Freight', '$0.00') + '<div style="color: ' + MUT + '; margin-top: 4px">Will call at SLC: no freight.</div><div style="margin-top: 8px"><span style="display: inline-block; padding: 7px 12px; border: 1px solid ' + LINE + '; border-radius: 8px; font-weight: 700">Set freight by hand</span></div>')
    + sec('Quote terms', 'Valid until Oct 25',
          field('Valid until', '10/25/2026') + '<div style="font-size: 12px; color: ' + MUT + '; margin-top: 4px">Default: 14 days after it is sent. Pick any date to change it.</div>'
          + field('Customer PO number', '~Optional, customer can add at acceptance') + field('Note printed on the quote', '~The customer sees this on the quote and in its PDF', True))
    + sec('Internal notes', 'None', '<div style="color: ' + MUT + '">Only your team sees these.</div>' + field('', '~Add a note for your team', True) + '<div style="display: flex; justify-content: flex-end; margin-top: 8px"><span style="padding: 7px 16px; border-radius: 8px; background: ' + ACC + '; color: #fff; font-weight: 700">Add note</span></div>')
    + sec('Activity', '3 events',
          kv('Oct 9, 10:13 AM', '') + '<div style="margin: -2px 0 6px">Draft quote built and sent to Brandi for review</div>' + kv('Oct 9, 10:13 AM', '') + '<div style="margin: -2px 0 6px">Querent matched 4 items after 1 clarifying question</div>' + kv('Oct 9, 10:14 AM', '') + '<div style="margin: -2px 0 0">Dana asked for bolts, cut-off wheels, gloves and straps in Querent chat</div>')
    + '</div>')

def bubble(who, when, text, you):
    return ('<div style="background: %s; border-radius: 10px; padding: 12px 14px; margin-top: 12px"><div style="font-size: 11.5px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: %s">%s <span style="font-weight: 500; letter-spacing: 0; text-transform: none; color: %s">%s</span></div><div style="margin-top: 4px; font-weight: %d; line-height: 1.4">%s</div></div>'
            % ('#DDF1E4' if you else '#F4F7F5', '#1F4A39', who, MUT, when, 700 if you else 500, text))

CHAT = (SCRIM + '<aside style="position: absolute; top: 0; right: 0; bottom: 0; width: 430px; box-sizing: border-box; background: #fff; box-shadow: -16px 0 40px rgba(15,59,34,0.2); z-index: 30; padding: 24px 24px; color: ' + INK + '">'
    '<div style="display: flex; justify-content: space-between; align-items: flex-start"><div><div style="font-size: 22px; font-weight: 800">Full chat</div><div style="color: ' + MUT + '; font-size: 13px; margin-top: 2px">Dana Ortiz, 5 messages, via Querent chat</div></div><span style="width: 32px; height: 32px; border-radius: 8px; background: #EEF2F0; display: flex; align-items: center; justify-content: center">x</span></div>'
    + bubble('Dana Ortiz', 'Fri Oct 9, 10:12 AM', 'Do you have the 1/2 in grade 8 hex bolts in stock? Need 10 boxes plus the usual cut-off wheels and gloves. Also need 2 in ratchet straps, maybe 12. Can we pick up Thursday at the SLC branch?', True)
    + bubble('Querent', 'Fri Oct 9, 10:12 AM', 'Yes, the 1/2-13 x 2 in Grade 8 hex cap screws are in stock at SLC.', False)
    + bubble('Dana Ortiz', 'Fri Oct 9, 10:13 AM', '27 ft with J-hooks.', True)
    + '<div style="margin-top: 14px; font-size: 13px; color: ' + MUT + '; font-style: italic">Item pop-up: Here is your list. Check the quantities. Fri Oct 9, 10:13 AM</div><div style="margin-top: 8px; font-size: 13px; color: ' + MUT + '; font-style: italic">Quote requested: Thanks, Dana. Brandi Gallego has your quote. Fri Oct 9, 10:14 AM</div></aside>')

ADD_OPEN = ('<div style="position: relative"><div style="height: 46px; box-sizing: border-box; border: 2px solid ' + ACC + '; border-radius: 10px; display: flex; align-items: center; gap: 10px; padding: 0 14px; background: #fff">'
    + svg('M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M20 20l-4-4', 17, 2) + '<span style="font-weight: 600">1/2</span><span style="width: 1px; height: 18px; background: ' + INK + '"></span></div>'
    '<div style="position: absolute; top: 52px; left: 0; right: 0; background: #fff; border: 1px solid #B9C9BF; border-radius: 12px; box-shadow: 0 18px 40px rgba(15,59,34,0.22); padding: 6px; z-index: 12">'
    + ''.join('<div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; background: %s"><div><div style="font-weight: 700">%s</div><div style="font-size: 12.5px; color: %s"><span style="font-family: %s">%s</span>, %s</div></div><span style="font-weight: 800; color: %s">%s</span></div>' % (bg, n, MUT, MONO, s, d, ACC if r else MUT, r)
              for bg, n, s, d, r in [('#E3F1E8', 'Hex nut 1/2-13, Grade 8, yellow zinc (box of 100)', 'HN-12-13-G8', '41 at SLC, $18.15', 'Add'), ('transparent', 'Flat washer 1/2 in, Grade 8, yellow zinc (box of 100)', 'FW-12-G8', '88 at SLC, $14.25', 'Add'), ('transparent', 'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc', 'HCS-12-13-2G8', '64 at SLC, $31.50', 'Already on quote')])
    + '<div style="padding: 6px 12px 2px; font-size: 11.5px; color: ' + MUT + '">3 matches for "1/2". Type a SKU or name.</div></div></div>')

ROW_DETAILS = ('<div style="margin-top: 12px; background: #F2F6F3; border-radius: 10px; padding: 14px 16px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; font-size: 13px">'
    '<div><div style="font-weight: 800; margin-bottom: 4px">Price options</div>' + kv('List price', '$38.20') + kv('Contract price', 'None') + kv('Last paid, Sep 25', '$31.50') + kv('Cost', '$21.40') + '</div>'
    '<div><div style="font-weight: 800; margin-bottom: 4px">Stock</div>' + kv('SLC', '64') + kv('Ogden', '12') + kv('On order', '0') + '</div>'
    '<div><div style="font-weight: 800; margin-bottom: 4px">Note on this line</div><div style="height: 64px; box-sizing: border-box; border: 1px solid ' + LINE + '; border-radius: 8px; background: #fff; padding: 8px 10px; color: #6A7F73">Add a line note</div></div></div>')

PRICE_MENU = ('<div style="position: absolute; top: 76px; right: 0; width: 250px; background: #fff; border: 1px solid #B9C9BF; border-radius: 12px; box-shadow: 0 18px 40px rgba(15,59,34,0.22); padding: 6px; z-index: 12; text-align: left; font-size: 13.5px">'
    + ''.join('<div style="display: flex; justify-content: space-between; padding: 9px 10px; border-radius: 8px; background: %s"><span style="font-weight: 700">%s</span><span style="font-variant-numeric: tabular-nums">%s</span></div>' % (bg, a, b) for bg, a, b in [('#E3F1E8', 'Last paid, Sep 25', '$31.50'), ('transparent', 'List price', '$38.20'), ('transparent', 'Contract price', 'None for this item'), ('transparent', 'Type a price by hand', '')])
    + '</div>')

TOAST = ('<div style="position: absolute; left: 50%; bottom: 36px; margin-left: -150px; width: 300px; background: ' + DARK + '; color: #fff; border-radius: 12px; padding: 14px 18px; box-shadow: 0 16px 36px rgba(15,35,25,0.4); z-index: 30; display: flex; align-items: center; gap: 12px"><span style="color: #7FDBA0">' + svg('m5 12 5 5 9-10', 20, 2.4) + '</span><span style="font-weight: 700">Draft saved at 10:26 PM</span></div>')

def tbl_row(cells, bold=False, last=None):
    return '<div style="display: grid; grid-template-columns: %s; gap: 8px; align-items: center; padding: 5px 0; font-weight: %d">%s</div>'

def opt_row(basis, price, margin, state, bold=False):
    btn = ('<span style="justify-self: end; padding: 3px 12px; border: 1px solid %s; border-radius: 7px; background: #fff; font-weight: 800; color: %s; font-size: 12.5px">Use</span>' % (LINE, ACC)) if state == 'use' else '<span style="justify-self: end; padding: 3px 10px; border: 1px solid #DCE4DF; border-radius: 7px; font-weight: 600; color: #9AAAA0; font-size: 12.5px">Current</span>'
    return '<div style="display: grid; grid-template-columns: 1.1fr 0.9fr 0.9fr 0.9fr; gap: 8px; align-items: center; padding: 5px 0; font-weight: %d"><span>%s</span><span style="font-variant-numeric: tabular-nums">%s</span><span style="font-variant-numeric: tabular-nums">%s</span>%s</div>' % (800 if bold else 500, basis, price, margin, btn)

def stock_row(branch, hand, order, bold=False):
    return '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 5px 0; font-weight: %d"><span>%s</span><span>%s</span><span style="color: %s">%s</span></div>' % (800 if bold else 500, branch, hand, MUT, order)

def th(cols):
    return '<div style="display: grid; grid-template-columns: %s; gap: 8px; font-size: 12px; font-weight: 700; color: %s; padding-bottom: 3px">%s</div>' % (cols[0], MUT, ''.join('<span>%s</span>' % c for c in cols[1]))

ROW_DETAILS = ('<div style="margin-top: 12px; background: #EEF3EF; border-radius: 10px; padding: 16px 18px; display: grid; grid-template-columns: 1.15fr 1.6fr 1.05fr 1fr; gap: 26px; font-size: 13.5px">'
    '<div><div style="font-weight: 800; margin-bottom: 6px">Why this price?</div><div style="line-height: 1.45">Last paid $31.50 on Aug 28, above customer price $30.95. +$5.50 GP vs customer price.</div>'
    '<div style="margin-top: 8px; font-size: 12.5px; color: ' + MUT + '; line-height: 1.4">Brandi\'s 20% Fasteners floor. Last paid $31.50 on Aug 28.</div></div>'
    '<div><div style="font-weight: 800; margin-bottom: 6px">Price options</div>' + th(('1.1fr 0.9fr 0.9fr 0.9fr', ('Basis', 'Price', 'Margin', ''))) + opt_row('Customer', '$30.95', '30.9%', 'use') + opt_row('List', '$38.95', '45.1%', 'use') + opt_row('Last paid', '$31.50', '32.1%', 'current', True) + '</div>'
    '<div><div style="font-weight: 800; margin-bottom: 6px">Stock by branch</div>' + th(('1fr 1fr 1fr', ('Branch', 'On hand', 'On order'))) + stock_row('SLC', '64', '-', True) + stock_row('Ogden', '22', '-') + stock_row('Provo', '8', '-') + '</div>'
    '<div><div style="font-weight: 800; margin-bottom: 6px">What Dana asked for</div><div style="line-height: 1.45">"1/2 in grade 8 hex bolts, 10 boxes"</div></div></div>')

def pm_row(label, right, bg='transparent', sel=False, sub='', pill=''):
    left = ('<div><div style="display: flex; align-items: center; gap: 8px"><span style="font-weight: 800">%s</span>%s</div>%s</div>' % (label, ('<span style="font-size: 10.5px; font-weight: 800; letter-spacing: 0.05em; color: #1F6E55; background: #D6EFE5; padding: 2px 8px; border-radius: 5px">%s</span>' % pill) if pill else '', ('<div style="font-size: 12.5px; color: %s; margin-top: 2px">%s</div>' % (MUT, sub)) if sub else '')) if sel else ('<span style="font-weight: 500">%s</span>' % label)
    return '<div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; background: %s; border-left: 4px solid %s; font-variant-numeric: tabular-nums"><span style="display: contents">%s</span><span style="font-weight: %d; color: %s">%s</span></div>' % (bg, ACC if sel else 'transparent', left, 800 if sel else 500, INK if sel else MUT, right)

PRICE_MENU = ('<div style="position: absolute; top: 76px; right: 0; width: 290px; background: #fff; border: 1px solid #B9C9BF; border-radius: 12px; box-shadow: 0 18px 40px rgba(15,59,34,0.22); padding: 8px; z-index: 12; text-align: left; font-size: 14px">'
    '<div style="display: flex; justify-content: space-between; padding: 6px 12px 8px; color: ' + MUT + '; font-weight: 600"><span>Last paid</span><span style="font-weight: 800">-</span></div>'
    + pm_row('Customer', '$30.95', '#EEF3EF') + '<div style="height: 4px"></div>' + pm_row('List', '$38.95') + '<div style="height: 4px"></div>'
    + pm_row('Last paid', '$31.50', '#fff', True, 'Paid Aug 28', "QUERENT'S PICK") + '<div style="height: 4px"></div>' + pm_row('Custom', 'Type a price') + '</div>')

V = [
    ('QEBase.dc.html', 'Quote editor', {}, False),
    ('QE1.dc.html', 'E1 Approve and send', {'ROOT': SEND_DIALOG}, False),
    ('QE2.dc.html', 'E2 Export', {'EXPORT': EXPORT_MENU}, False),
    ('QE3.dc.html', 'E3 More actions', {'MORE': MORE_MENU}, False),
    ('QE4.dc.html', 'E4 Quote details', {'DETAILS': DETAILS_BODY}, False),
    ('QE5.dc.html', 'E5 Suggested by Querent', {'SUGG_OPEN': True}, False),
    ('QE6.dc.html', 'E6 Customer chat', {'ROOT': CHAT}, False),
    ('QE7.dc.html', 'E7 Show cost and stock', {}, True),
    ('QE8.dc.html', 'E8 Add item', {'ADDROW': ADD_OPEN}, False),
    ('QE9.dc.html', 'E9 Line details', {'ROW1': ROW_DETAILS}, False),
    ('QE10.dc.html', 'E10 Price source', {'PRICE1': PRICE_MENU}, False),
    ('QE11.dc.html', 'E11 Draft saved', {'ROOT': TOAST}, False),
]
for f, t, tok, cost in V:
    wr(f, build(t, tok, cost))

# ---------- canvas ----------
cj = json.load(open(P + "\\canvas.json", encoding="utf-8"))
def put(f, title, x, y):
    cj['boards'][f] = {'expand': 'fill', 'h': 900, 'w': 1440, 'x': x, 'y': y, 'title': title, 'page': 'quote'}
    if f not in cj['order']:
        cj['order'].append(f)
put('QEBase.dc.html', 'Quote editor', 0, 5900)
for i, (f, t, tok, cost) in enumerate(V[1:]):
    put(f, t, 1760 + 1520 * (i % 5), 5900 + 1020 * (i // 5))
cj['notes']['qe1'] = {'kind': 'title1', 'maxW': 1440, 'text': 'Quote editing', 'x': 0, 'y': 5600, 'page': 'quote'}
cj['notes']['qe2'] = {'text': 'Each frame to the right is one button on the quote editing page, opened.', 'x': 1760, 'y': 5600, 'w': 520, 'page': 'quote'}
json.dump(cj, open(P + "\\canvas.json", "w", encoding="utf-8", newline="\n"), indent=2, ensure_ascii=False)
print(len(V), "files")
