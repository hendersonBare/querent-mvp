# Builds the customer view: CV1 (page), CV2 (quote sent, preview), CV3 (quote awaiting rep).
# Usage: python -I mk_customer.py <out dir>
import sys, os
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def ic(d, s=17):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
            'stroke-linejoin="round" aria-hidden="true">%s</svg>') % (s, s, d)


PHONE = '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'
MAIL = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
FILTER = '<path d="M3 5h18l-7 8v6l-4-2v-4L3 5z"/>'
PLUS = '<path d="M12 5v14M5 12h14"/>'
SEND = '<path d="M21 3 10 14"/><path d="M21 3 14 21l-4-7-7-4 18-7z"/>'
BELLP = '<path d="M6 17v-6a6 6 0 1 1 12 0v6l1.5 2h-15L6 17z"/><path d="M10 21a2 2 0 0 0 4 0"/>'
DOCP = '<path d="M6 3h9l4 4v14H6V3z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>'
DLP = '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'
CLOSEP = '<path d="M6 6l12 12M18 6 6 18"/>'
ZOOMP = '<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4M11 8v6M8 11h6"/>'
CLOCKP = '<path d="M6 3h9l4 4v14H6V3z"/><circle cx="12" cy="14" r="3"/><path d="M12 12.5V14l1 1"/>'


def line(icon, text):
    return ('<div style="display: flex; align-items: flex-start; gap: 10px; margin-top: 7px; overflow-wrap: anywhere; font-size: 13.5px; color: #151D18">'
            '<span style="color: #14803C; margin-top: 2px; flex: none">%s</span><span>%s</span></div>') % (ic(icon, 15), text)


def hours(t):
    return '<div style="color: #6A7F73; font-size: 12px; margin: 3px 0 0 25px">%s</div>' % t


def dept(name, phone, mail, hrs):
    return '<div style="padding: 14px 0; border-top: 1px solid #E3EAE5"><div style="font-weight: 800; color: #151D18">%s</div>%s%s%s</div>' % (
        name, line(PHONE, phone), line(MAIL, mail), hours(hrs))


def branch(code, phone, hrs):
    return ('<div style="display: flex; gap: 10px; margin-top: 10px"><span style="width: 58px; flex: none; height: 22px; border-radius: 6px; background: #E4EAE5; '
            'color: #3A4A40; font-size: 11.5px; font-weight: 800; display: flex; align-items: center; justify-content: center">%s</span>'
            '<div><div style="display: flex; gap: 8px; align-items: center; color: #151D18; font-size: 13.5px"><span style="color: #14803C; display: flex">%s</span><span>%s</span></div>'
            '<div style="color: #6A7F73; font-size: 12px; margin-top: 2px">%s</div></div></div>') % (code, ic(PHONE, 15), phone, hrs)


GROUPS = [('Sent', 2, [('Q-24791', 'Oct 9', '$96.00'), ('Q-24789', 'Oct 6', '$360.80')], ''),
          ('Awaiting rep', 1, [('Q-24817', 'Oct 9', '')], ''),
          ('Changes requested', 1, [('Q-24790', 'Oct 8', '$1,164.00')], ''),
          ('Accepted', 16, [('Q-24816', 'Sep 23', '$655.25'), ('Q-24814', 'Sep 9', '$291.15')], 'Show 14 more'),
          ('Expired', 8, [('Q-24815', 'Sep 18', '$322.80'), ('Q-24813', 'Sep 4', '$131.45')], 'Show 6 more')]


def qcard(i, d, tot):
    amount = '<div style="margin-top: 8px; font-weight: 800; font-variant-numeric: tabular-nums">%s</div>' % tot if tot else '<div style="margin-top: 8px; color: #6A7F73; font-size: 13px">Brandi is pricing this quote</div>'
    return ('<div style="background: #fff; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; border: 1px solid #D5DED8">'
            '<div style="display: flex; justify-content: space-between; align-items: baseline"><span style="font-weight: 800">%s</span>'
            '<span style="font-family: \'Geist Mono\', monospace; font-size: 11.5px; color: #70847A">%s</span></div>%s</div>') % (i, d, amount)


def qgroup(label, n, cards, more):
    head = ('<div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #E4EAE5; color: #3A4A40">'
            '<div style="font-weight: 800"><span style="color: #8DA195">:: </span>%s</div>'
            '<span style="font-family: \'Geist Mono\', monospace; font-size: 12px; background: rgba(0,0,0,0.08); padding: 1px 8px; border-radius: 999px">%d</span></div>') % (label, n)
    body = ''.join(qcard(*c) for c in cards)
    if more:
        body += ('<button style="width: 100%%; height: 34px; border: 1px dashed #8FA699; background: transparent; border-radius: 9px; color: #2F4A3A; font-weight: 700">%s</button>' % more)
    return '<section style="background: #EEF3EF; border-radius: 12px; overflow: hidden; margin-bottom: 14px">%s<div style="padding: 10px">%s</div></section>' % (head, body)


CHIPS = ['Do you have 1/2 in grade 8 hex bolts in stock?', 'What did we pay for nitrile gloves last time?', 'Has our last order shipped?', "What's our open balance?"]


def chip(t):
    return ('<div style="border: 1px solid #CBD7CF; border-radius: 12px; background: #fff; padding: 18px 20px; font-size: 15px; line-height: 1.35; '
            'min-height: 22px; display: flex; align-items: center">%s</div>') % t


def label(t):
    return '<div style="font-size: 11.5px; font-weight: 800; letter-spacing: 0.1em; color: #14803C; margin: 18px 0 4px">%s</div>' % t


logo_w = lambda size: ('<svg width="%d" height="%d" viewBox="10 10 80 80" fill="none" stroke="#14803C" stroke-width="7.5" stroke-linecap="round" role="img" aria-label="Querent">'
                       '<circle cx="49" cy="49" r="28.5"/><path d="M60 60 81 82"/></svg>') % (size, size)

RAIL = ('<aside style="flex: 0 0 336px; align-self: stretch; background: #fff; border-right: 1px solid #E3EAE5; display: flex; flex-direction: column; height: 900px; box-sizing: border-box">'
        '<div style="flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 20px 22px 0">'
        '<div style="display: flex; align-items: center; gap: 10px"><span style="display: flex">' + logo_w(40) + '</span><span style="font-weight: 800; font-size: 20px; letter-spacing: -0.03em; color: #151D18">Querent</span></div>'
        '<div style="padding: 6px 0 4px; font-size: 13px; font-weight: 800; color: #14803C">Herrick Industrial Supply</div>'
        + label('YOUR REP') +
        '<div style="display: flex; align-items: center; gap: 12px; margin-top: 6px"><div style="width: 44px; height: 44px; border-radius: 50%; background: #1F4A39; color: #fff; font-weight: 800; display: flex; align-items: center; justify-content: center; flex: none">BG</div>'
        '<div><div style="font-weight: 800; color: #151D18; font-size: 16px">Brandi Gallegos</div><div style="color: #4B5E52; font-size: 13px">Inside Sales</div></div></div>'
        + line(PHONE, '(801) 111-2222') + line(MAIL, 'brandi.gallegos@herrickindustrial.com')
        + label('HERRICK CONTACTS') +
        '<div style="flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 4px">'
        + dept('Customer Service', '(801) 555-0110', 'customerservice@herrickindustrial.com', 'Mon-Fri 7:00 AM-5:00 PM')
        + dept('Accounts Receivable / Finance', '(801) 555-0115', 'ar@herrickindustrial.com', 'Mon-Fri 8:00 AM-4:30 PM')
        + '<div style="padding: 14px 0; border-top: 1px solid #E3EAE5"><div style="font-weight: 800; color: #151D18">Warehouse / Will-call</div>'
        + branch('SLC', '(801) 555-0120', 'Mon-Fri 6:30 AM-5:00 PM') + branch('OGDEN', '(801) 555-0130', 'Mon-Fri 7:00 AM-4:30 PM')
        + branch('PROVO', '(801) 555-0140', 'Mon-Fri 7:00 AM-4:30 PM') + '</div></div></div>'
        '<div style="flex: none; background: #0F3B22; padding: 16px 22px 18px; display: flex; flex-direction: column; gap: 12px">'
        '<div style="display: flex; align-items: center; gap: 10px"><div style="width: 38px; height: 38px; border-radius: 50%; background: #fff; color: #0F3B22; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center">WM</div>'
        '<div><div style="font-weight: 700; color: #fff">Wasatch Mechanical</div><div style="font-size: 12.5px; color: #8FBFA0">Customer</div></div></div>'
        '<button style="height: 36px; border-radius: 9px; border: 1px solid #3A7050; background: transparent; color: #fff; font-weight: 600">Sign out</button></div></aside>')

BELL = ('<button aria-label="Notifications" style="position: relative; width: 40px; height: 40px; border-radius: 10px; border: 1px solid #CBD7CF; background: #fff; '
        'color: #4B5E52; display: flex; align-items: center; justify-content: center">' + ic(BELLP, 19)
        + '<span style="position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; box-sizing: border-box; padding: 0 5px; border-radius: 999px; '
        'background: #14803C; color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center">2</span></button>')

FILTBTN = ('<button style="height: 38px; padding: 0 14px; border: 1px solid #CBD7CF; background: #fff; border-radius: 9px; font-weight: 600; '
           'display: flex; align-items: center; gap: 8px">%sFilter</button>') % ic(FILTER, 15)

LIST = [('Q-24791', 'Oct 9', '$96.00', 'Sent'), ('Q-24817', 'Oct 9', '', 'Awaiting rep'), ('Q-24790', 'Oct 8', '$1,164.00', 'Changes requested'),
        ('Q-24789', 'Oct 6', '$360.80', 'Sent'), ('Q-24816', 'Sep 23', '$655.25', 'Accepted'), ('Q-24815', 'Sep 18', '$322.80', 'Expired'),
        ('Q-24814', 'Sep 9', '$291.15', 'Accepted'), ('Q-24813', 'Sep 4', '$131.45', 'Expired'), ('Q-24812', 'Aug 28', '$481.87', 'Accepted')]


def qrow(i, d, tot, st):
    col = '#14803C' if st in ('Sent', 'Accepted') else '#4B5E52'
    amount = ('<div style="margin-top: 3px; font-weight: 800; font-variant-numeric: tabular-nums">%s</div>' % tot) if tot else '<div style="margin-top: 3px; color: #6A7F73; font-size: 13px">Brandi is pricing this quote</div>'
    return ('<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-top: 1px solid #E3EAE5">'
            '<div><div style="display: flex; gap: 10px; align-items: baseline"><span style="font-weight: 800">%s</span><span style="font-family: Geist Mono, monospace; font-size: 11.5px; color: #70847A">%s</span></div>%s</div>'
            '<span style="font-weight: 700; color: %s; font-size: 13.5px; text-align: right">%s</span></div>') % (i, d, amount, col, st)


QUOTES_PANEL = ('<aside style="flex: 0 0 360px; align-self: stretch; height: 900px; background: #fff; border-left: 1px solid #E3EAE5; display: flex; flex-direction: column">'
                '<div style="display: flex; align-items: center; gap: 12px; padding: 24px 20px 16px"><span style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em">Your quotes</span>'
                '<span style="font-family: Geist Mono, monospace; font-size: 12px; background: #E4EAE5; padding: 1px 8px; border-radius: 999px">28</span><span style="margin-left: auto">' + FILTBTN + '</span></div>'
                '<div style="flex: 1 1 auto; min-height: 0; overflow-y: auto">' + ''.join(qrow(*q) for q in LIST)
                + '<div style="padding: 14px 20px; border-top: 1px solid #E3EAE5; text-align: center"><button style="height: 36px; padding: 0 20px; border: 1px dashed #8FA699; background: transparent; border-radius: 9px; color: #2F4A3A; font-weight: 700">Show 19 more</button></div></div></aside>')


def logo(size, color):
    return ('<svg width="%d" height="%d" viewBox="10 10 80 80" fill="none" stroke="%s" stroke-width="7.5" stroke-linecap="round" role="img" aria-label="Querent">'
            '<circle cx="49" cy="49" r="28.5"/><path d="M60 60 81 82"/></svg>') % (size, size, color)


# ------------------------------------------------------------------ quote preview modals
def meta(label, value):
    return '<div><div style="color: #6A7F73; font-size: 13px">%s</div><div style="font-weight: 800; font-size: 17px; margin-top: 2px">%s</div></div>' % (label, value)


def kv(k, v):
    return '<div style="display: flex; padding: 5px 0; border-bottom: 1px solid #D5D5D5; font-size: 12.5px"><span style="flex: 0 0 120px; color: #666">%s</span><span>%s</span></div>' % (k, v)


def modal(title, status, metas, body, foot_text, buttons, download):
    dl = ('<button style="height: 40px; padding: 0 16px; border: 1px solid #CBD7CF; background: #fff; border-radius: 10px; font-weight: 700; '
          'display: flex; align-items: center; gap: 8px">%sDownload</button>') % ic(DLP, 17) if download else ''
    head = ('<div style="flex: none; padding: 22px 32px 18px; display: flex; align-items: flex-start; gap: 16px; background: #fff">'
            '<div><div style="display: flex; align-items: baseline; gap: 12px"><span style="font-size: 24px; font-weight: 800; letter-spacing: -0.02em">%s</span>%s</div>'
            '<div style="display: flex; gap: 32px; margin-top: 12px">%s</div></div>'
            '<div style="margin-left: auto; display: flex; gap: 12px; align-items: center">%s<button aria-label="Close" style="width: 40px; height: 40px; border: 0; '
            'background: transparent; color: #151D18; display: flex; align-items: center; justify-content: center">%s</button></div></div>') % (title, status, ''.join(metas), dl, ic(CLOSEP, 20))
    foot = ('<div style="flex: none; border-top: 1px solid #E3EAE5; padding: 16px 32px; display: flex; align-items: center; gap: 12px; background: #fff">'
            '<span style="color: #4B5E52; flex: 1">%s</span>%s</div>') % (foot_text, buttons)
    return ('<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(15,30,20,0.5); display: flex; align-items: center; justify-content: center; z-index: 10">'
            '<div style="width: 920px; height: 820px; background: #fff; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 30px 80px rgba(0,0,0,0.35)">'
            + head + '<div style="flex: 1 1 auto; min-height: 0; overflow: hidden; background: #EEF3EF">' + body + '</div>' + foot + '</div></div>')


def btn(label, kind, off=False):
    st = {'accept': 'background: #14803C; color: #fff; border: 0', 'decline': 'background: #fff; color: #C92A1C; border: 1px solid #E8A8A0',
          'changes': 'background: #fff; color: #151D18; border: 1px solid #CBD7CF'}[kind]
    return '<button style="height: 44px; padding: 0 20px; border-radius: 10px; font-weight: 800; %s%s">%s</button>' % (st, '; opacity: 0.45' if off else '', label)


def sheet():
    th = 'font-size: 10.5px; letter-spacing: 0.08em; font-weight: 800; text-transform: uppercase'
    details = ''.join([kv('Quote number', 'Q-24791 rev 1'), kv('Date', 'Oct 9, 2026'), kv('Valid until', 'Oct 23, 2026'),
                       kv('Customer PO', 'To be added'), kv('Terms', 'Net 30'), kv('Sales rep', 'Brandi Gallegos')])
    cols = 'grid-template-columns: 24px 90px 1fr 40px 90px 80px 80px'
    return ('<div style="padding: 20px 40px 0"><div style="display: flex; justify-content: space-between; align-items: center; color: #4B5E52; font-size: 13.5px"><span>1 page</span>'
            '<button style="height: 36px; padding: 0 14px; border: 1px solid #CBD7CF; background: #fff; border-radius: 9px; font-weight: 700; display: flex; align-items: center; gap: 7px; color: #151D18">%sZoom in</button></div>'
            '<div style="margin-top: 14px; background: #fff; font-family: Arial, sans-serif; color: #111; padding: 34px 36px 0; height: 560px; overflow: hidden; box-sizing: border-box">'
            '<div style="display: flex; justify-content: space-between"><div style="display: flex; gap: 14px"><div style="width: 54px; height: 54px; border: 2px solid #111; display: flex; align-items: center; justify-content: center; font-family: Georgia, serif; font-size: 32px; font-weight: 700; flex: none">H</div>'
            '<div style="font-size: 12px; line-height: 1.45"><div style="font-size: 19px; font-weight: 700; letter-spacing: 0.02em">Herrick Industrial Supply</div>Salt Lake City branch<br>1480 W 2100 S<br>Salt Lake City, UT 84119<br>Phone (801) 555-0120 &middot; herrickindustrial.com</div></div>'
            '<div style="text-align: right"><span style="display: inline-block; border: 1px solid #111; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 2px 8px">SAMPLE DATA</span><div style="font-size: 27px; font-weight: 700; letter-spacing: 0.04em; margin-top: 10px">QUOTATION</div><div style="font-size: 12.5px; margin-top: 2px">Q-24791 &nbsp;&middot;&nbsp; Rev 1</div></div></div>'
            '<div style="border-top: 2px solid #111; margin-top: 18px"></div>'
            '<div style="display: flex; gap: 40px; margin-top: 16px"><div style="flex: 1"><div style="%s; color: #444">Quote for</div><div style="font-weight: 700; margin-top: 10px">Wasatch Mechanical Contractors</div><div style="font-size: 12px; margin-top: 3px">Attn: Dana Ortiz<br>Account WAS-1142</div>'
            '<div style="%s; color: #444; margin-top: 18px">Will call</div><div style="font-size: 12px; margin-top: 8px">Pick up at Salt Lake City branch<br>1480 W 2100 S, Salt Lake City, UT 84119</div></div>'
            '<div style="flex: 1"><div style="%s; color: #444">Quote details</div><div style="margin-top: 8px">%s</div></div></div>'
            '<div style="margin-top: 22px; border-top: 2px solid #111; border-bottom: 1px solid #111; padding: 7px 0; display: grid; %s; font-size: 10px; font-weight: 700; letter-spacing: 0.08em"><span>#</span><span>SKU</span><span>DESCRIPTION</span><span style="text-align: right">QTY</span><span style="padding-left: 10px">UNIT</span><span style="text-align: right">UNIT PRICE</span><span style="text-align: right">EXTENDED</span></div>'
            '<div style="padding: 9px 0; border-bottom: 1px solid #ccc; display: grid; %s; font-size: 12px"><span>1</span><span style="font-family: monospace; font-size: 10.5px">DT-2-60</span><span>Duct tape 2 in x 60 yd, silver</span><span style="text-align: right">1</span><span style="padding-left: 10px">Case of 24</span><span style="text-align: right">$96.00</span><span style="text-align: right">$96.00</span></div>'
            '<div style="margin: 20px 0 0 auto; width: 300px; font-size: 12px"><div style="display: flex; justify-content: space-between; padding: 4px 0"><span>Subtotal</span><span>$96.00</span></div>'
            '<div style="display: flex; justify-content: space-between; padding: 4px 0"><span>Freight<br><span style="font-size: 10px; color: #555">Will call at SLC</span></span><span>$0.00</span></div>'
            '<div style="display: flex; justify-content: space-between; padding: 4px 0"><span>Sales tax</span><span>Added on invoice</span></div>'
            '<div style="display: flex; justify-content: space-between; padding: 8px 0; margin-top: 4px; border-top: 2px solid #111; font-weight: 700; font-size: 14px"><span>Total</span><span>$96.00</span></div></div>'
            '</div></div>') % (ic(ZOOMP, 16), th, th, th, details, cols, cols)


def pricing():
    return ('<div style="height: 100%; display: flex; align-items: center; justify-content: center"><div style="width: 560px; box-sizing: border-box; background: #fff; border-radius: 14px; padding: 30px 32px; text-align: center">'
            '<div style="color: #14803C; display: flex; justify-content: center">' + ic(CLOCKP, 34) + '</div><div style="font-weight: 800; font-size: 19px; margin-top: 10px">Brandi is pricing this quote</div>'
            '<div style="color: #4B5E52; margin-top: 8px; line-height: 1.45">It opens here once Brandi sends it, and a message with the total arrives in your chat.</div>'
            '<div style="display: flex; gap: 20px; justify-content: center; margin-top: 14px; color: #14803C"><span style="display: flex; gap: 8px; align-items: center">' + ic(PHONE, 16)
            + '(801) 111-2222</span><span style="display: flex; gap: 8px; align-items: center">' + ic(MAIL, 16) + 'brandi.gallegos@herrickindustrial.com</span></div></div></div>')


VARIANTS = [
    ('CV1', 'Customer Page', ''),
    ('CV2', 'Customer Quote Sent',
     modal('Quote Q-24791', '<span style="font-weight: 800; color: #14803C; font-size: 15px">Sent</span>',
           [meta('Total', '$96.00'), meta('Valid until', 'Oct 23'), meta('Revision', '1 of 1')], sheet(),
           'Accept it with a pickup time and your PO, or ask Brandi for changes.',
           btn('Decline', 'decline') + btn('Request changes', 'changes') + btn('Accept', 'accept'), True)),
    ('CV3', 'Customer Quote Awaiting Rep',
     modal('Quote Q-24817', '<span style="font-weight: 800; color: #4B5E52; font-size: 15px">Awaiting rep</span>', [meta('Requested', 'Oct 9')], pricing(),
           'You can accept it or ask for changes once Brandi sends it.',
           btn('Decline', 'decline', True) + btn('Request changes', 'changes', True) + btn('Accept', 'accept', True), False)),
]


TEMPLATE = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>@@TITLE@@</title>
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
  @@RAIL@@
  <main style="flex: 1 1 auto; min-width: 0; height: 900px; box-sizing: border-box; background: #D9E3DC; padding: 24px 32px 20px; display: flex; flex-direction: column">
    <div style="display: flex; flex-wrap: nowrap; align-items: flex-start; gap: 12px 20px">
      <div><h1 style="margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -0.035em">Wasatch Mechanical Contractors</h1>
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 4px; color: #4B5E52">via Querent<span style="display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px; background: #fff; border: 1px solid #CBD7CF; color: #14803C; font-weight: 800; font-size: 12.5px"><span style="width: 7px; height: 7px; border-radius: 50%; background: #14803C"></span>Connected</span><span style="color: #6A7F73; font-size: 12.5px">Last updated 01:38:46 AM</span></div></div>
      <div style="display: flex; align-items: center; gap: 10px; margin-left: auto"><button style="height: 40px; padding: 0 18px; border: 0; background: #14803C; color: #fff; border-radius: 10px; font-weight: 800; display: flex; align-items: center; gap: 8px; white-space: nowrap">@@DOC@@Request a quote</button>@@BELL@@</div>
    </div>
    <div style="flex: 1 1 auto; min-height: 0; margin-top: 20px; background: #fff; border-radius: 14px; display: flex; flex-direction: column; padding: 16px 40px 20px; box-sizing: border-box">
      <div style="display: flex; justify-content: flex-end"><button style="height: 38px; padding: 0 14px; border: 1px solid #CBD7CF; background: #fff; border-radius: 9px; font-weight: 600; display: flex; align-items: center; gap: 8px; white-space: nowrap">@@PLUS@@New conversation</button></div>
      <div style="flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: center; max-width: 880px; width: 100%; margin: 0 auto">
        @@LOGO2@@
        <div style="margin-top: 22px; font-size: 13px; font-weight: 800; letter-spacing: 0.14em; color: #14803C">HERRICK INDUSTRIAL SUPPLY</div>
        <h2 style="margin: 10px 0 0; font-size: 52px; line-height: 1.02; font-weight: 800; letter-spacing: -0.04em">Your business.<br>Your answers.</h2>
        <div style="margin-top: 14px; font-size: 18px; color: #4B5E52">Ask about stock, pricing, orders and quotes.</div>
        <div style="margin-top: 26px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px">@@CHIPS@@</div>
      </div>
      <div style="flex: none; border: 1px solid #CBD7CF; border-radius: 14px; height: 64px; box-sizing: border-box; padding: 0 12px 0 22px; display: flex; align-items: center; gap: 12px; background: #fff; max-width: 880px; width: 100%; margin: 0 auto">
        <span style="flex: 1; color: #6A7F73; font-size: 16px">Ask about stock, pricing, orders...</span>
        <button aria-label="Send" style="width: 44px; height: 44px; border: 0; border-radius: 11px; background: #14803C; color: #fff; display: flex; align-items: center; justify-content: center">@@SEND@@</button>
      </div>
      <div style="text-align: center; color: #6A7F73; font-size: 12.5px; margin-top: 10px">Customer data, finally customer-facing.</div>
    </div>
  </main>
  @@QUOTES@@
  @@OVERLAY@@
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

for name, ttl, overlay in VARIANTS:
    html = TEMPLATE
    for k, v in [('OVERLAY', overlay), ('TITLE', ttl), ('BELL', BELL), ('DOC', ic(DOCP, 17)), ('LOGO2', logo(52, '#14803C')), ('RAIL', RAIL),
                 ('CHIPS', ''.join(chip(c) for c in CHIPS)), ('PLUS', ic(PLUS, 16)), ('SEND', ic(SEND, 20)), ('QUOTES', QUOTES_PANEL)]:
        html = html.replace('@@%s@@' % k, v)
    assert '@@' not in html
    open(os.path.join(OUT, name + '.dc.html'), 'w', encoding='utf-8', newline='\n').write(html)
print('ok')
