# Round 2 customer page options: contacts behind an icon button that expands, quotes on their own page.
# Usage: python -I mk_customer_options2.py <project dir>   -> writes C_CVP1..C_CVP5 and C_CVQ (charcoal page)
import os, re, sys

D = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'mk_customer.py'), encoding='utf-8').read()
g = {'__name__': 'x'}
sys.argv = ['x', D]
exec(src[:src.index("TEMPLATE = '''")], g)
ic, line, dept, branch, label, CHIPS, FILTBTN, BELL, logo, logo_w, qrow, LIST = (g[k] for k in ('ic', 'line', 'dept', 'branch', 'label', 'CHIPS', 'FILTBTN', 'BELL', 'logo', 'logo_w', 'qrow', 'LIST'))
DOCP, PLUS, SEND, PHONE, MAIL = g['DOCP'], g['PLUS'], g['SEND'], g['PHONE'], g['MAIL']

# reuse the page shell and the chat from option set 1
o1 = open(os.path.join(here, 'mk_customer_options.py'), encoding='utf-8').read()
sys.argv = ['x', D]
h = {'__name__': 'x', '__file__': os.path.join(here, 'mk_customer_options.py')}
exec(o1[:o1.index('# 1. quotes left, contacts right')], h)
HEAD, TAIL, REQ, NEWC, TITLE, PROFILE, REPBLOCK, DEPTS, chat, main = (h[k] for k in ('HEAD', 'TAIL', 'REQ', 'NEWC', 'TITLE', 'PROFILE', 'REPBLOCK', 'DEPTS', 'chat', 'main'))

CARD = ('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6.5 16c.6-1.4 2-2 2.5-2s1.9.6 2.5 2M14 10h4M14 14h4"/>')
CHAT = '<path d="M4 5h16v11H9l-5 4z"/>'
DOC = '<path d="M6 3h9l4 4v14H6V3z M14 3v5h5 M9 13h7 M9 17h5"/>'
CHEV_D = '<path d="M6 9l6 6 6-6"/>'
CHEV_U = '<path d="M6 15l6-6 6 6"/>'
CLOSE = '<path d="M6 6l12 12M18 6 6 18"/>'


def rail(active):
    def item(txt, path, on, badge=''):
        bg, fg, w = ('#E3F1E8', '#14803C', '800') if on else ('transparent', '#4B5E52', '600')
        b = ('<span style="margin-left: auto; font-family: Geist Mono, monospace; font-size: 12px; background: #E4EAE5; color: #3A4A40; padding: 1px 8px; border-radius: 999px">%s</span>' % badge) if badge else ''
        return ('<a href="#" style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; background: %s; color: %s; font-weight: %s">%s<span style="font-size: 14px">%s</span>%s</a>'
                % (bg, fg, w, ic(path, 20), txt, b))
    return ('<aside style="flex: 0 0 216px; align-self: stretch; height: 900px; background: #fff; border-right: 1px solid #E3EAE5; display: flex; flex-direction: column; box-sizing: border-box">'
            '<div style="flex: 1 1 auto; padding: 20px 14px 0; display: flex; flex-direction: column; gap: 3px">'
            '<div style="display: flex; align-items: center; gap: 10px; padding: 0 8px"><span style="display: flex">' + logo_w(40) + '</span><span style="font-weight: 800; font-size: 20px; letter-spacing: -0.03em; color: #151D18">Querent</span></div>'
            '<div style="padding: 6px 8px 22px; font-size: 13px; font-weight: 800; color: #14803C">Herrick Industrial Supply</div>'
            + item('Ask Querent', CHAT, active == 'chat') + item('Quotes', DOC, active == 'quotes', '28') + '</div>' + PROFILE.replace('padding: 16px 22px 18px', 'padding: 16px 14px 18px') + '</aside>')


def contacts_btn(open_, label_='Contacts', chevron=True):
    return ('<button style="height: 40px; padding: 0 14px; border: %s solid %s; background: #fff; border-radius: 10px; font-weight: 700; display: flex; align-items: center; gap: 8px; color: #151D18; white-space: nowrap">%s%s%s</button>'
            % ('2px' if open_ else '1px', '#14803C' if open_ else '#CBD7CF', ic(CARD, 18), label_, ic(CHEV_U if open_ else CHEV_D, 15) if chevron else ''))


def contacts_panel(width=380, scroll=True):
    return ('<div style="width: %dpx; max-height: %s; overflow-y: auto; box-sizing: border-box; background: #fff; border: 1px solid #CBD7CF; border-radius: 14px; box-shadow: 0 20px 44px rgba(15,59,34,0.22); padding: 6px 20px 10px">%s%s%s</div>'
            % (width, '640px' if scroll else 'none', label('YOUR REP'), REPBLOCK, label('HERRICK CONTACTS') + DEPTS))


def header(contacts_html='', extra_right=''):
    return ('<div style="display: flex; align-items: flex-start; gap: 12px 20px">' + TITLE
            + '<div style="display: flex; align-items: center; gap: 10px; margin-left: auto">' + contacts_html + REQ + BELL + extra_right + '</div></div>')


def chat_card():
    return ('<div style="flex: 1 1 auto; min-height: 0; margin-top: 18px; background: #fff; border-radius: 14px; display: flex; flex-direction: column; padding: 14px 40px 16px; box-sizing: border-box">'
            '<div style="display: flex; justify-content: flex-end">' + NEWC + '</div>' + chat(False, False) + '</div>')


def write(n, title, body):
    open(os.path.join(D, n + '.dc.html'), 'w', encoding='utf-8', newline='\n').write(HEAD.replace('@@T@@', title) + body + TAIL)


R = rail('chat')
# 1. Contacts button in the header, popover underneath
write('CVP1', 'Customer Option 2a', R + main(header('<div style="position: relative">' + contacts_btn(True) + '<div style="position: absolute; top: 48px; right: 0; z-index: 8">' + contacts_panel(380) + '</div></div>') + chat_card()))

# 2. Rep chip (avatar + name) expands to the rep and every Herrick contact
chip = ('<div style="position: relative"><button style="height: 44px; padding: 0 12px 0 6px; border: 2px solid #14803C; background: #fff; border-radius: 12px; display: flex; align-items: center; gap: 10px; font-weight: 700">'
        '<span style="width: 32px; height: 32px; border-radius: 50%; background: #1F4A39; color: #fff; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center">BG</span>'
        '<span style="text-align: left; line-height: 1.15">Brandi Gallegos<div style="font-size: 12px; font-weight: 500; color: #4B5E52">Your rep</div></span>' + ic(CHEV_U, 15)
        + '</button><div style="position: absolute; top: 52px; right: 0; z-index: 8">' + contacts_panel(380) + '</div></div>')
write('CVP2', 'Customer Option 2b', R + main(header(chip) + chat_card()))

# 3. Floating contacts button in the corner of the chat, panel opens above it
float_btn = ('<div style="position: absolute; right: 32px; bottom: 28px; z-index: 8; display: flex; flex-direction: column; align-items: flex-end; gap: 12px">' + contacts_panel(360)
             + '<button style="height: 48px; padding: 0 18px; border: 0; background: #1F4A39; color: #fff; border-radius: 999px; font-weight: 700; display: flex; align-items: center; gap: 10px; box-shadow: 0 8px 20px rgba(0,0,0,0.25)">'
             + ic(CARD, 20) + 'Contacts' + ic(CHEV_D, 15) + '</button></div>')
write('CVP3', 'Customer Option 2c', R + main(header() + chat_card().replace('<div style="display: flex; justify-content: flex-end">', '<div style="display: flex; justify-content: flex-end">', 1)) + float_btn)

# 4. Slide-over drawer from the right edge
drawer = ('<div style="position: absolute; top: 0; right: 0; bottom: 0; width: 400px; background: #fff; border-left: 1px solid #E3EAE5; box-shadow: -18px 0 40px rgba(0,0,0,0.18); z-index: 9; display: flex; flex-direction: column">'
          '<div style="display: flex; align-items: center; gap: 10px; padding: 22px 24px 8px"><span style="color: #14803C; display: flex">' + ic(CARD, 22) + '</span><span style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em">Contacts</span>'
          '<button aria-label="Close" style="margin-left: auto; width: 36px; height: 36px; border: 1px solid #CBD7CF; background: #fff; border-radius: 9px; display: flex; align-items: center; justify-content: center">' + ic(CLOSE, 18) + '</button></div>'
          '<div style="flex: 1 1 auto; overflow-y: auto; padding: 0 24px 20px">' + label('YOUR REP') + REPBLOCK + label('HERRICK CONTACTS') + DEPTS + '</div></div>')
scrim = '<div style="position: absolute; left: 216px; top: 0; right: 400px; bottom: 0; background: rgba(15,30,20,0.35); z-index: 8"></div>'
write('CVP4', 'Customer Option 2d', R + main(header(contacts_btn(True, 'Contacts', False)) + chat_card()) + scrim + drawer)

# 5. Expandable bar under the header, cards slide down and the chat shrinks
def cell(t, lines):
    return '<div style="background: #F3F4F3; border-radius: 12px; padding: 12px 14px; min-width: 0"><div style="font-weight: 800; font-size: 13.5px">%s</div>%s</div>' % (t, lines)
ln = lambda i, x: '<div style="display: flex; align-items: center; gap: 8px; margin-top: 5px; font-size: 12.5px; color: #4B5E52; white-space: nowrap; overflow: hidden; text-overflow: ellipsis"><span style="color: #14803C; display: flex; flex: none">%s</span>%s</div>' % (ic(i, 13), x)
bar = ('<section style="margin-top: 16px; background: #fff; border-radius: 14px; overflow: hidden"><div style="display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid #E3EAE5">'
       '<span style="color: #14803C; display: flex">' + ic(CARD, 20) + '</span><span style="font-weight: 800">Contact Brandi and Herrick</span><span style="color: #4B5E52; font-size: 13px">Brandi Gallegos, (801) 111-2222</span>'
       '<span style="margin-left: auto; display: flex; color: #4B5E52">' + ic(CHEV_U, 18) + '</span></div>'
       '<div style="display: grid; grid-template-columns: 1.25fr 1fr 1fr 1fr; gap: 12px; padding: 14px 20px">'
       + cell('Brandi Gallegos, your rep', ln(PHONE, '(801) 111-2222') + ln(MAIL, 'brandi.gallegos@herrickindustrial.com'))
       + cell('Customer Service', ln(PHONE, '(801) 555-0110') + ln(MAIL, 'customerservice@herrick...'))
       + cell('Accounts Receivable', ln(PHONE, '(801) 555-0115') + ln(MAIL, 'ar@herrickindustrial.com'))
       + cell('Will-call', ln(PHONE, 'SLC (801) 555-0120') + ln(PHONE, 'Ogden (801) 555-0130')) + '</div></section>')
write('CVP5', 'Customer Option 2e', R + main(header() + bar + chat_card().replace('margin-top: 18px', 'margin-top: 14px', 1)))

# the separate Quotes page
cols = 'grid-template-columns: 1.1fr 1fr 1.4fr 1fr'
head = '<div style="display: grid; %s; gap: 16px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Quote</div><div>:: Requested</div><div>:: Status</div><div style="text-align: right">:: Total</div></div>' % cols
rows = ''
more_rows = LIST + [('Q-24811', 'Aug 14', '$303.38', 'Accepted'), ('Q-24810', 'Aug 6', '$175.03', 'Expired')]
for i, d, tot, st in more_rows:
    col = '#14803C' if st in ('Sent', 'Accepted') else '#4B5E52'
    rows += ('<div style="display: grid; %s; gap: 16px; align-items: center; padding: 14px 20px; border-top: 1px solid #E3EAE5"><div style="font-weight: 800">%s</div><div style="color: #4B5E52">%s</div><div style="font-weight: 700; color: %s">%s</div><div style="text-align: right; font-weight: 800; font-variant-numeric: tabular-nums">%s</div></div>' % (cols, i, d, col, st, tot or '-'))
more = '<div style="padding: 12px 20px; border-top: 1px solid #E3EAE5; text-align: center"><button style="height: 34px; padding: 0 18px; border: 1px dashed #8FA699; background: transparent; border-radius: 9px; color: #2F4A3A; font-weight: 700">Show 17 more</button></div>'
search = ('<div style="width: 300px; height: 42px; box-sizing: border-box; border-radius: 10px; background: #fff; border: 1px solid #CBD7CF; display: flex; align-items: center; gap: 10px; padding: 0 14px">'
          + ic('<path d="M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M20 20l-4-4"/>', 17) + '<span style="color: #6A7F73">Search quotes</span></div>')
qhead = ('<div style="display: flex; align-items: center; gap: 12px 20px"><h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.035em">Quotes</h1>' + search + FILTBTN.replace('height: 38px', 'height: 40px')
         + '<span style="color: #4B5E52; font-weight: 600">28 quotes</span><div style="display: flex; align-items: center; gap: 10px; margin-left: auto">' + REQ + BELL + '</div></div>')
write('CVQ', 'Customer Quotes Page', rail('quotes') + main(qhead + '<section style="margin-top: 22px; background: #fff; border-radius: 14px; overflow: hidden">' + head + rows + more + '</section>'))
print('ok')
