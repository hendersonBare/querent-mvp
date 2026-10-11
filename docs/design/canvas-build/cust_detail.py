# exec'd from mk_cust.py, shares its globals (ACC, HEAD, INK, MUT, LINE, MONO, CANVAS, svg, rail, wr)
def kvr(k, v, sub=''):
    return '<div style="display: flex; justify-content: space-between; gap: 12px; padding: 6px 0"><span style="color: %s">%s</span><span style="text-align: right"><span style="font-weight: 700; font-variant-numeric: tabular-nums">%s</span>%s</span></div>' % (MUT, k, v, ('<div style="font-size: 12.5px; color: %s">%s</div>' % (MUT, sub)) if sub else '')

def card(title, side, body, extra=''):
    return '<section style="background: #fff; border-radius: 14px; overflow: hidden"><div style="display: flex; align-items: center; gap: 12px; padding: 12px 18px; background: %s; color: #fff"><span style="font-weight: 800">%s</span>%s%s</div>%s</section>' % (HEAD, title, ('<span style="color: #CFE6D6; font-size: 13px">%s</span>' % side) if side else '', extra, body)

def detail_page(title):
    bell = svg('M6 17v-6a6 6 0 1 1 12 0v6l1.5 2h-15L6 17z M10 21a2 2 0 0 0 4 0', 19, 2)
    caut = svg('M12 3 2 20h20L12 3z M12 10v4 M12 17.5v.01', 19, 2)
    q = [('Q-24788', 'Not sent, 3 lines', 'Oct 10, 2026', 'Draft ready', 'Not sent'), ('Q-24785', 'Not sent, 2 lines', 'Oct 10, 2026', 'Draft ready', 'Not sent'), ('Q-24784', 'Not sent, 4 lines', 'Oct 9, 2026', 'Draft ready', 'Not sent'),
         ('Q-24781', 'rev 1, 2 lines', 'Oct 9, 2026', 'Sent', '$1,572.00'), ('Q-24779', 'rev 1, 3 lines', 'Oct 8, 2026', 'Changes requested', '$1,627.00')]
    qrows = ''.join('<div style="display: grid; grid-template-columns: 1.1fr 1.2fr 1.6fr 1fr; gap: 16px; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5"><div><div style="font-weight: 800">%s</div><div style="font-size: 12.5px; color: %s">%s</div></div><div>%s</div><div style="font-weight: 600">%s</div><div style="text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; color: %s">%s</div></div>' % (a, MUT, b, c, d, MUT if e == 'Not sent' else INK, e) for a, b, c, d, e in q)
    qhead = '<div style="display: grid; grid-template-columns: 1.1fr 1.2fr 1.6fr 1fr; gap: 16px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Quote</div><div>:: Requested</div><div>:: Status</div><div style="text-align: right">:: Total</div></div>'
    orders = '<div style="padding: 44px 24px; text-align: center"><div style="font-weight: 800; font-size: 16px">No orders yet</div><div style="color: %s; margin-top: 6px; line-height: 1.45; max-width: 460px; margin-left: auto; margin-right: auto">Orders Canyon Ridge Builders places with Herrick show up here, read-only from the ERP.</div></div>' % MUT
    account = ('<div style="padding: 12px 18px 18px">' + kvr('Terms', 'Net 30') + kvr('Credit limit', '$40,000.00') + kvr('Open balance', '$9,650.00') + kvr('Past due', '$0.00') + kvr('Tax status', 'Taxable (UT)') + kvr('Quote win rate', '75%', '12 of 16 decided quotes')
               + '<div style="margin-top: 10px; color: %s">Credit used: <b style="color: %s">24%%</b></div><div style="height: 8px; border-radius: 4px; background: #E4EAE5; margin-top: 6px"><div style="width: 24%%; height: 8px; border-radius: 4px; background: %s"></div></div>' % (MUT, INK, ACC)
               + '<div style="margin-top: 16px; color: %s">Ship-to</div><div style="line-height: 1.5; margin-top: 2px">Canyon Ridge Builders, Draper yard<br>250 W Galena Park Blvd<br>Draper, UT 84020</div></div>' % MUT)
    rep = '<div style="padding: 16px 18px 18px"><div style="font-weight: 800; font-size: 16px">Brandi Gallegos</div><div style="color: %s; margin-top: 2px">Inside Sales</div><div style="font-family: %s; margin-top: 8px">(801) 111-2222</div><div style="color: %s; font-weight: 700; margin-top: 6px">brandi.gallegos@herrickindustrial.com</div></div>' % (MUT, MONO, ACC)
    contacts = '<div style="padding: 16px 18px 18px"><div style="display: flex; align-items: center; gap: 10px"><span style="font-weight: 800; font-size: 16px">Luis Herrera</span><span style="font-size: 11px; font-weight: 800; letter-spacing: 0.05em; color: #1F6E55; background: #D6EFE5; padding: 2px 8px; border-radius: 5px">PRIMARY</span></div><div style="color: %s; margin-top: 2px">Project Manager</div></div>' % MUT
    tpl = '''<!doctype html>
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
  <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px">
    <div><h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.035em">Canyon Ridge Builders</h1><div style="color: @@MUT@@; margin-top: 4px"><span style="font-family: @@MONO@@">CRB-3318</span>, rep Brandi Gallegos, Net 30</div></div>
    <div style="display: flex; align-items: center; gap: 10px; margin-left: auto"><button aria-label="Needs attention, 2 items" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid #E8A8A0; background: #FFEDEA; color: #C92A1C; display: flex; align-items: center; justify-content: center">@@CAUT@@</button>
    <button aria-label="Notifications" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid @@LINE@@; background: #fff; color: @@MUT@@; display: flex; align-items: center; justify-content: center">@@BELL@@</button></div>
  </div>
  <div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; margin-top: 22px">
    <div style="flex: 1 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 16px">@@LEFT@@</div>
    <div style="flex: 0 0 340px; max-width: 100%; display: flex; flex-direction: column; gap: 16px">@@RIGHT@@</div>
  </div>
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
    left = card('Recent orders', '', orders) + card('Recent quotes', '23 quotes', qhead + qrows, '<span style="margin-left: auto; font-weight: 800; color: #7FDBA0">View all 23 quotes</span>')
    right = card('Account', '', account) + card('Rep', '', rep) + card('Contacts', '1 contact', contacts)
    for k, v in [('@@TITLE@@', title), ('@@CANVAS@@', CANVAS), ('@@INK@@', INK), ('@@RAIL@@', rail(1)), ('@@MUT@@', MUT), ('@@MONO@@', MONO), ('@@CAUT@@', caut), ('@@LINE@@', LINE), ('@@BELL@@', bell), ('@@LEFT@@', left), ('@@RIGHT@@', right)]:
        tpl = tpl.replace(k, v)
    return tpl
