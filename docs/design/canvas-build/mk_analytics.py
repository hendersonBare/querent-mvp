import json
_o = open(r"mk_orders.py", encoding="utf-8").read()
exec(_o[:_o.index("wr('ORBase.dc.html'")])   # helpers + HEAD_HTML + ICONS + kv + card + check + fld + lab

GREY = '#A9B3AE'
INFO = '<span style="width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid #8DA195; color: #6A7F73; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex: none">i</span>'

def apage(title, body, offset=0):
    s = HEAD_HTML
    if offset:
        s = s.replace('position: relative; min-height: 900px;', 'position: relative; height: 900px; overflow: hidden;')
        s = s.replace('<main style="flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 24px 32px 32px">', '<main style="flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 24px 32px 32px; transform: translateY(-%dpx)">' % offset)
    for k, v in [('@@TITLE@@', title), ('@@CANVAS@@', CANVAS), ('@@INK@@', INK), ('@@RAIL@@', rail(4)), ('@@BODY@@', body)]:
        s = s.replace(k, v)
    return s

def panel(title, side, inner, extra=''):
    return ('<section style="background: #fff; border-radius: 14px; overflow: hidden"><div style="display: flex; align-items: center; gap: 10px; padding: 12px 20px; background: %s; color: #fff"><span style="font-weight: 800">%s</span>%s%s</div>%s</section>' % (HEAD, title, ('<span style="color: #CFE6D6; font-size: 13px">%s</span>' % side) if side else '', extra, inner))

def kpi(label, val, unit, sub, extra='', green=False):
    return ('<div style="flex: 1 1 200px; padding: 18px 20px; border-right: 1px solid #E3EAE5"><div style="display: flex; justify-content: space-between; align-items: center"><span style="font-weight: 700">%s</span>%s</div>'
            '<div style="margin-top: 12px; display: flex; align-items: baseline; gap: 6px"><span style="font-size: 34px; font-weight: 800; letter-spacing: -0.03em; color: %s">%s</span><span style="color: %s; font-weight: 600">%s</span></div>'
            '<div style="color: %s; margin-top: 4px; font-size: 13px">%s</div>%s</div>' % (label, INFO, ACC if green else INK, val, MUT, unit, MUT, sub, extra))

KPIS = ('<section style="background: #fff; border-radius: 14px; overflow: hidden; display: flex; flex-wrap: wrap">'
        + kpi('Median time to send', '2 h', '', 'From request to first send, 47 quotes')
        + kpi('Win rate', '73%', '', '29 won, 11 lost, 11 open')
        + kpi('Quoted vs accepted', '$47,016', 'quoted', '$31,059 accepted, 66%', '<div style="height: 8px; border-radius: 4px; background: #E4EAE5; margin-top: 10px"><div style="width: 66%%; height: 8px; border-radius: 4px; background: %s"></div></div>' % ACC)
        + kpi('Hours saved', '15.7', 'hours', '20 min for each of 47 quotes sent')
        + kpi('Extra GP Querent found', '+$10.20', '', '2 lines you kept, on 2 accepted quotes', '', True) + '</section>')

WEEKS = [('Apr 20', 1, 0), ('Apr 27', 0, 1), ('May 4', 1, 0), ('May 11', 0, 0), ('May 18', 1, 0), ('May 25', 0, 0), ('Jun 1', 0, 0), ('Jun 8', 0, 0), ('Jun 15', 1, 0), ('Jun 22', 0, 0), ('Jun 29', 1, 0), ('Jul 6', 0, 0), ('Jul 13', 1, 0),
         ('Jul 20', 0, 1), ('Jul 27', 1, 0), ('Aug 3', 2, 0), ('Aug 10', 1, 0), ('Aug 17', 1, 0), ('Aug 24', 2, 0), ('Aug 31', 1, 1), ('Sep 7', 2, 0), ('Sep 14', 1, 3), ('Sep 21', 3, 1), ('Sep 28', 2, 1), ('Oct 5', 0, 11)]
LABEL_AT = {0: 'Apr 20', 4: 'May 18', 8: 'Jun 15', 12: 'Jul 13', 16: 'Aug 10', 20: 'Sep 7', 24: 'Oct 5'}

def chart():
    U = 14.6
    grid = ''.join('<div style="position: absolute; left: 36px; right: 0; bottom: %dpx; border-top: 1px solid #E3EAE5"></div><div style="position: absolute; left: 0; bottom: %dpx; font-size: 12px; color: %s; transform: translateY(8px)">%d</div>' % (y * U + 24, y * U + 24, MUT, y) for y in (0, 5, 10, 15))
    bars = ''.join('<div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center"><div style="width: 62%%; max-width: 30px; display: flex; flex-direction: column; justify-content: flex-end"><div style="height: %.1fpx; background: %s; border-radius: 3px 3px 0 0"></div><div style="height: %.1fpx; background: %s"></div></div></div>' % (l * U, GREY, w * U, ACC) for _, w, l in WEEKS)
    labels = ''.join('<div style="flex: 1; text-align: center; font-size: 12px; color: %s; white-space: nowrap; overflow: visible; height: 20px">%s</div>' % (MUT, LABEL_AT.get(i, '')) for i in range(len(WEEKS)))
    return ('<div style="position: relative; height: %dpx; margin-top: 8px">%s<div style="position: absolute; left: 36px; right: 0; bottom: 24px; top: 0; display: flex; gap: 6px; align-items: flex-end">%s</div>'
            '<div style="position: absolute; left: 36px; right: 0; bottom: 0; display: flex; gap: 6px">%s</div></div>' % (15 * U + 36, grid, bars, labels))

def weekly_table():
    rows = [('Oct 5', 11, 0, 0, 11), ('Sep 28', 3, 2, 1, 0), ('Sep 21', 4, 3, 1, 0), ('Sep 14', 4, 1, 3, 0), ('Sep 7', 2, 2, 0, 0), ('Aug 31', 2, 1, 1, 0), ('Aug 24', 2, 2, 0, 0), ('Aug 17', 1, 1, 0, 0), ('Aug 10', 1, 1, 0, 0)]
    g = '1.4fr 1fr 1fr 1fr 1fr'
    head = '<div style="display: grid; grid-template-columns: %s; gap: 16px; padding: 10px 18px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Week of</div><div style="text-align: right">:: Requested</div><div style="text-align: right">:: Won</div><div style="text-align: right">:: Lost</div><div style="text-align: right">:: Open</div></div>' % g
    body = ''.join('<div style="display: grid; grid-template-columns: %s; gap: 16px; padding: 10px 18px; border-top: 1px solid #E3EAE5; font-variant-numeric: tabular-nums"><div style="font-weight: 800">%s</div><div style="text-align: right">%d</div><div style="text-align: right">%d</div><div style="text-align: right">%d</div><div style="text-align: right">%d</div></div>' % (g, a, b, c, d, e) for a, b, c, d, e in rows)
    return '<div style="margin-top: 10px; border: 1px solid #E3EAE5; border-radius: 10px; overflow: hidden">' + head + body + '<div style="padding: 10px 18px; border-top: 1px solid #E3EAE5; text-align: center"><button style="height: 34px; padding: 0 18px; border: 1px dashed #8FA699; background: transparent; border-radius: 9px; color: #2F4A3A; font-weight: 700">Show 17 more weeks</button></div></div>'

def weekly(show_table):
    legend = ('<span style="display: flex; align-items: center; gap: 6px; font-size: 13px"><span style="width: 12px; height: 12px; border-radius: 3px; background: %s"></span>Won</span><span style="display: flex; align-items: center; gap: 6px; font-size: 13px"><span style="width: 12px; height: 12px; border-radius: 3px; background: %s"></span>Lost or still open</span>'
              '<button style="height: 34px; padding: 0 14px; border: 1px solid #5E8C72; background: transparent; color: #fff; border-radius: 9px; font-weight: 700">%s</button>') % (ACC if False else '#7FDBA0', GREY, 'Show chart' if show_table else 'Show table')
    inner = '<div style="padding: 16px 20px 18px"><div style="color: %s">41 quotes requested in the last 26 weeks, 22 won so far.</div>%s</div>' % (MUT, weekly_table() if show_table else chart())
    return panel('Quotes and wins by week', '', inner, '<span style="margin-left: auto; display: flex; align-items: center; gap: 16px">' + legend + '</span>')

def bar_row(name, pct, floor, warn=''):
    return ('<div style="margin-top: 14px"><div style="display: flex; justify-content: space-between; align-items: baseline"><span>%s</span><span><b style="font-variant-numeric: tabular-nums">%.1f%%</b> <span style="color: %s; font-size: 13px">floor %s</span></span></div>'
            '<div style="position: relative; height: 10px; border-radius: 5px; background: #E4EAE5; margin-top: 6px"><div style="width: %.1f%%; height: 10px; border-radius: 5px; background: %s"></div><div style="position: absolute; left: %.1f%%; top: -3px; width: 2px; height: 16px; background: %s"></div></div>%s</div>' % (name, pct, MUT, floor, pct * 2, ACC, float(floor.strip('%')) * 2, INK, ('<div style="color: #C92A1C; font-size: 12.5px; font-weight: 700; margin-top: 6px">%s</div>' % warn) if warn else ''))

margin_card = panel('Average margin vs floor', '', '<div style="padding: 16px 20px 18px"><div><b>34.5%</b> average margin against a 20.7% average floor. 3 lines of 120 under the floor.</div>'
    + bar_row('Fasteners', 35.0, '20%') + bar_row('Abrasives and Cutting', 36.0, '21.1%') + bar_row('Safety and PPE', 32.5, '22.2%', '3 lines under the 22.2% floor') + bar_row('Material Handling and Tie-downs', 33.9, '20%') + bar_row('Tools', 35.6, '18%') + bar_row('Janitorial and MRO', 34.7, '20%')
    + '<div style="margin-top: 16px; display: flex; gap: 18px; font-size: 12.5px; color: %s"><span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 8px; border-radius: 4px; background: %s"></span>Average margin</span><span style="display: flex; align-items: center; gap: 6px"><span style="width: 2px; height: 14px; background: %s"></span>Your floor. Bars run from 0 to 50%%.</span></div></div>' % (MUT, ACC, INK))

def item_bar(sku, name, q, qty):
    return ('<div style="margin-top: 14px"><div><span style="font-family: %s; font-weight: 700; font-size: 12.5px">%s</span> <span style="color: %s">%s</span></div><div style="display: flex; align-items: center; gap: 12px; margin-top: 6px"><div style="flex: 1; height: 10px; border-radius: 5px; background: #E4EAE5"><div style="width: %.1f%%; height: 10px; border-radius: 5px; background: %s"></div></div><span style="white-space: nowrap; font-size: 13px; font-variant-numeric: tabular-nums"><b>%d quotes</b>, qty %d</span></div></div>' % (MONO, sku, MUT, name, qty / 229.0 * 100, ACC, q, qty))

items_card = panel('Top requested items', '', '<div style="padding: 6px 20px 20px">' + item_bar('HCS-12-13-2G8', 'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc', 11, 229) + item_bar('CW-45-045-T1', 'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1', 10, 152) + item_bar('HN-12-13-G8', 'Hex nut 1/2-13, Grade 8, yellow zinc', 9, 135) + item_bar('FW-12-G8', 'Flat washer 1/2 in, Grade 8, yellow zinc', 8, 126) + item_bar('FD-45-60Z', 'Flap disc 4.5 in, 60 grit zirconia', 8, 70) + '</div>')

def qa(label, n):
    return '<div style="display: flex; justify-content: space-between; padding: 12px 0; border-top: 1px solid #E3EAE5"><span>%s</span><span style="font-weight: 800">%s</span></div>' % (label, n)
no_rep = panel('Questions answered without a rep', '', '<div style="padding: 20px; display: grid; grid-template-columns: 1fr 1.4fr; gap: 40px; align-items: center"><div><div style="display: flex; align-items: baseline; gap: 8px"><span style="font-size: 44px; font-weight: 800; letter-spacing: -0.03em">40</span><span style="color: %s; font-weight: 600">of 40</span></div><div style="color: %s">100%% answered without a rep</div><div style="height: 8px; border-radius: 4px; background: %s; margin-top: 12px"></div></div><div>%s%s%s</div></div>' % (MUT, MUT, ACC, qa('Answered with live data', '37'), qa('Answered, nothing matched', '3'), qa('Needed a rep', '0')))

def small_stat(icon_d, label, val, unit, sub, green=False):
    return ('<div style="flex: 1 1 240px; background: #fff; border-radius: 14px; padding: 18px 20px"><div style="display: flex; align-items: center; gap: 8px; color: %s; font-weight: 600">%s%s%s</div><div style="margin-top: 14px; display: flex; align-items: baseline; gap: 6px"><span style="font-size: 38px; font-weight: 800; letter-spacing: -0.03em; color: %s">%s</span><span style="color: %s; font-weight: 700">%s</span></div><div style="color: %s; font-size: 13px; margin-top: 4px">%s</div></div>'
            % (MUT, svg(icon_d, 18, 1.8), label, INFO, ACC if green else INK, val, ACC if green else MUT, unit, MUT, sub))

def cat_row(cat, n):
    return '<div style="display: grid; grid-template-columns: 1.6fr 0.8fr 1.4fr; gap: 16px; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5"><div style="font-weight: 600">%s</div><div><span style="background: #E4EAE5; padding: 2px 10px; border-radius: 6px; font-weight: 700">%s</span></div><div style="color: %s; font-weight: 600">Brandi Gallegos</div></div>' % (cat, n, MUT)
cats = panel('Queries by category', 'Where customers find their answers.', '<div style="display: grid; grid-template-columns: 1.6fr 0.8fr 1.4fr; gap: 16px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Category</div><div>:: Questions</div><div>:: Assigned rep</div></div>'
              + cat_row('Items and stock', 16) + cat_row('Pricing', 10) + cat_row('Orders and quotes', 11) + cat_row('Account', 10) + '<div style="padding: 12px 20px; border-top: 1px solid #E3EAE5; color: %s; font-size: 12.5px">Combined questions count in each relevant category and once in the total.</div>' % MUT,
              '<span style="margin-left: auto; font-size: 11.5px; font-weight: 800; letter-spacing: 0.06em; background: rgba(255,255,255,0.16); padding: 3px 10px; border-radius: 6px">ALL TIME</span>')
promo = ('<div style="flex: 0 0 340px; max-width: 100%; box-sizing: border-box; background: ' + HEAD + '; color: #fff; border-radius: 14px; padding: 24px"><div style="font-size: 24px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15">Answers for customers.<br>Time for your team.</div>'
         '<div style="margin-top: 14px; color: #CFE6D6; line-height: 1.5">Let customers find the information they need, while your team focuses on the work that needs a person.</div>'
         '<div style="margin-top: 20px; border-top: 1px solid #3A6A55; padding-top: 16px"><span style="font-size: 26px; font-weight: 800; color: #7FDBA0">4 of 4</span><div style="color: #CFE6D6; font-size: 13px">categories fully enabled</div></div>'
         '<div style="margin-top: 16px; font-weight: 800; color: #7FDBA0">Manage customer access</div></div>')
query = ('<div style="margin-top: 8px"><div style="font-size: 24px; font-weight: 800; letter-spacing: -0.02em">Query analytics</div><div style="color: ' + MUT + '; margin-top: 2px">Customer questions Querent answered in chat, by information category.</div></div>'
         '<div style="display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start"><div style="flex: 1 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 16px"><div style="display: flex; flex-wrap: wrap; gap: 16px">'
         + small_stat('M4 5h16v11H9l-5 4z', 'Total queries', '40', '', 'Customer questions, all time') + small_stat('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 8v4l3 2', 'Estimated time saved', '5.0', 'hrs', 'Based on typical lookup times', True)
         + '</div>' + cats + '</div>' + promo + '</div>')

def scope_panel():
    seg = ('<div style="display: flex; background: #EEF3EF; border-radius: 9px; padding: 3px"><span style="flex: 1; text-align: center; padding: 7px; font-weight: 600; color: %s">Whole organization</span><span style="flex: 1; text-align: center; padding: 7px; border-radius: 7px; background: %s; color: #fff; font-weight: 700">Rep</span><span style="flex: 1; text-align: center; padding: 7px; font-weight: 600; color: %s">Team</span><span style="flex: 1; text-align: center; padding: 7px; font-weight: 600; color: %s">Customer</span></div>') % (MUT, ACC, MUT, MUT)
    return ('<div style="position: absolute; top: 48px; left: 0; width: 420px; box-sizing: border-box; background: #fff; border: 1px solid #B9C9BF; border-radius: 14px; box-shadow: 0 20px 44px rgba(15,59,34,0.24); z-index: 6; padding: 18px; color: %s; font-size: 14px">'
            '<div style="font-weight: 800; font-size: 16px; margin-bottom: 2px">Filter analytics</div><div style="color: %s; font-size: 13px">Pick any mix of reps and teams, then break the numbers down.</div>' % (INK, MUT)
            + lab('Reps') + '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 8px">' + check('Brandi Gallegos', True) + check('Eli Porter', True) + check('Nora Chen', False) + '</div>'
            + lab('Teams') + '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px">' + check('Inside Sales', False) + check('Field Sales', False) + '</div>'
            + '<div style="height: 6px"></div>' + fld('Customer', 'Any customer')
            + lab('Break the numbers down by') + seg
            + '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px"><span style="font-weight: 700; color: %s">Clear all</span><span style="height: 38px; padding: 0 22px; border-radius: 9px; background: %s; color: #fff; font-weight: 700; display: flex; align-items: center">Apply filters</span></div></div>' % (MUT, ACC))

def page_body(filt=False, show_table=False):
    fb = '2px solid %s' % ACC if filt else '1px solid %s' % LINE
    head = ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px"><div><h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.035em">Analytics</h1><div style="color: ' + MUT + '; margin-top: 2px">Quotes and customer questions for the whole organization</div></div>'
            '<div style="position: relative"><button style="height: 40px; padding: 0 14px; border: ' + fb + '; background: #fff; border-radius: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px">' + svg('M3 5h18l-7 8v6l-4-2v-4L3 5z', 15, 2) + 'Filter</button>' + (scope_panel() if filt else '') + '</div>' + ICONS + '</div>')
    return head + '<div style="display: flex; flex-direction: column; gap: 16px; margin-top: 22px">' + KPIS + weekly(show_table) + '<div style="display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start"><div style="flex: 1 1 520px; min-width: 0">' + margin_card + '</div><div style="flex: 1 1 420px; min-width: 0">' + items_card + '</div></div>' + no_rep + query + '</div>'

wr('ANBase.dc.html', apage('Analytics', page_body()))
wr('AN1.dc.html', apage('Analytics margin and items', page_body(), 700))
wr('AN2.dc.html', apage('Analytics query analytics', page_body(), 1500))
wr('AN3.dc.html', apage('Analytics weekly table', page_body(False, True)))
wr('AN4.dc.html', apage('Analytics filter', page_body(True)))

# the Add to quote dialog, re-centered
_s = open(r"mk_stock.py", encoding="utf-8").read()

# ---------- canvas ----------
cj = json.load(open(P + "\\canvas.json", encoding="utf-8"))
def put(f, title, x, y):
    cj['boards'][f] = {'expand': 'fill', 'h': 900, 'w': 1440, 'x': x, 'y': y, 'title': title, 'page': 'quote'}
    if f not in cj['order']:
        cj['order'].append(f)
put('ANBase.dc.html', 'Analytics', 0, 13800)
put('AN1.dc.html', 'Scrolled: margin and items', 1520, 13800)
put('AN2.dc.html', 'Scrolled: query analytics', 3040, 13800)
put('AN3.dc.html', 'Show table', 4560, 13800)
put('AN4.dc.html', 'Filter open', 6080, 13800)
cj['notes']['an1'] = {'kind': 'title1', 'maxW': 7400, 'size': 200, 'w': 240, 'text': 'Analytics', 'x': -1474, 'y': 14037, 'page': 'quote'}
cj['notes']['an2'] = {'text': 'Manager view: whole organization by default. The Filter button narrows it to any mix of reps and teams and breaks the numbers down by rep, team or customer. The two scrolled frames show the rest of the page.', 'x': 1520, 'y': 13500, 'w': 560, 'page': 'quote'}
json.dump(cj, open(P + "\\canvas.json", "w", encoding="utf-8", newline="\n"), indent=2, ensure_ascii=False)
print('ok', len(cj['boards']))
