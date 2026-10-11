# Five layout options for the customer page, built from the pieces in mk_customer.py. Charcoal page only.
# Usage: python -I mk_customer_options.py <project dir>   -> writes C_CVO1..C_CVO5.dc.html
import os, re, sys

D = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'mk_customer.py'), encoding='utf-8').read()
ns = {'__name__': 'x'}
sys.argv = ['x', D]
exec(src[:src.index("TEMPLATE = '''")], ns)
g = ns
ic, line, dept, branch, label, chip, CHIPS, FILTBTN, BELL, logo, logo_w, qrow, LIST = (g[k] for k in ('ic', 'line', 'dept', 'branch', 'label', 'chip', 'CHIPS', 'FILTBTN', 'BELL', 'logo', 'logo_w', 'qrow', 'LIST'))
DOCP, PLUS, SEND, PHONE, MAIL = g['DOCP'], g['PLUS'], g['SEND'], g['PHONE'], g['MAIL']

HEAD = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>@@T@@</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500&display=swap">
<style>
body{margin:0}
button{font-family:inherit;cursor:pointer}
*{scrollbar-width:thin;scrollbar-color:#B4C5BA transparent}
*::-webkit-scrollbar{height:8px;width:8px}
*::-webkit-scrollbar-track{background:transparent}
*::-webkit-scrollbar-thumb{background:#B4C5BA;border-radius:8px}
</style>
</helmet>
<div style="position: relative; width: 1440px; height: 900px; overflow: hidden; display: flex; font-family: 'Albert Sans', sans-serif; background: #D9E3DC; color: #151D18; font-size: 14.5px">
'''
TAIL = '''
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

REQ = ('<button style="height: 40px; padding: 0 18px; border: 0; background: #14803C; color: #fff; border-radius: 10px; font-weight: 800; display: flex; align-items: center; gap: 8px; white-space: nowrap">'
       + ic(DOCP, 17) + 'Request a quote</button>')
NEWC = ('<button style="height: 38px; padding: 0 14px; border: 1px solid #CBD7CF; background: #fff; border-radius: 9px; font-weight: 600; display: flex; align-items: center; gap: 8px; white-space: nowrap">'
        + ic(PLUS, 16) + 'New conversation</button>')
TITLE = ('<div><h1 style="margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -0.035em">Wasatch Mechanical Contractors</h1>'
         '<div style="display: flex; align-items: center; gap: 10px; margin-top: 4px; color: #4B5E52">via Querent<span style="display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px; background: #fff; border: 1px solid #CBD7CF; color: #14803C; font-weight: 800; font-size: 12.5px">'
         '<span style="width: 7px; height: 7px; border-radius: 50%; background: #14803C"></span>Connected</span><span style="color: #6A7F73; font-size: 12.5px">Last updated 01:38:46 AM</span></div></div>')
PROFILE = ('<div style="flex: none; background: #0F3B22; padding: 16px 22px 18px; display: flex; flex-direction: column; gap: 12px">'
           '<div style="display: flex; align-items: center; gap: 10px"><div style="width: 38px; height: 38px; border-radius: 50%; background: #fff; color: #0F3B22; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center">WM</div>'
           '<div><div style="font-weight: 700; color: #fff">Wasatch Mechanical</div><div style="font-size: 12.5px; color: #8FBFA0">Customer</div></div></div>'
           '<button style="height: 36px; border-radius: 9px; border: 1px solid #3A7050; background: transparent; color: #fff; font-weight: 600">Sign out</button></div>')
BRAND = ('<div style="display: flex; align-items: center; gap: 10px"><span style="display: flex">' + logo_w(40) + '</span><span style="font-weight: 800; font-size: 20px; letter-spacing: -0.03em; color: #151D18">Querent</span></div>'
         '<div style="padding: 6px 0 4px; font-size: 13px; font-weight: 800; color: #14803C">Herrick Industrial Supply</div>')
REPBLOCK = ('<div style="display: flex; align-items: center; gap: 12px; margin-top: 6px"><div style="width: 44px; height: 44px; border-radius: 50%; background: #1F4A39; color: #fff; font-weight: 800; display: flex; align-items: center; justify-content: center; flex: none">BG</div>'
            '<div><div style="font-weight: 800; color: #151D18; font-size: 16px">Brandi Gallegos</div><div style="color: #4B5E52; font-size: 13px">Inside Sales</div></div></div>'
            + line(PHONE, '(801) 111-2222') + line(MAIL, 'brandi.gallegos@herrickindustrial.com'))
DEPTS = (dept('Customer Service', '(801) 555-0110', 'customerservice@herrickindustrial.com', 'Mon-Fri 7:00 AM-5:00 PM')
         + dept('Accounts Receivable / Finance', '(801) 555-0115', 'ar@herrickindustrial.com', 'Mon-Fri 8:00 AM-4:30 PM')
         + '<div style="padding: 14px 0; border-top: 1px solid #E3EAE5"><div style="font-weight: 800; color: #151D18">Warehouse / Will-call</div>'
         + branch('SLC', '(801) 555-0120', 'Mon-Fri 6:30 AM-5:00 PM') + branch('OGDEN', '(801) 555-0130', 'Mon-Fri 7:00 AM-4:30 PM') + branch('PROVO', '(801) 555-0140', 'Mon-Fri 7:00 AM-4:30 PM') + '</div>')


def contacts_col(width, border='right', brand=False):
    return ('<aside style="flex: 0 0 %dpx; align-self: stretch; height: 900px; background: #fff; border-%s: 1px solid #E3EAE5; display: flex; flex-direction: column; box-sizing: border-box">'
            '<div style="flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 20px 22px 12px">%s%s%s%s</div>%s</aside>'
            % (width, border, BRAND if brand else '', label('YOUR REP'), REPBLOCK, label('HERRICK CONTACTS') + DEPTS, PROFILE if brand else ''))


def quotes_col(width, border='right', brand=False, profile=False):
    rows = ''.join(qrow(*q) for q in LIST)
    return ('<aside style="flex: 0 0 %dpx; align-self: stretch; height: 900px; background: #fff; border-%s: 1px solid #E3EAE5; display: flex; flex-direction: column">'
            '%s<div style="display: flex; align-items: center; gap: 12px; padding: 14px 20px 14px"><span style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em">Your quotes</span>'
            '<span style="font-family: Geist Mono, monospace; font-size: 12px; background: #E4EAE5; padding: 1px 8px; border-radius: 999px">28</span><span style="margin-left: auto">%s</span></div>'
            '<div style="flex: 1 1 auto; min-height: 0; overflow-y: auto">%s<div style="padding: 14px 20px; border-top: 1px solid #E3EAE5; text-align: center"><button style="height: 36px; padding: 0 20px; border: 1px dashed #8FA699; background: transparent; border-radius: 9px; color: #2F4A3A; font-weight: 700">Show 19 more</button></div></div>%s</aside>'
            % (width, border, ('<div style="padding: 20px 22px 6px">' + BRAND + '</div>') if brand else '', FILTBTN, rows, PROFILE if profile else ''))


def chat(dark=False, compact=False):
    ink, mut, card, bord, inp = (('#fff', '#C7CBC9', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.06)') if dark else ('#151D18', '#4B5E52', '#fff', '#CBD7CF', '#fff'))
    chips = ''.join('<div style="border: 1px solid %s; border-radius: 12px; background: %s; color: %s; padding: %s; font-size: 15px; line-height: 1.35; display: flex; align-items: center">%s</div>' % (bord, card, ink, '14px 16px' if compact else '18px 20px', c) for c in CHIPS)
    hero = ('<div style="display: flex; flex-direction: column; justify-content: center; flex: 1 1 auto; min-height: 0; max-width: 880px; width: 100%; margin: 0 auto">'
            + ('' if compact else logo(52, '#7FDBA0' if dark else '#14803C'))
            + '<div style="margin-top: %s; font-size: 13px; font-weight: 800; letter-spacing: 0.14em; color: %s">HERRICK INDUSTRIAL SUPPLY</div>' % ('6px' if compact else '22px', '#7FDBA0' if dark else '#14803C')
            + '<h2 style="margin: 8px 0 0; font-size: %s; line-height: 1.04; font-weight: 800; letter-spacing: -0.04em; color: %s">%s</h2>' % ('32px' if compact else '52px', ink, 'Your business. Your answers.' if compact else 'Your business.<br>Your answers.')
            + '<div style="margin-top: 10px; font-size: %s; color: %s">Ask about stock, pricing, orders and quotes.</div>' % ('16px' if compact else '18px', mut)
            + '<div style="margin-top: 20px; display: grid; grid-template-columns: %s; gap: 12px">%s</div></div>' % ('1fr 1fr 1fr 1fr' if compact else '1fr 1fr', chips))
    comp = ('<div style="flex: none; border: 1px solid %s; border-radius: 14px; height: 60px; box-sizing: border-box; padding: 0 12px 0 22px; display: flex; align-items: center; gap: 12px; background: %s; max-width: 880px; width: 100%%; margin: 0 auto">'
            '<span style="flex: 1; color: %s; font-size: 16px">Ask about stock, pricing, orders...</span>'
            '<button aria-label="Send" style="width: 42px; height: 42px; border: 0; border-radius: 11px; background: #14803C; color: #fff; display: flex; align-items: center; justify-content: center">%s</button></div>'
            '<div style="text-align: center; color: %s; font-size: 12.5px; margin-top: 8px">Customer data, finally customer-facing.</div>' % (bord, inp, mut, ic(SEND, 20), mut))
    return hero + comp


def chat_card(dark=False, compact=False, newc=True):
    bg = '#0F3B22' if dark else '#fff'
    return ('<div style="flex: 1 1 auto; min-height: 0; margin-top: 18px; background: %s; border-radius: 14px; display: flex; flex-direction: column; padding: 14px 40px 16px; box-sizing: border-box">%s%s</div>'
            % (bg, ('<div style="display: flex; justify-content: flex-end">' + NEWC.replace('#fff;', 'transparent;').replace('#CBD7CF', 'rgba(255,255,255,0.3)').replace('<button', '<button', 1) + '</div>') if (newc and dark) else (('<div style="display: flex; justify-content: flex-end">' + NEWC + '</div>') if newc else ''), chat(dark, compact)))


def page_head(extra=''):
    return ('<div style="display: flex; align-items: flex-start; gap: 12px 20px">' + TITLE + '<div style="display: flex; align-items: center; gap: 10px; margin-left: auto">' + REQ + BELL + '</div></div>' + extra)


def main(inner, pad='24px 32px 20px', bg='#D9E3DC'):
    return '<main style="flex: 1 1 auto; min-width: 0; height: 900px; box-sizing: border-box; background: %s; padding: %s; display: flex; flex-direction: column">%s</main>' % (bg, pad, inner)


def write(n, title, body):
    html = (HEAD.replace('@@T@@', title) + body + TAIL)
    open(os.path.join(D, n + '.dc.html'), 'w', encoding='utf-8', newline='\n').write(html)


# 1. quotes left, contacts right
write('CVO1', 'Customer Option 1', quotes_col(352, 'right', brand=True, profile=True) + main(page_head() + chat_card()) + contacts_col(336, 'left'))

# 2. quotes left, contact strip across the top of the chat, chat takes the rest
def strip():
    c = lambda t, b: '<div style="background: #fff; border-radius: 12px; padding: 12px 14px; min-width: 0">%s%s</div>' % ('<div style="font-weight: 800; font-size: 13.5px">%s</div>' % t, b)
    ln = lambda i, x: '<div style="display: flex; align-items: center; gap: 8px; margin-top: 5px; font-size: 12.5px; color: #4B5E52; white-space: nowrap; overflow: hidden; text-overflow: ellipsis"><span style="color: #14803C; display: flex; flex: none">%s</span>%s</div>' % (ic(i, 13), x)
    return ('<div style="display: grid; grid-template-columns: 1.25fr 1fr 1fr 1fr; gap: 12px; margin-top: 16px">'
            + c('Brandi Gallegos, your rep', ln(PHONE, '(801) 111-2222') + ln(MAIL, 'brandi.gallegos@herrickindustrial.com'))
            + c('Customer Service', ln(PHONE, '(801) 555-0110') + ln(MAIL, 'customerservice@herrick...'))
            + c('Accounts Receivable', ln(PHONE, '(801) 555-0115') + ln(MAIL, 'ar@herrickindustrial.com'))
            + c('Will-call', ln(PHONE, 'SLC (801) 555-0120') + ln(PHONE, 'Ogden (801) 555-0130')) + '</div>')
write('CVO2', 'Customer Option 2', quotes_col(360, 'right', brand=True, profile=True) + main(page_head(strip()) + chat_card()))

# 3. no side panels: top header with tabs, one centred chat, recent quotes under the input
tabs = ''.join('<span style="padding: 12px 2px; font-weight: %s; color: %s; border-bottom: 3px solid %s; margin-bottom: -1px">%s</span>' % (('800', '#151D18', '#14803C') if i == 0 else ('600', '#4B5E52', 'transparent')) + (t,) if False else
               '<span style="padding: 12px 2px; font-weight: %s; color: %s; border-bottom: 3px solid %s; margin-bottom: -1px">%s</span>' % (('800', '#151D18', '#14803C') if i == 0 else ('600', '#4B5E52', 'transparent')) + t
               for i, t in [(0, 'Ask Querent'), (1, 'Quotes 28'), (2, 'Contacts')]) if False else ''
tabs = ''
for i, t in enumerate(['Ask Querent', 'Quotes  28', 'Contacts']):
    w, c, b = ('800', '#151D18', '#14803C') if i == 0 else ('600', '#4B5E52', 'transparent')
    tabs += '<span style="padding: 14px 2px; font-weight: %s; color: %s; border-bottom: 3px solid %s; margin-bottom: -1px">%s</span>' % (w, c, b, t)
bar = ('<div style="height: 72px; flex: none; background: #fff; border-bottom: 1px solid #E3EAE5; display: flex; align-items: center; gap: 28px; padding: 0 32px">'
       '<div style="display: flex; align-items: center; gap: 10px">' + logo_w(34) + '<div><div style="font-weight: 800; font-size: 17px; letter-spacing: -0.03em; line-height: 1.1">Querent</div><div style="font-size: 12px; font-weight: 800; color: #14803C">Herrick Industrial Supply</div></div></div>'
       '<div style="display: flex; gap: 26px; align-self: flex-end">' + tabs + '</div>'
       '<div style="margin-left: auto; display: flex; align-items: center; gap: 10px">' + REQ + BELL
       + '<div style="display: flex; align-items: center; gap: 10px; background: #0F3B22; border-radius: 12px; padding: 6px 12px 6px 6px"><div style="width: 32px; height: 32px; border-radius: 50%; background: #fff; color: #0F3B22; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center">WM</div><div style="color: #fff; font-weight: 700; font-size: 13px; line-height: 1.2">Wasatch Mechanical<div style="font-weight: 500; color: #8FBFA0; font-size: 12px">Sign out</div></div></div></div></div>')
recent = ('<div style="max-width: 880px; width: 100%; margin: 14px auto 0; display: flex; gap: 10px; align-items: center"><span style="font-size: 12.5px; font-weight: 800; color: #4B5E52">Recent quotes</span>'
          + ''.join('<span style="display: inline-flex; gap: 8px; align-items: center; height: 32px; padding: 0 12px; border: 1px solid #CBD7CF; border-radius: 999px; background: #fff; font-size: 13px"><b>%s</b><span style="color: #14803C; font-weight: 700">%s</span><span style="color: #4B5E52">%s</span></span>' % x for x in [('Q-24791', 'Sent', '$96.00'), ('Q-24817', 'Awaiting rep', ''), ('Q-24790', 'Changes requested', '$1,164.00')]) + '</div>')
inner3 = ('<div style="flex: 1 1 auto; min-height: 0; max-width: 1040px; width: 100%; margin: 0 auto; background: #fff; border-radius: 14px; padding: 16px 40px 16px; box-sizing: border-box; display: flex; flex-direction: column">'
          + '<div style="display: flex; justify-content: flex-end">' + NEWC + '</div>' + chat(False, False).replace('</div><div style="flex: none; border', '</div><div style="flex: none; border', 1) + recent + '</div>')
write('CVO3', 'Customer Option 3', '<div style="flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0">' + bar + '<div style="flex: 1 1 auto; min-height: 0; padding: 20px 32px 20px; display: flex; flex-direction: column; background: #D9E3DC">' + inner3 + '</div></div>')

# 4. dark chat in the middle, light panels on both sides
dark_head = page_head().replace('color: #4B5E52', 'color: #4B5E52')
write('CVO4', 'Customer Option 4', contacts_col(336, 'right', brand=True) + main(page_head() + chat_card(dark=True), bg='#D9E3DC') + quotes_col(360, 'left'))

# 5. quotes table on top, compact chat underneath, contacts panel on the left
def qtable():
    cols = 'grid-template-columns: 1.1fr 1fr 1.4fr 1fr'
    head = '<div style="display: grid; %s; gap: 16px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Quote</div><div>:: Requested</div><div>:: Status</div><div style="text-align: right">:: Total</div></div>' % cols
    rows = ''
    for i, d, tot, st in LIST[:6]:
        col = '#14803C' if st in ('Sent', 'Accepted') else '#4B5E52'
        rows += ('<div style="display: grid; %s; gap: 16px; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5"><div style="font-weight: 800">%s</div><div style="color: #4B5E52">%s</div><div style="font-weight: 700; color: %s">%s</div><div style="text-align: right; font-weight: 800; font-variant-numeric: tabular-nums">%s</div></div>'
                 % (cols, i, d, col, st, tot or '-'))
    more = '<div style="padding: 12px 20px; border-top: 1px solid #E3EAE5; text-align: center"><button style="height: 34px; padding: 0 18px; border: 1px dashed #8FA699; background: transparent; border-radius: 9px; color: #2F4A3A; font-weight: 700">Show 22 more quotes</button></div>'
    top = '<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px"><span style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em">Your quotes</span><span style="font-family: Geist Mono, monospace; font-size: 12px; background: #E4EAE5; padding: 1px 8px; border-radius: 999px">28</span><span style="margin-left: auto">' + FILTBTN + '</span></div>'
    return '<div style="margin-top: 18px">' + top + '<section style="background: #fff; border-radius: 14px; overflow: hidden">' + head + rows + more + '</section></div>'
chat5 = ('<div style="flex: 1 1 auto; min-height: 0; margin-top: 18px; background: #fff; border-radius: 14px; display: flex; flex-direction: column; padding: 14px 32px 14px; box-sizing: border-box">' + chat(False, True) + '</div>')
write('CVO5', 'Customer Option 5', contacts_col(336, 'right', brand=True) + main(page_head() + qtable() + chat5))
print('ok')
