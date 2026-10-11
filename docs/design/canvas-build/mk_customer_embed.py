# Querent embedded in the supplier's own website.
# CVE0: base box for visitors who are not logged in (the whole page is the query box).
# CVE1..CVE4: in-site options once a customer is logged in. CVE3q / CVE3c: the Quotes and Contacts buttons opened.
# The Herrick site chrome is a placeholder. Usage: python -I mk_customer_embed.py <project dir>   -> C_CVE*.dc.html (charcoal page)
import os, re, sys

D = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
g = {'__name__': 'x', '__file__': os.path.join(here, 'mk_customer.py')}
sys.argv = ['x', D]
s1 = open(os.path.join(here, 'mk_customer.py'), encoding='utf-8').read()
exec(s1[:s1.index("TEMPLATE = '''")], g)
ic, line, dept, branch, label, CHIPS, logo, logo_w, qrow, LIST = (g[k] for k in ('ic', 'line', 'dept', 'branch', 'label', 'CHIPS', 'logo', 'logo_w', 'qrow', 'LIST'))
DOCP, PLUS, SEND, PHONE, MAIL, BELLP = g['DOCP'], g['PLUS'], g['SEND'], g['PHONE'], g['MAIL'], g['BELLP']
h = {'__name__': 'x', '__file__': os.path.join(here, 'mk_customer_options.py')}
s2 = open(os.path.join(here, 'mk_customer_options.py'), encoding='utf-8').read()
exec(s2[:s2.index('# 1. quotes left, contacts right')], h)
HEAD, TAIL, REPBLOCK, DEPTS = h['HEAD'], h['TAIL'], h['REPBLOCK'], h['DEPTS']
HEAD = HEAD.replace('background: #D9E3DC; color: #151D18', 'background: #fff; color: #151D18')
HEAD = HEAD.replace('*{scrollbar-width', 'a{color:inherit;text-decoration:none}\n*{scrollbar-width', 1)

CARD = '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6.5 16c.6-1.4 2-2 2.5-2s1.9.6 2.5 2M14 10h4M14 14h4"/>'
CLOSE = '<path d="M6 6l12 12M18 6 6 18"/>'
CHEVD = '<path d="M6 9l6 6 6-6"/>'
SEARCH = '<path d="M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M20 20l-4-4"/>'
MIN = '<path d="M5 12h14"/>'

PUBLIC_CHIPS = ['Do you have 1/2 in grade 8 hex bolts in stock?', 'What are the branch hours?', 'Do you deliver to Ogden?', 'How do I open an account?']


def write(n, title, body, bg='#fff'):
    html = HEAD.replace('@@T@@', title).replace('background: #fff; color: #151D18', 'background: %s; color: #151D18' % bg, 1) + body + TAIL
    open(os.path.join(D, n + '.dc.html'), 'w', encoding='utf-8', newline='\n').write(html)


def hmark(size=36):
    return ('<span style="width: %dpx; height: %dpx; border: 2px solid #151D18; display: inline-flex; align-items: center; justify-content: center; font-family: Georgia, serif; font-weight: 700; font-size: %dpx; flex: none">H</span>' % (size, size, int(size * 0.6)))


def tbtn(icon, text, badge='', on=False, compact=False):
    b = ('<span style="font-family: Geist Mono, monospace; font-size: 11.5px; background: #E4EAE5; color: #3A4A40; padding: 0 7px; border-radius: 999px">%s</span>' % badge) if badge else ''
    return ('<button style="height: %dpx; padding: 0 %dpx; border: %s solid %s; background: #fff; border-radius: 9px; font-weight: 700; display: flex; align-items: center; gap: 8px; color: #151D18; white-space: nowrap; font-size: 13.5px">%s%s%s</button>'
            % (34 if compact else 38, 10 if compact else 14, '2px' if on else '1px', '#14803C' if on else '#CBD7CF', ic(icon, 16), text, b))


QUOTES_BTN = lambda on=False, c=False: tbtn('<path d="M6 3h9l4 4v14H6V3z M14 3v5h5 M9 13h7 M9 17h5"/>', 'Quotes', '28', on, c)
CONTACTS_BTN = lambda on=False, c=False: tbtn(CARD, 'Contacts', '', on, c)
NEW_BTN = lambda c=False: tbtn(PLUS, 'New', '', False, c)


def site_header(active='', logged=True, ask_btn=True):
    nav = ''
    for t in ['Products', 'Services', 'Locations', 'About']:
        w, c, b = ('800', '#151D18', '#14803C') if t == active else ('600', '#4B5E52', 'transparent')
        nav += '<span style="padding: 24px 2px; font-weight: %s; color: %s; border-bottom: 3px solid %s">%s</span>' % (w, c, b, t)
    if ask_btn:
        w, c, b = ('800', '#14803C', '#14803C') if active == 'Ask' else ('700', '#14803C', 'transparent')
        nav += '<span style="padding: 24px 2px; font-weight: %s; color: %s; border-bottom: 3px solid %s; display: flex; align-items: center; gap: 6px">%sAsk Herrick</span>' % (w, c, b, ic('<path d="M4 5h16v11H9l-5 4z"/>', 16))
    acct = ('<div style="display: flex; align-items: center; gap: 10px; background: #0F3B22; border-radius: 12px; padding: 6px 12px 6px 6px"><div style="width: 32px; height: 32px; border-radius: 50%; background: #fff; color: #0F3B22; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center">WM</div>'
            '<div style="color: #fff; font-weight: 700; font-size: 13px; line-height: 1.2">Wasatch Mechanical<div style="font-weight: 500; color: #8FBFA0; font-size: 12px">Signed in</div></div>' + ic(CHEVD, 14).replace('currentColor', '#8FBFA0') + '</div>') if logged else \
           '<button style="height: 40px; padding: 0 18px; border: 1px solid #CBD7CF; background: #fff; border-radius: 10px; font-weight: 700">Sign in</button>'
    return ('<header style="height: 72px; flex: none; box-sizing: border-box; background: #fff; border-bottom: 1px solid #E3EAE5; display: flex; align-items: center; gap: 30px; padding: 0 32px; position: relative; z-index: 3">'
            '<div style="display: flex; align-items: center; gap: 12px">' + hmark(36) + '<span style="font-weight: 800; font-size: 17px; letter-spacing: -0.01em; font-family: Georgia, serif">Herrick Industrial Supply</span></div>'
            '<nav style="display: flex; gap: 26px; align-self: stretch; align-items: center">' + nav + '</nav><div style="margin-left: auto; display: flex; align-items: center; gap: 12px">' + acct + '</div></header>')


def host_body(width='100%'):
    tile = lambda t: '<div style="background: #F0F1F0; border: 1px solid #E3EAE5; border-radius: 12px; height: 150px; padding: 16px; font-weight: 700; color: #4B5E52">%s</div>' % t
    return ('<div style="width: %s; box-sizing: border-box; padding: 32px; overflow: hidden; flex: 1 1 auto">'
            '<div style="background: #E4EAE5; border-radius: 14px; height: 220px; padding: 32px; box-sizing: border-box"><div style="font-size: 34px; font-weight: 800; letter-spacing: -0.03em; font-family: Georgia, serif">Industrial supply, delivered across Utah.</div>'
            '<div style="margin-top: 10px; color: #4B5E52; font-size: 16px">Fasteners, abrasives, safety, tie-downs and more. Page content on Herrick\'s site.</div></div>'
            '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 20px">%s</div></div>' % (width, ''.join(tile(t) for t in ['Fasteners', 'Abrasives and Cutting', 'Safety and PPE', 'Tie-downs'])))


def chip_list(chips, bg='#fff'):
    return ''.join('<div style="border: 1px solid #CBD7CF; border-radius: 12px; background: %s; padding: 12px 14px; font-size: 14.5px; line-height: 1.3; margin-bottom: 8px">%s</div>' % (bg, c) for c in chips)


def composer(w='100%'):
    return ('<div style="flex: none; border: 1px solid #CBD7CF; border-radius: 14px; height: 56px; box-sizing: border-box; padding: 0 10px 0 18px; display: flex; align-items: center; gap: 12px; background: #fff; width: %s">'
            '<span style="flex: 1; color: #6A7F73; font-size: 15px">Ask about stock, pricing, orders...</span>'
            '<button aria-label="Send" style="width: 40px; height: 40px; border: 0; border-radius: 10px; background: #14803C; color: #fff; display: flex; align-items: center; justify-content: center">%s</button></div>' % (w, ic(SEND, 18)))


def hero(public=False, size='52px'):
    chips = PUBLIC_CHIPS if public else CHIPS
    cells = ''.join('<div style="border: 1px solid #CBD7CF; border-radius: 12px; background: #fff; padding: 18px 20px; font-size: 15px; line-height: 1.35; display: flex; align-items: center">%s</div>' % c for c in chips)
    return ('<div style="flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: center; max-width: 880px; width: 100%; margin: 0 auto">' + logo(52, '#14803C')
            + '<div style="margin-top: 20px; font-size: 13px; font-weight: 800; letter-spacing: 0.14em; color: #14803C">HERRICK INDUSTRIAL SUPPLY</div>'
            '<h2 style="margin: 8px 0 0; font-size: %s; line-height: 1.04; font-weight: 800; letter-spacing: -0.04em">%s</h2>' % (size, 'Ask about stock,<br>items and branches.' if public else 'Your business.<br>Your answers.')
            + '<div style="margin-top: 12px; font-size: 18px; color: #4B5E52">%s</div>' % ('Open to everyone. Sign in to see your own prices, orders and quotes.' if public else 'Ask about stock, pricing, orders and quotes.')
            + '<div style="margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px">' + cells + '</div></div>')


def contacts_body():
    return label('YOUR REP') + REPBLOCK + label('HERRICK CONTACTS') + DEPTS


def quotes_body():
    return ''.join(qrow(*q) for q in LIST) + '<div style="padding: 14px 20px; border-top: 1px solid #E3EAE5; text-align: center"><button style="height: 36px; padding: 0 20px; border: 1px dashed #8FA699; background: transparent; border-radius: 9px; color: #2F4A3A; font-weight: 700">Show 19 more</button></div>'


def sheet(title, icon, body, width=400, extra=''):
    return ('<div style="position: absolute; top: 72px; right: 0; bottom: 0; width: %dpx; background: #fff; border-left: 1px solid #E3EAE5; box-shadow: -18px 0 40px rgba(0,0,0,0.18); z-index: 9; display: flex; flex-direction: column">'
            '<div style="display: flex; align-items: center; gap: 10px; padding: 20px 22px 12px"><span style="color: #14803C; display: flex">%s</span><span style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em">%s</span>%s'
            '<button aria-label="Close" style="margin-left: auto; width: 34px; height: 34px; border: 1px solid #CBD7CF; background: #fff; border-radius: 9px; display: flex; align-items: center; justify-content: center">%s</button></div>'
            '<div style="flex: 1 1 auto; overflow-y: auto; padding: 0 0 16px">%s</div></div>' % (width, icon, title, extra, ic(CLOSE, 17), body))


def powered():
    return '<div style="text-align: center; color: #6A7F73; font-size: 12.5px; margin-top: 8px">Powered by Querent</div>'


# ---- CVE0: base box, visitors who are not logged in
write('CVE0', 'Customer Site Base Box',
      '<div style="flex: 1 1 auto; display: flex; flex-direction: column; height: 900px; box-sizing: border-box">'
      '<div style="height: 72px; flex: none; display: flex; align-items: center; padding: 0 32px; border-bottom: 1px solid #E3EAE5"><div style="display: flex; align-items: center; gap: 12px">' + hmark(36)
      + '<span style="font-weight: 800; font-size: 17px; font-family: Georgia, serif">Herrick Industrial Supply</span></div><div style="margin-left: auto; display: flex; gap: 10px"><button style="height: 40px; padding: 0 18px; border: 1px solid #CBD7CF; background: #fff; border-radius: 10px; font-weight: 700">Sign in</button></div></div>'
      '<div style="flex: 1 1 auto; min-height: 0; padding: 12px 40px 16px; display: flex; flex-direction: column; box-sizing: border-box; background: #fff">' + hero(True) + '<div style="max-width: 880px; width: 100%; margin: 0 auto">' + composer() + powered() + '</div></div></div>')

# ---- CVE1: docked panel on the right of the page
panel_chat = ('<div style="flex: 1 1 auto; min-height: 0; padding: 16px 18px 10px; overflow: hidden"><div style="font-size: 22px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1">Your business.<br>Your answers.</div>'
              '<div style="margin: 8px 0 16px; color: #4B5E52">Ask about stock, pricing, orders and quotes.</div>' + chip_list(CHIPS) + '</div>')
docked = ('<aside style="flex: 0 0 440px; height: 828px; border-left: 1px solid #E3EAE5; background: #F3F4F3; display: flex; flex-direction: column; box-sizing: border-box">'
          '<div style="display: flex; align-items: center; gap: 8px; padding: 14px 18px; background: #fff; border-bottom: 1px solid #E3EAE5"><span style="display: flex">' + logo_w(26).replace('#7FDBA0', '#14803C') + '</span><span style="font-weight: 800; font-size: 16px">Querent</span>'
          '<span style="margin-left: auto; display: flex; gap: 8px">' + QUOTES_BTN(False, True) + CONTACTS_BTN(False, True) + '</span></div>'
          + panel_chat + '<div style="padding: 0 18px 14px">' + composer() + powered() + '</div></aside>')
write('CVE1', 'Customer Site Docked Panel', '<div style="display: flex; flex-direction: column; width: 1440px; height: 900px">' + site_header('Products', True, False) + '<div style="display: flex; flex: 1 1 auto; min-height: 0">' + host_body('1000px') + docked + '</div></div>')

# ---- CVE2: floating widget over the page
widget = ('<div style="position: absolute; right: 32px; bottom: 28px; width: 420px; height: 640px; background: #fff; border-radius: 16px; box-shadow: 0 24px 60px rgba(0,0,0,0.30); border: 1px solid #CBD7CF; display: flex; flex-direction: column; overflow: hidden; z-index: 5">'
          '<div style="display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: #1F4A39; color: #fff"><span style="display: flex">' + logo_w(24) + '</span><span style="font-weight: 800">Querent</span>'
          '<span style="margin-left: auto; display: flex; gap: 6px">'
          + ''.join('<button aria-label="%s" style="height: 32px; padding: 0 10px; border: 1px solid rgba(255,255,255,0.3); background: transparent; color: #fff; border-radius: 8px; display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 13px">%s%s</button>' % (t, ic(i, 15), t) for t, i in [('Quotes', '<path d="M6 3h9l4 4v14H6V3z M14 3v5h5 M9 13h7 M9 17h5"/>'), ('Contacts', CARD)])
          + '<button aria-label="Minimise" style="width: 32px; height: 32px; border: 0; background: transparent; color: #fff; display: flex; align-items: center; justify-content: center">' + ic(MIN, 16) + '</button></span></div>'
          + panel_chat.replace('overflow: hidden', 'overflow: hidden') + '<div style="padding: 0 16px 12px">' + composer() + powered() + '</div></div>')
write('CVE2', 'Customer Site Floating Widget', '<div style="display: flex; flex-direction: column; width: 1440px; height: 900px">' + site_header('Products', True, False) + host_body() + '</div>' + widget)

# ---- CVE3: an in-site page ("Ask Herrick" in the main nav), with the three buttons above the box
def ask_page(overlay=''):
    bar = ('<div style="display: flex; align-items: center; gap: 10px; max-width: 980px; width: 100%; margin: 0 auto"><span style="font-size: 26px; font-weight: 800; letter-spacing: -0.03em">Ask Herrick</span>'
           '<span style="margin-left: auto; display: flex; gap: 10px">' + QUOTES_BTN(overlay == 'q') + CONTACTS_BTN(overlay == 'c') + NEW_BTN() + '</span></div>')
    card = ('<div style="flex: 1 1 auto; min-height: 0; max-width: 980px; width: 100%; margin: 16px auto 0; background: #fff; border-radius: 14px; border: 1px solid #E3EAE5; padding: 12px 40px 16px; display: flex; flex-direction: column; box-sizing: border-box">'
            + hero(False, '46px') + '<div style="max-width: 880px; width: 100%; margin: 0 auto">' + composer() + powered() + '</div></div>')
    return ('<div style="display: flex; flex-direction: column; width: 1440px; height: 900px">' + site_header('Ask', True, True)
            + '<div style="flex: 1 1 auto; min-height: 0; background: #F3F4F3; padding: 24px 32px 24px; display: flex; flex-direction: column">' + bar + card + '</div></div>' + overlay_html(overlay))


def overlay_html(o):
    if o == 'q':
        return '<div style="position: absolute; left: 0; right: 400px; top: 72px; bottom: 0; background: rgba(15,30,20,0.35); z-index: 8"></div>' + sheet('Your quotes', ic('<path d="M6 3h9l4 4v14H6V3z M14 3v5h5 M9 13h7 M9 17h5"/>', 20), quotes_body(), 400, '<span style="font-family: Geist Mono, monospace; font-size: 12px; background: #E4EAE5; padding: 1px 8px; border-radius: 999px">28</span>')
    if o == 'c':
        return '<div style="position: absolute; left: 0; right: 400px; top: 72px; bottom: 0; background: rgba(15,30,20,0.35); z-index: 8"></div>' + sheet('Contacts', ic(CARD, 20), '<div style="padding: 0 22px">' + contacts_body() + '</div>', 400)
    return ''


write('CVE3', 'Customer Site Ask Page', ask_page(''))
write('CVE3q', 'Customer Site Ask Page Quotes', ask_page('q'))
write('CVE3c', 'Customer Site Ask Page Contacts', ask_page('c'))

# ---- CVE4: ask bar in the site header, results drop down under it
ask_bar = ('<div style="position: absolute; top: 14px; left: 50%; transform: translateX(-50%); width: 640px; z-index: 6"><div style="height: 44px; border: 2px solid #14803C; border-radius: 12px; background: #fff; display: flex; align-items: center; gap: 10px; padding: 0 14px">'
           + ic(SEARCH, 18) + '<span style="color: #6A7F73">Ask about stock, pricing, orders...</span><span style="margin-left: auto; font-size: 12px; font-weight: 800; color: #14803C; letter-spacing: 0.06em">ASK HERRICK</span></div>'
           '<div style="margin-top: 8px; background: #fff; border: 1px solid #CBD7CF; border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,0.25); padding: 16px 18px 14px">'
           '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px"><span style="display: flex">' + logo_w(22).replace('#7FDBA0', '#14803C') + '</span><span style="font-weight: 800">Querent</span><span style="margin-left: auto; display: flex; gap: 8px">' + QUOTES_BTN(False, True) + CONTACTS_BTN(False, True) + NEW_BTN(True) + '</span></div>'
           '<div style="font-size: 12px; font-weight: 800; color: #6A7F73; letter-spacing: 0.08em; margin-bottom: 8px">TRY ASKING</div>' + chip_list(CHIPS) + '</div></div>')
write('CVE4', 'Customer Site Header Ask Bar', '<div style="position: relative; display: flex; flex-direction: column; width: 1440px; height: 900px">' + site_header('Products', True, False) + host_body() + ask_bar + '</div>')
print('ok')
