# Logged-in Querent on the customer site: the same base box, plus two buttons (Orders, My rep) that pull up a side sheet.
# Usage: python -I mk_customer_embed2.py <project dir>   -> C_CVL1 (closed), C_CVL2 (orders open), C_CVL3 (rep open)
import os, re, sys

D = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
g = {'__name__': 'x', '__file__': os.path.join(here, 'mk_customer_embed.py'), 'os': os, 're': re}
sys.argv = ['x', D]
s = open(os.path.join(here, 'mk_customer_embed.py'), encoding='utf-8').read()
exec(s[:s.index('# ---- CVE0')], g)
ic, hmark, hero, composer, powered, write, line, REPBLOCK, label, CARD, CLOSE, CHEVD, PHONE, MAIL = (g[k] for k in ('ic', 'hmark', 'hero', 'composer', 'powered', 'write', 'line', 'REPBLOCK', 'label', 'CARD', 'CLOSE', 'CHEVD', 'PHONE', 'MAIL'))

m = {'__name__': 'x', '__file__': os.path.join(here, 'mk_customer.py')}
sys.argv = ['x', D]
s3 = open(os.path.join(here, 'mk_customer.py'), encoding='utf-8').read()
exec(s3[:s3.index("TEMPLATE = '''")], m)
PREVIEW = m['VARIANTS'][1][2]
BELLP = m['BELLP']

NOTES = [(True, 'Quote Q-24791 is ready to review', '$96.00. Brandi sent it today.', 'Just now'),
         (True, 'Brandi updated Q-24790', 'The changes you asked for are in. Revision 2.', '2 h ago'),
         (False, 'Order SO-51223 has shipped', 'Delivery, SLC. From quote Q-24816.', 'Yesterday')]

ORDERS = [('SO-51223', 'Sep 25, 2026', 'Delivery, SLC', 'Shipped', '$698.22', 'From quote Q-24816'),
          ('SO-51222', 'Sep 11, 2026', 'Delivery, Provo', 'Closed', '$304.23', 'From quote Q-24814'),
          ('SO-51221', 'Aug 28, 2026', 'Will call, SLC', 'Closed', '$481.87', 'From quote Q-24812'),
          ('SO-51220', 'Aug 14, 2026', 'Delivery, SLC', 'Closed', '$303.38', 'From quote Q-24811'),
          ('SO-51219', 'Jul 31, 2026', 'Will call, SLC', 'Closed', '$175.03', '')]
ORDER_ICON = '<path d="M3 8l9-5 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9"/>'
REP_ICON = '<path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21c1-4 4-6 8-6s7 2 8 6"/>'


def btn(icon, text, on=False):
    return ('<button style="height: 40px; padding: 0 16px; border: %s solid %s; background: #fff; border-radius: 10px; font-weight: 700; display: flex; align-items: center; gap: 8px; color: #151D18; white-space: nowrap">%s%s</button>'
            % ('2px' if on else '1px', '#14803C' if on else '#CBD7CF', ic(icon, 18), text))


def order_row(n, d, f, st, tot, q):
    col = '#14803C' if st == 'Shipped' else '#4B5E52'
    return ('<div style="display: flex; justify-content: space-between; gap: 12px; padding: 14px 22px; border-top: 1px solid #E3EAE5"><div><div style="display: flex; gap: 10px; align-items: baseline"><span style="font-weight: 800">%s</span><span style="font-size: 12.5px; color: #4B5E52">%s</span></div>'
            '<div style="margin-top: 3px; font-size: 13px; color: #4B5E52">%s%s</div></div><div style="text-align: right"><div style="font-weight: 800; font-variant-numeric: tabular-nums">%s</div><div style="margin-top: 3px; font-weight: 700; font-size: 13px; color: %s">%s</div></div></div>'
            % (n, d, f, (' · ' + q) if q else '', tot, col, st))


def orders_body():
    return ''.join(order_row(*o) for o in ORDERS) + '<div style="padding: 14px 22px; border-top: 1px solid #E3EAE5; text-align: center"><button style="height: 36px; padding: 0 20px; border: 1px dashed #8FA699; background: transparent; border-radius: 9px; color: #2F4A3A; font-weight: 700">Show 18 more</button></div>'


def rep_body():
    return ('<div style="padding: 4px 22px 0">' + REPBLOCK.replace('margin-top: 6px', 'margin-top: 14px', 1) + '</div>')


def sheet(title, icon, body, extra=''):
    return ('<div style="position: absolute; left: 0; right: 400px; top: 72px; bottom: 0; background: rgba(15,30,20,0.35); z-index: 8"></div>'
            '<div style="position: absolute; top: 72px; right: 0; bottom: 0; width: 400px; background: #fff; border-left: 1px solid #E3EAE5; box-shadow: -18px 0 40px rgba(0,0,0,0.18); z-index: 9; display: flex; flex-direction: column">'
            '<div style="display: flex; align-items: center; gap: 10px; padding: 20px 22px 12px"><span style="color: #14803C; display: flex">%s</span><span style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em">%s</span>%s'
            '<button aria-label="Close" style="margin-left: auto; width: 34px; height: 34px; border: 1px solid #CBD7CF; background: #fff; border-radius: 9px; display: flex; align-items: center; justify-content: center">%s</button></div>'
            '<div style="flex: 1 1 auto; overflow-y: auto; padding-bottom: 16px">%s</div></div>' % (ic(icon, 20), title, extra, ic(CLOSE, 17), body))


def bell(on=False):
    note = ''
    if on:
        rows = ''.join('<div style="display: flex; gap: 12px; padding: 12px 16px; border-top: 1px solid #E3EAE5; background: %s"><span style="width: 8px; height: 8px; border-radius: 50%%; background: %s; margin-top: 6px; flex: none"></span>'
                       '<div style="flex: 1"><div style="font-weight: 700">%s</div><div style="font-size: 13px; color: #4B5E52; margin-top: 2px">%s</div></div><span style="font-size: 12px; color: #6A7F73; white-space: nowrap">%s</span></div>'
                       % ('#fff', '#14803C' if u else 'transparent', t, d, w) for u, t, d, w in NOTES)
        note = ('<div style="position: absolute; top: 48px; right: 0; width: 400px; background: #fff; border: 1px solid #CBD7CF; border-radius: 14px; box-shadow: 0 20px 44px rgba(0,0,0,0.22); z-index: 9; overflow: hidden; text-align: left">'
                '<div style="display: flex; align-items: center; padding: 14px 16px 10px"><span style="font-weight: 800; font-size: 16px">Notifications</span><span style="margin-left: auto; font-size: 13px; font-weight: 700; color: #14803C">Mark all read</span></div>' + rows + '</div>')
    return ('<div style="position: relative"><button aria-label="Notifications" style="position: relative; width: 40px; height: 40px; border-radius: 10px; border: %s solid %s; background: #fff; color: #4B5E52; display: flex; align-items: center; justify-content: center">%s'
            '<span style="position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; box-sizing: border-box; padding: 0 5px; border-radius: 999px; background: #14803C; color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center">2</span></button>%s</div>'
            % ('2px' if on else '1px', '#14803C' if on else '#CBD7CF', ic(BELLP, 19), note))


def page(open_=''):
    head = ('<div style="height: 72px; flex: none; display: flex; align-items: center; padding: 0 32px; border-bottom: 1px solid #E3EAE5; position: relative; z-index: 3"><div style="display: flex; align-items: center; gap: 12px">' + hmark(36)
            + '<span style="font-weight: 800; font-size: 17px; font-family: Georgia, serif">Herrick Industrial Supply</span></div><span style="margin-left: auto"></span>'
            + bell(open_ == 'b') + '<div style="margin-left: 14px; display: flex; align-items: center; gap: 10px; background: #0F3B22; border-radius: 12px; padding: 6px 12px 6px 6px"><div style="width: 32px; height: 32px; border-radius: 50%; background: #fff; color: #0F3B22; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center">WM</div>'
            '<div style="color: #fff; font-weight: 700; font-size: 13px; line-height: 1.2">Wasatch Mechanical<div style="font-weight: 500; color: #8FBFA0; font-size: 12px">Signed in</div></div>' + ic(CHEVD, 14).replace('currentColor', '#8FBFA0') + '</div></div>')
    buttons = ('<div style="max-width: 880px; width: 100%; margin: 0 auto; display: flex; gap: 10px; justify-content: flex-end; padding-top: 14px">'
               + btn(ORDER_ICON, 'Orders', open_ == 'o') + btn(REP_ICON, 'My rep', open_ == 'r') + '</div>')
    body = ('<div style="flex: 1 1 auto; min-height: 0; padding: 0 40px 16px; display: flex; flex-direction: column; box-sizing: border-box; background: #fff">' + buttons + hero(False)
            + '<div style="max-width: 880px; width: 100%; margin: 0 auto">' + composer() + powered() + '</div></div>')
    ov = ''
    if open_ == 'o':
        ov = sheet('Previous orders', ORDER_ICON, orders_body(), '<span style="font-family: Geist Mono, monospace; font-size: 12px; background: #E4EAE5; padding: 1px 8px; border-radius: 999px">23</span>')
    if open_ == 'r':
        ov = sheet('Your rep', REP_ICON, rep_body())
    if open_ == 'p':
        ov = PREVIEW
    return '<div style="display: flex; flex-direction: column; width: 1440px; height: 900px; box-sizing: border-box">' + head + body + '</div>' + ov


write('CVL1', 'Customer Site Logged In', page(''))
write('CVL2', 'Customer Site Logged In Orders', page('o'))
write('CVL3', 'Customer Site Logged In Rep', page('r'))
write('CVL4', 'Customer Site Logged In Bell', page('b'))
write('CVL5', 'Customer Site Logged In Quote From Bell', page('p'))
print('ok')
