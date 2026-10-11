import json
_o = open(r"mk_orders.py", encoding="utf-8").read()
exec(_o[:_o.index("wr('ORBase.dc.html'")])   # helpers: rail, check, fld, lab, kv, card, ICONS, HEAD_HTML, svg, wr, P ...

def spg(title, body, overlay='', offset=0):
    s = HEAD_HTML
    if offset:
        s = s.replace('position: relative; min-height: 900px;', 'position: relative; height: 900px; overflow: hidden;')
        s = s.replace('<main style="flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 24px 32px 32px">', '<main style="flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 24px 32px 32px; transform: translateY(-%dpx)">' % offset)
    for k, v in [('@@TITLE@@', title), ('@@CANVAS@@', CANVAS), ('@@INK@@', INK), ('@@RAIL@@', rail(6)), ('@@BODY@@', body)]:
        s = s.replace(k, v)
    if overlay:
        s = s.replace('</main>\n</div>\n</x-dc>', '</main>\n' + overlay + '\n</div>\n</x-dc>')
    return s

SCRIM = '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(15,35,25,0.45); z-index: 20"></div>'
TABS = ['Customer access', 'Margin floors', 'Pricing and delivery', 'Aging', 'Data sources']

def switch(on=True):
    return '<span style="position: relative; width: 40px; height: 22px; border-radius: 999px; background: %s; display: block; flex: none"><span style="position: absolute; top: 3px; %s; width: 16px; height: 16px; border-radius: 50%%; background: #fff"></span></span>' % (ACC if on else '#B9C6BE', 'right: 3px' if on else 'left: 3px')

def head(active, picker=False):
    pk = ('<div style="width: 300px; max-width: 100%; box-sizing: border-box; height: 42px; border-radius: 10px; background: #fff; border: 1px solid ' + LINE + '; display: flex; align-items: center; gap: 10px; padding: 0 14px">' + svg('M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M20 20l-4-4', 17, 2) + '<span style="font-weight: 600">All customers</span></div>') if picker else ''
    top = '<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px"><h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.035em">Settings</h1>' + pk + ICONS + '</div>'
    tabs = '<div style="display: flex; flex-wrap: wrap; gap: 6px 26px; margin-top: 18px; border-bottom: 1px solid #B9C9BF">' + ''.join('<span style="padding: 10px 2px; font-weight: %d; color: %s; border-bottom: 3px solid %s; margin-bottom: -1px">%s</span>' % (800 if t == active else 600, INK if t == active else MUT, ACC if t == active else 'transparent', t) for t in TABS) + '</div>'
    return top + tabs

def stack(*parts):
    return '<div style="display: flex; flex-direction: column; gap: 16px; margin-top: 20px">' + ''.join(parts) + '</div>'

def sec(title, sub, inner, extra=''):
    return ('<section style="background: #fff; border-radius: 14px; overflow: hidden"><div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 12px 20px; background: %s; color: #fff"><span style="font-weight: 800; font-size: 15.5px; flex: none">%s</span>%s%s</div>%s</section>' % (HEAD, title, ('<span style="color: #CFE6D6; font-size: 13px; flex: 1 1 260px; min-width: 0; line-height: 1.35">%s</span>' % sub) if sub else '', extra, inner))

def note(t):
    return '<div style="padding: 12px 20px; border-top: 1px solid #E3EAE5; color: %s; font-size: 13px">%s</div>' % (MUT, t)

def input_box(v, w=100, prefix='', suffix=''):
    return ('<div style="display: flex; align-items: center; gap: 8px">%s<div style="width: %dpx; height: 38px; box-sizing: border-box; border: 1px solid %s; border-radius: 8px; background: #fff; display: flex; align-items: center; justify-content: flex-end; padding: 0 12px; font-weight: 700; font-variant-numeric: tabular-nums">%s</div>%s</div>'
            % (('<span style="color: %s">%s</span>' % (MUT, prefix)) if prefix else '', w, LINE, v, ('<span style="color: %s">%s</span>' % (MUT, suffix)) if suffix else ''))

def row(label, right, sub=''):
    return '<div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 20px; border-top: 1px solid #E3EAE5"><div><div style="font-weight: 600">%s</div>%s</div><div>%s</div></div>' % (label, ('<div style="font-size: 12.5px; color: %s; margin-top: 2px">%s</div>' % (MUT, sub)) if sub else '', right)

def savebtn(t, primary=True):
    if primary:
        return '<span style="height: 38px; padding: 0 20px; border-radius: 9px; background: %s; color: #fff; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap; flex: none">%s</span>' % (ACC, t)
    return '<span style="height: 38px; padding: 0 18px; border-radius: 9px; border: 1px solid %s; background: #fff; font-weight: 700; display: inline-flex; align-items: center; white-space: nowrap; flex: none">%s</span>' % (LINE, t)

def kvv(k, v):
    return '<div style="display: flex; justify-content: space-between; gap: 20px; padding: 11px 20px; border-top: 1px solid #E3EAE5"><span style="color: %s">%s</span><span style="font-weight: 600; text-align: right">%s</span></div>' % (MUT, k, v)

# ---------- Customer access ----------
def access():
    items = [('Items and stock', 'Finding items, stock by branch, and asking for a quote in chat'), ('Pricing', 'Their prices for items'), ('Orders and quotes', 'Order history, order status and quotes'), ('Account', 'Terms, credit limit, balances and who their rep is')]
    rows = ''.join('<div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-top: 1px solid #E3EAE5"><div><div style="font-weight: 800">%s</div><div style="font-size: 13px; color: %s; margin-top: 2px">%s</div></div><div style="display: flex; align-items: center; gap: 12px"><span style="color: %s">Querent answers</span>%s</div></div>' % (n, MUT, d, MUT, switch(True)) for n, d in items)
    return head('Customer access', True) + stack(sec('Customer access', 'A change here applies to all customers. Pick one above to set theirs alone.', rows))

# ---------- Margin floors ----------
CATS = [('Fasteners', 20.0), ('Abrasives and Cutting', 25.0), ('Safety and PPE', 30.0), ('Material Handling and Tie-downs', 20.0), ('Tools', 18.0), ('Janitorial and MRO', 20.0)]

def slider(v):
    return '<div style="position: relative; height: 10px; border-radius: 5px; background: #E4EAE5"><div style="width: %.1f%%; height: 10px; border-radius: 5px; background: #BFE0CC"></div><div style="position: absolute; left: %.1f%%; top: -4px; width: 4px; height: 18px; border-radius: 2px; background: %s; margin-left: -2px"></div></div>' % (v * 2, v * 2, ACC)

def floors_card():
    hdr = '<div style="display: grid; grid-template-columns: 1.4fr 3fr 130px; gap: 24px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Category</div><div style="display: flex; justify-content: space-between"><span>0%</span><span>25%</span><span>50%</span></div><div>:: Floor</div></div>'
    rows = ''.join('<div style="display: grid; grid-template-columns: 1.4fr 3fr 130px; gap: 24px; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5"><div style="font-weight: 700">%s</div>%s%s</div>' % (n, slider(v), input_box('%.1f' % v, 80, '', '%')) for n, v in CATS)
    return sec('Organization margin floors', 'Hard stops. Reps cannot set a floor below these.', hdr + rows, '<span style="margin-left: auto; flex: none">' + savebtn('Save floors') + '</span>')

REPS_FL = {'Brandi Gallegos': (30.0, 25.0, 30.0, 20.0, 18.0, 20.0), 'Eli Porter': (22.0, 25.0, 30.0, 20.0, 18.0, 21.0), 'Mara Jensen': (20.0, 26.0, 32.0, 20.0, 18.0, 20.0), 'Nora Chen': (20.0, 25.0, 30.0, 22.0, 19.0, 20.0)}

def rep_review(open_list, rep='Eli Porter'):
    sel = '<div style="position: relative; width: 340px"><div style="height: 42px; box-sizing: border-box; border: 2px solid %s; border-radius: 10px; background: #fff; display: flex; align-items: center; gap: 10px; padding: 0 14px">%s<span style="font-weight: 700">%s</span></div>%s</div>' % (ACC, svg('M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M20 20l-4-4', 16, 2), rep,
        ('<div style="position: absolute; top: 48px; left: 0; right: 0; background: #fff; border: 1px solid #B9C9BF; border-radius: 12px; box-shadow: 0 18px 40px rgba(15,59,34,0.22); padding: 5px; z-index: 12">' + ''.join('<div style="padding: 9px 12px; border-radius: 8px; font-weight: 600; background: %s">%s</div>' % ('#E3F1E8' if r == rep else 'transparent', r) for r in REPS_FL) + '<div style="padding: 6px 12px 2px; font-size: 11.5px; color: %s">Type to search. Managers are not listed.</div></div>' % MUT) if open_list else '')
    g = '1.6fr 1fr 1fr'
    hdr = '<div style="display: grid; grid-template-columns: %s; gap: 16px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Category</div><div style="text-align: right">:: %s</div><div style="text-align: right">:: Organization floor</div></div>' % (g, rep.split()[0])
    rows = ''.join('<div style="display: grid; grid-template-columns: %s; gap: 16px; padding: 13px 20px; border-top: 1px solid #E3EAE5"><div style="font-weight: 600">%s</div><div style="text-align: right; font-weight: 700; font-variant-numeric: tabular-nums">%.1f%%</div><div style="text-align: right; color: %s; font-variant-numeric: tabular-nums">%.1f%%</div></div>' % (g, n, REPS_FL[rep][i], MUT, v) for i, (n, v) in enumerate(CATS))
    return '<section style="background: #fff; border-radius: 14px; overflow: visible"><div style="display: flex; align-items: center; gap: 16px; padding: 12px 20px; background: %s; color: #fff; border-radius: 14px 14px 0 0"><span style="font-weight: 800; font-size: 15.5px">Rep margins</span><span style="color: #CFE6D6; font-size: 13px">Read-only. Each rep sets their own above your floors.</span></div><div style="padding: 16px 20px">%s</div>%s%s</section>' % (HEAD, sel, hdr, rows)

def margins(open_list=False):
    return head('Margin floors') + stack(floors_card(), rep_review(open_list))

# ---------- Pricing and delivery ----------
def pricing():
    return sec('Pricing', 'How Querent suggests a price for each quote line.',
               row('Scarcity uplift', '<div style="display: flex; align-items: center; gap: 12px"><span style="color: %s">Off (default)</span>%s</div>' % (MUT, switch(False)), 'When one branch can fill a line, or has under 1.5x the quantity on hand, suggest the customer price + 5%, never above list.')
               + row('Broken case', '<span style="color: %s">Always on</span>' % MUT, "When a line's quantity is under a full case, suggest the customer price + 10%, never above list. A higher last-paid price still wins.")
               + note('Applies to quotes Querent prices from now on. Drafts already priced keep their suggestions.'))

def delivery_rates():
    rows = row('Base fee', input_box('25', 100, '$')) + row('Per road mile', input_box('2.5', 100, '$')) + row('Minimum charge', input_box('35', 100, '$')) + row('Free delivery at items total of', input_box('1500', 100, '$')) + row('Delivery radius', input_box('75', 100, '', 'miles; farther is call for freight')) + row('Road miles per straight-line mile', input_box('1.25', 100, '', 'x straight-line miles'))
    ex = '<div style="padding: 12px 20px; border-top: 1px solid #E3EAE5; font-size: 13px; color: %s; line-height: 1.5">Minimum $35.00. Free with an items total of $1,500.00 or more, within 75 road miles. Example, 15.0 miles from SLC: <span style="font-family: %s">$25.00 + $2.50/mi x 15.0 mi = $62.50</span>. Sent quotes keep the freight they went out with.</div>' % (MUT, MONO)
    return sec('Delivery rates', 'Draft quotes use new rates from their next change.', rows + ex, '<span style="margin-left: auto; flex: none">' + savebtn('Save rates') + '</span>')

def pricing_page():
    return head('Pricing and delivery') + stack('<div style="display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start"><div style="flex: 1 1 420px; min-width: 0">' + pricing() + '</div><div style="flex: 1 1 460px; min-width: 0">' + delivery_rates() + '</div></div>', free_delivery(), '<div style="display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start"><div style="flex: 1 1 420px; min-width: 0">' + recovery() + '</div><div style="flex: 1 1 460px; min-width: 0">' + cost_model() + '</div></div>')

def free_delivery():
    steps = [('Step 1 of 3', 'From day 0', 'Oct 10, 2026', '0.5%', True), ('Step 2 of 3', 'From day 30', 'Nov 9, 2026', '1.1%', False), ('Step 3 of 3', 'From day 60', 'Dec 9, 2026', '1.6%', False)]
    g = '1.5fr 1.5fr 0.5fr'
    hdr = '<div style="display: grid; grid-template-columns: %s; gap: 16px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Step</div><div>:: Starts</div><div style="text-align: right">:: Rate</div></div>' % g
    rows = ''.join('<div style="display: grid; grid-template-columns: %s; gap: 16px; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5; background: %s"><div style="font-weight: 700">%s%s</div><div><div style="font-weight: 600">%s</div><div style="font-size: 12.5px; color: %s">%s</div></div><div style="text-align: right; font-weight: 800">%s</div></div>' % (g, '#E3F1E8' if now else '#fff', s, ' <span style="font-size: 11px; font-weight: 800; background: #fff; border: 1px solid #B9C9BF; padding: 1px 8px; border-radius: 6px">NOW</span>' if now else '', a, MUT, b, r) for s, a, b, r, now in steps)
    body = (row('Free delivery pricing', '<div style="display: flex; align-items: center; gap: 12px"><span style="color: %s">On since Oct 10, 2026</span>%s</div>' % (MUT, switch(True)), 'Turning it off reprices draft quotes on their next open. Sent quotes keep their prices.')
            + '<div style="padding: 14px 20px 8px; border-top: 1px solid #E3EAE5"><div style="font-weight: 800">Ramp-in</div><div style="color: %s; margin-top: 2px">The rate steps up over 90 days in 3 steps, to 1.6%% at the last step.</div></div>%s%s' % (MUT, hdr, rows)
            + '<div style="padding: 16px 20px; border-top: 1px solid #E3EAE5; display: flex; align-items: center; justify-content: space-between; gap: 16px"><div><div style="font-weight: 800">Impact preview</div><div style="color: %s; max-width: 640px; margin-top: 2px; font-size: 13px">How many recent delivery quotes would carry recovery, and the average line price change by category at the first step and at the full rate.</div></div>%s</div>' % (MUT, savebtn('View impact preview')))
    return sec('Free delivery pricing', 'Delivery quotes show Freight $0.00. The delivery cost is recovered in item prices at the pool rate, ramped in. Contract lines and quotes under the free-delivery threshold carry none.', body)

def recovery():
    return sec('Recovery pool', 'Last 90 days of modelled delivery cost over the goods value of accepted delivery quotes. The starting rate applies until 20 are in.',
               kvv('Recovery rate', 'Pool rate 1.6% from 22 eligible quotes (starting rate 3.0%)') + kvv('Rate cap', '8.0%') + kvv('Rate in force', '0.5%, ramp step 1 of 3') + kvv('Modelled delivery cost, last 90 days', '$724.33') + kvv('Recovered in prices, last 90 days', '$1,381.78')
               + '<div style="padding: 12px 20px 2px; border-top: 1px solid #E3EAE5; font-weight: 800">Rates and ramp</div>'
               + row('Starting rate', input_box('3', 90, '', '% of goods')) + row('Rate cap', input_box('8', 90, '', '% at most')) + row('Per-line cap', input_box('8', 90, '', "% over a line's price")) + row('Ramp steps', input_box('3', 90, '', 'steps')) + row('Ramp days', input_box('90', 90, '', 'days'))
               + note('A quote freezes the rate in force when it is created. Sent quotes keep their prices.'), '<span style="margin-left: auto; flex: none">' + savebtn('Save pool settings') + '</span>')

def cost_model():
    fuel = '<div style="height: 38px; box-sizing: border-box; border: 1px solid %s; border-radius: 8px; background: #fff; display: flex; align-items: center; padding: 0 14px; font-weight: 600; min-width: 220px">Gasoline (state price)</div>' % LINE
    return sec('Delivery cost model', 'Fuel, wear, depreciation and the driver\'s time for the round trip, plus any stop time.',
               kvv('UT gasoline', '$3.40/gal, seeded price, 2 days old') + '<div style="padding: 12px 20px 2px; border-top: 1px solid #E3EAE5; font-weight: 800">Inputs</div>'
               + row('Vehicle MPG', input_box('10', 90, '', 'miles per gallon')) + row('Fuel type', fuel) + row('Manual fuel price', input_box('', 90, '$', 'per gallon; blank uses the state price')) + row('Wear per mile', input_box('0.2', 90, '$', 'per mile')) + row('Depreciation per mile', input_box('0.15', 90, '$', 'per mile'))
               + row('Driver pay per hour', input_box('25', 90, '$', 'per hour')) + row('Average speed', input_box('35', 90, '', 'mph')) + row('Stop time', input_box('0', 90, '', 'minutes per delivery'))
               + note('A quote keeps the modelled cost measured when it was created, or when its branch or ship-to changed.'), '<span style="margin-left: auto; flex: none">' + savebtn('Save cost model') + '</span>')

IMPACT = (SCRIM + '<div style="position: absolute; left: 50%; top: 150px; margin-left: -340px; width: 680px; box-sizing: border-box; background: #fff; border-radius: 16px; box-shadow: 0 28px 60px rgba(15,35,25,0.4); z-index: 30; padding: 26px 28px; color: ' + INK + '">'
          '<div style="font-size: 22px; font-weight: 800">Impact preview</div><div style="color: ' + MUT + '; margin-top: 4px">Based on the last 22 delivery quotes. Sample figures.</div>'
          '<div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 12px; padding: 10px 14px; background: #E4EAE5; border-radius: 10px; margin-top: 16px; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Category</div><div style="text-align: right">:: Quotes affected</div><div style="text-align: right">:: Step 1 (0.5%)</div><div style="text-align: right">:: Full rate (1.6%)</div></div>'
          + ''.join('<div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 12px; padding: 12px 14px; border-top: 1px solid #E3EAE5; font-variant-numeric: tabular-nums"><div style="font-weight: 700">%s</div><div style="text-align: right">%s</div><div style="text-align: right">%s</div><div style="text-align: right; font-weight: 700">%s</div></div>' % r
                    for r in [('Fasteners', '14 of 22', '+$0.12', '+$0.38'), ('Abrasives and Cutting', '11 of 22', '+$0.21', '+$0.67'), ('Safety and PPE', '9 of 22', '+$0.34', '+$1.09'), ('Material Handling and Tie-downs', '12 of 22', '+$0.18', '+$0.58'), ('Tools', '6 of 22', '+$0.15', '+$0.48'), ('Janitorial and MRO', '5 of 22', '+$0.09', '+$0.29')])
          + '<div style="color: ' + MUT + '; font-size: 12.5px; margin-top: 10px">Average change per line price.</div><div style="display: flex; justify-content: flex-end; margin-top: 18px"><span style="height: 42px; padding: 0 26px; border-radius: 10px; background: ' + ACC + '; color: #fff; font-weight: 800; display: flex; align-items: center">Close</span></div></div>')

# ---------- Aging ----------
def aging():
    g = '2.4fr 1fr 1fr'
    hdr = '<div style="display: grid; grid-template-columns: %s; gap: 24px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Status</div><div>:: Aging (amber) after</div><div>:: Overdue (red) after</div></div>' % g
    data = [('Draft ready', 'From when the quote is created.', '4', 'h', '24', 'h', '1 day'), ('Changes requested', "From the customer's change request.", '4', 'h', '24', 'h', '1 day'), ('Sent', 'From the latest send. A sent quote also turns Aging the day before it expires and Overdue on its last day.', '72', 'h', '168', 'h', '7 days')]
    rows = ''.join('<div style="display: grid; grid-template-columns: %s; gap: 24px; align-items: center; padding: 16px 20px; border-top: 1px solid #E3EAE5"><div><div style="font-weight: 800">%s</div><div style="font-size: 12.5px; color: %s; margin-top: 2px; max-width: 520px">%s</div></div><div>%s</div><div style="display: flex; align-items: center; gap: 10px">%s<span style="color: %s; font-size: 13px">%s</span></div></div>' % (g, s, MUT, d, input_box(a, 90, '', 'h' if s != 'Sent' else 'h  3 days'), input_box(o, 90, '', 'h'), MUT, days) for s, d, a, _, o, __, days in data)
    return head('Aging') + stack(sec('Aging thresholds', 'When an open quote turns Aging (amber) and Overdue (red) on the Quotes list. Whole hours, 1 to 2160 (90 days). Aging comes before Overdue.', hdr + rows, '<span style="margin-left: auto; flex: none">' + savebtn('Save thresholds') + '</span>'))

# ---------- Data sources ----------
def data_sources():
    demo = sec('Demo database', 'A local SQLite database stands in for Herrick\'s ERP in this demo.', kvv('Seeded for', 'Oct 9, 2026') + kvv('Records', '6 customers, 62 items, 23 orders, 75 quotes') + kvv('ERP records synced', 'Oct 9, 6:00 AM') + kvv('Schema migration', '<span style="font-family: %s">008_fuel_prices</span>' % MONO), '<span style="margin-left: auto; font-size: 12px; font-weight: 800; background: rgba(255,255,255,0.16); padding: 3px 10px; border-radius: 999px">Sample data</span>')
    syncs = ''.join(kvv('ERP connection refreshed', 'Oct 11, 12:%d:45 AM' % m).replace('color: %s' % MUT, 'color: %s; font-weight: 600' % INK) for m in (44, 43, 42, 41, 40))
    erp = sec('Herrick Industrial Supply ERP', 'Last sync: ERP connection refreshed, 12:44:45 AM.', '<div style="padding: 12px 20px 4px; font-weight: 800">Recent syncs</div>' + syncs, '<span style="margin-left: auto; font-size: 12px; font-weight: 800; background: #7FDBA0; color: %s; padding: 3px 12px; border-radius: 999px">Connected</span>' % DARK)
    return head('Data sources') + stack(demo, erp)

wr('S1.dc.html', spg('Settings customer access', access()))
wr('S2.dc.html', spg('Settings margin floors', margins(False)))
wr('S3.dc.html', spg('Settings review a rep', margins(True)))
wr('S4.dc.html', spg('Settings pricing and delivery', pricing_page()))
wr('S5.dc.html', spg('Settings free delivery pricing', pricing_page(), '', 560))
wr('S6.dc.html', spg('Settings recovery pool and cost model', pricing_page(), '', 1180))
wr('S7.dc.html', spg('Settings impact preview', pricing_page(), IMPACT, 560))
wr('S8.dc.html', spg('Settings aging', aging()))
wr('S9.dc.html', spg('Settings data sources', data_sources()))

# ---------- canvas ----------
cj = json.load(open(P + "\\canvas.json", encoding="utf-8"))
def put(f, title, x, y):
    cj['boards'][f] = {'expand': 'fill', 'h': 900, 'w': 1440, 'x': x, 'y': y, 'title': title, 'page': 'quote'}
    if f not in cj['order']:
        cj['order'].append(f)
row1 = [('S1.dc.html', 'Customer access'), ('S2.dc.html', 'Margin floors'), ('S3.dc.html', 'Margin floors, review a rep'), ('S8.dc.html', 'Aging'), ('S9.dc.html', 'Data sources')]
row2 = [('S4.dc.html', 'Pricing and delivery'), ('S5.dc.html', 'Pricing, free delivery'), ('S6.dc.html', 'Pricing, pool and cost model'), ('S7.dc.html', 'Impact preview')]
for i, (f, t) in enumerate(row1):
    put(f, t, 1520 * i, 17420)
for i, (f, t) in enumerate(row2):
    put(f, t, 1520 * i, 18440)
cj['notes']['se1'] = {'kind': 'title1', 'maxW': 7400, 'size': 200, 'w': 240, 'text': 'Settings', 'x': -1474, 'y': 17657, 'page': 'quote'}
cj['notes']['se2'] = {'text': 'Manager view. Rep assignments and Reps moved to Teams and Reps. Only managers can change these. Margin floors are the organization hard stops, with a rep review below. Descriptions are kept only where a new user could misread the setting.', 'x': 1520, 'y': 17080, 'w': 600, 'page': 'quote'}
json.dump(cj, open(P + "\\canvas.json", "w", encoding="utf-8", newline="\n"), indent=2, ensure_ascii=False)
print('ok', len(cj['boards']))
