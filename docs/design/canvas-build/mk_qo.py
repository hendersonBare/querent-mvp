import json
P = r"design\project"

def rd(n):
    return open(P + "\\" + n, encoding="utf-8").read()

def wr(n, s):
    open(P + "\\" + n, "w", encoding="utf-8", newline="\n").write(s)

def must(s, old, new, count=1):
    assert s.count(old) >= 1, "missing: " + old[:80]
    return s.replace(old, new, count)

BOARD = rd("KBoardSolid.dc.html")
TABLE = rd("KTableSolid.dc.html")
KBOARD = rd("KBoard.dc.html")
KTABLE = rd("KTable.dc.html")

# ---------- reusable overlay pieces ----------
def field(label, val):
    return ('<div style="margin-bottom: 10px"><div style="font-size: 12px; font-weight: 700; color: #4B5E52; margin-bottom: 4px">' + label +
            '</div><div style="height: 38px; box-sizing: border-box; border: 1px solid #CBD7CF; border-radius: 8px; display: flex; align-items: center; padding: 0 12px; color: #4B5E52">' + val + '</div></div>')

def check(label, on):
    box = ('<span style="width: 16px; height: 16px; border-radius: 4px; border: 2px solid #14803C; background: ' + ('#14803C' if on else '#fff') +
           '; display: inline-block; flex: none"></span>')
    return '<div style="display: flex; align-items: center; gap: 8px; padding: 5px 0">' + box + '<span>' + label + '</span></div>'

def filter_panel(pos):
    sts = ['Draft ready', 'Changes requested', 'Sent', 'Accepted', 'Expired', 'Declined']
    grid = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px">' + ''.join(check(s, True) for s in sts) + '</div>'
    return ('<div style="position: absolute; ' + pos + '; width: 390px; box-sizing: border-box; background: #fff; border: 1px solid #B9C9BF; border-radius: 14px; box-shadow: 0 20px 44px rgba(15,59,34,0.24); z-index: 6; padding: 18px; color: #151D18; font-size: 14px">'
            '<div style="font-weight: 800; font-size: 16px; margin-bottom: 12px">Filter quotes</div>'
            '<div style="font-size: 12px; font-weight: 700; color: #4B5E52; margin-bottom: 2px">Status</div>' + grid +
            '<div style="height: 8px"></div>' + field('Rep', 'All reps') + field('Customer', 'Any customer') +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">' + field('Requested from', 'Sep 1') + field('Requested to', 'Oct 10') + '</div>'
            '<div style="font-size: 12px; font-weight: 700; color: #4B5E52; margin: 2px 0">Only show</div>' +
            check('Overdue', False) + check('Aging', False) + check('Below margin floor', False) +
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px"><span style="font-weight: 700; color: #4B5E52">Clear all</span>'
            '<span style="height: 38px; padding: 0 22px; border-radius: 9px; background: #14803C; color: #fff; font-weight: 700; display: flex; align-items: center">Apply filters</span></div></div>')

def columns_panel(pos):
    rows = [('Quote', True, True), ('Customer', True, False), ('Requested', True, False), ('Status', True, False), ('Total', True, False), ('Margin', True, False),
            ('Rep', False, False), ('Valid until', False, False), ('Purchasing agent', False, False)]
    out = ''
    for lab, on, lock in rows:
        box = ('<span style="width: 16px; height: 16px; border-radius: 4px; border: 2px solid ' + ('#9DB0A5' if lock else '#14803C') + '; background: ' + ('#9DB0A5' if lock else ('#14803C' if on else '#fff')) + '; display: inline-block; flex: none"></span>')
        out += ('<div style="display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; background: ' + ('#EEF3EF' if on else 'transparent') + '"><span style="color: #8DA195">::</span>' + box + '<span style="font-weight: 600">' + lab + '</span>' + ('<span style="margin-left: auto; font-size: 12px; color: #6A7F73">Always shown</span>' if lock else '') + '</div>')
    return ('<div style="position: absolute; ' + pos + '; width: 320px; box-sizing: border-box; background: #fff; border: 1px solid #B9C9BF; border-radius: 14px; box-shadow: 0 20px 44px rgba(15,59,34,0.24); z-index: 6; padding: 14px; color: #151D18; font-size: 14px">'
            '<div style="font-weight: 800; font-size: 16px; padding: 2px 10px 8px">Choose columns</div>' + out +
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding: 0 10px"><span style="font-weight: 700; color: #4B5E52">Reset to default</span>'
            '<span style="height: 36px; padding: 0 20px; border-radius: 9px; background: #14803C; color: #fff; font-weight: 700; display: flex; align-items: center">Done</span></div></div>')

def picker_list(items, hint):
    out = ''
    for i, (n, c) in enumerate(items):
        out += ('<div style="display: flex; justify-content: space-between; padding: 9px 10px; border-radius: 8px; background: ' + ('#E3F1E8' if i == 0 else 'transparent') + '"><span style="font-weight: 600">' + n + '</span><span style="font-family: \'Geist Mono\', monospace; font-size: 11.5px; color: #5C6E62">' + c + '</span></div>')
    return ('<div style="position: absolute; top: 48px; left: 0; width: 360px; box-sizing: border-box; background: #fff; border: 1px solid #B9C9BF; border-radius: 12px; box-shadow: 0 18px 40px rgba(15,59,34,0.22); padding: 5px; z-index: 6; font-size: 14px; color: #151D18; font-weight: 500">' + out +
            '<div style="padding: 7px 10px 3px; font-size: 11.5px; color: #5C6E62; border-top: 1px solid #E3EAE5; margin-top: 4px">' + hint + '</div></div>')

CUST5 = [('All customers', ''), ('Wasatch Mechanical Contractors', 'WAS-1142'), ('Canyon Ridge Builders', 'CRB-3318'), ('Bonneville Electric Supply', 'BES-2207'), ('Summit Plumbing and Heating', 'SPH-0931')]

def dd_panel(pos, header, items):
    out = '<div style="background: #0F3B22; color: #fff; padding: 12px 16px; font-weight: 800">' + header + '</div>'
    for a, b, tag in items:
        out += ('<div style="padding: 12px 16px; border-top: 1px solid #E3EAE5"><div style="display: flex; justify-content: space-between; gap: 10px"><span style="font-weight: 800">' + a + '</span><span style="font-size: 12.5px; font-weight: 700; color: ' + ('#C92A1C' if tag else '#6A7F73') + '">' + tag + '</span></div>'
                '<div style="font-size: 13.5px; color: #3B4A40; margin-top: 2px">' + b + '</div></div>')
    return ('<div style="position: absolute; ' + pos + '; width: 360px; box-sizing: border-box; background: #fff; border: 1px solid #B9C9BF; border-radius: 14px; box-shadow: 0 20px 44px rgba(15,59,34,0.24); overflow: hidden; z-index: 6; color: #151D18; font-size: 14px">' + out + '</div>')

ATTN = dd_panel('top: 50px; right: 50px', '3 need your attention', [('Q-24790', 'Dana Ortiz asked to move pickup to Ogden.', 'Overdue'), ('Q-24817', 'Draft has 1 line below the margin floor.', 'Overdue'), ('Q-24789', 'Sent Oct 6, no reply yet.', 'Aging')])
NOTIF = dd_panel('top: 50px; right: 0', 'Notifications', [('Dana Ortiz replied on Q-24790', 'Oct 9, 4:12 PM', ''), ('Q-24763 accepted by Canyon Ridge', 'Sep 21, 9:40 AM', ''), ('Q-24815 expired', 'Sep 18', '')])

SCRIM = '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(15,35,25,0.45); z-index: 20"></div>'
SCRIM_LIGHT = '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(15,35,25,0.22); z-index: 20"></div>'

NOTE_MODAL = (SCRIM + '<div style="position: absolute; left: 50%; top: 230px; margin-left: -230px; width: 460px; box-sizing: border-box; background: #fff; border-radius: 16px; box-shadow: 0 28px 60px rgba(15,35,25,0.4); z-index: 30; padding: 24px; color: #151D18; font-size: 14.5px">'
    '<div style="display: flex; justify-content: space-between; align-items: flex-start"><div><div style="font-size: 20px; font-weight: 800">Note on Q-24790</div><div style="color: #4B5E52; margin-top: 2px">Dana Ortiz, Oct 9, 4:12 PM</div></div>'
    '<span style="width: 32px; height: 32px; border-radius: 8px; background: #EEF2F0; display: flex; align-items: center; justify-content: center">x</span></div>'
    '<div style="background: #FBE7A1; border-radius: 10px; padding: 14px 16px; margin-top: 16px; font-size: 16px; line-height: 1.45; color: #3D2E00">"Can you hold the anchors for pickup at Ogden instead?"</div>'
    '<div style="font-size: 12px; font-weight: 700; color: #4B5E52; margin: 16px 0 4px">Reply to Dana</div>'
    '<div style="height: 84px; box-sizing: border-box; border: 1px solid #CBD7CF; border-radius: 8px; padding: 10px 12px; color: #6A7F73">Write a reply</div>'
    '<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px"><span style="height: 40px; padding: 0 18px; border-radius: 9px; border: 1px solid #CBD7CF; font-weight: 600; display: flex; align-items: center">Close</span>'
    '<span style="height: 40px; padding: 0 22px; border-radius: 9px; background: #14803C; color: #fff; font-weight: 700; display: flex; align-items: center">Send reply</span></div></div>')

SIGNOUT_MODAL = (SCRIM + '<div style="position: absolute; left: 50%; top: 300px; margin-left: -210px; width: 420px; box-sizing: border-box; background: #fff; border-radius: 16px; box-shadow: 0 28px 60px rgba(15,35,25,0.4); z-index: 30; padding: 26px; color: #151D18; font-size: 14.5px">'
    '<div style="font-size: 20px; font-weight: 800">Sign out of Querent?</div>'
    '<div style="color: #4B5E52; margin-top: 8px; line-height: 1.45">You are signed in as Brian G., Manager at Herrick Industrial Supply.</div>'
    '<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px"><span style="height: 40px; padding: 0 18px; border-radius: 9px; border: 1px solid #CBD7CF; font-weight: 600; display: flex; align-items: center">Cancel</span>'
    '<span style="height: 40px; padding: 0 22px; border-radius: 9px; background: #0F3B22; color: #fff; font-weight: 700; display: flex; align-items: center">Sign out</span></div></div>')

PREVIEW = (SCRIM_LIGHT + '<aside style="position: absolute; top: 0; right: 0; bottom: 0; width: 400px; box-sizing: border-box; background: #fff; border-left: 1px solid #CBD7CF; padding: 26px 28px; box-shadow: -16px 0 40px rgba(15,59,34,0.20); z-index: 30; color: #151D18; font-size: 14.5px">'
    '<div style="display: flex; justify-content: space-between; align-items: flex-start"><div><div style="font-size: 26px; font-weight: 800; letter-spacing: -0.03em">Q-24790</div><div style="color: #4B5E52; margin-top: 2px">Wasatch Mechanical Contractors</div></div>'
    '<span style="width: 32px; height: 32px; border-radius: 8px; background: #EEF2F0; display: flex; align-items: center; justify-content: center">x</span></div>'
    '<div style="margin-top: 8px; font-weight: 700; color: #C92A1C">Overdue</div>'
    '<div style="display: flex; justify-content: space-between; margin: 16px 0; padding: 12px 0; border-top: 1px solid #E3EAE6; border-bottom: 1px solid #E3EAE6">'
    '<div><div style="font-size: 12px; color: #4B5E52">Total</div><div style="font-size: 22px; font-weight: 800">$1,164.00</div></div>'
    '<div style="text-align: center"><div style="font-size: 12px; color: #4B5E52">Requested</div><div style="font-size: 22px; font-weight: 800">Oct 8</div></div>'
    '<div style="text-align: right"><div style="font-size: 12px; color: #4B5E52">Margin</div><div style="font-size: 22px; font-weight: 800">34.9%</div></div></div>'
    '<div style="font-size: 12px; font-weight: 700; color: #4B5E52; margin-bottom: 6px">Status: Changes requested</div>'
    '<div style="background: #FBE7A1; border-radius: 10px; padding: 12px 14px"><div style="font-size: 12.5px; font-weight: 800; color: #5C4300">Dana Ortiz, Oct 9</div><div style="margin-top: 5px; font-size: 15.5px; line-height: 1.4; color: #3D2E00">"Can you hold the anchors for pickup at Ogden instead?"</div></div>'
    '<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 20px"><span style="height: 44px; border-radius: 10px; background: #14803C; color: #fff; font-weight: 700; font-size: 15px; display: flex; align-items: center; justify-content: center">Open quote</span>'
    '<span style="height: 44px; border-radius: 10px; border: 1px solid #CBD7CF; font-weight: 600; font-size: 15px; display: flex; align-items: center; justify-content: center">Reply to Dana</span></div></aside>')

# ---------- base transforms ----------
def root_rel(s, clip=False):
    old = 'style="min-height: 900px; display: flex; flex-wrap: nowrap; align-items: stretch;'
    new = 'style="position: relative; ' + ('height: 900px; overflow: hidden; ' if clip else 'min-height: 900px; ') + 'display: flex; flex-wrap: nowrap; align-items: stretch;'
    return must(s, old, new)

def end_overlay(s, html):
    return must(s, '</div>\n</x-dc>', html + '\n</div>\n</x-dc>')

def retitle(s, old, new):
    return must(s, '<title>' + old + '</title>', '<title>' + new + '</title>')

PICKER_BOX = 'width: 320px; max-width: 100%; box-sizing: border-box; height: 42px; border-radius: 10px; background: #fff; border: 1px solid #CBD7CF;'
PICKER_TAIL = '<span style="font-weight: 600">All customers</span>\n      </div>'

def with_picker(s, overlay, typed=None):
    s = must(s, PICKER_BOX, 'position: relative; ' + PICKER_BOX.replace('border: 1px solid #CBD7CF;', 'border: 2px solid #14803C;'))
    inner = '<span style="font-weight: 600">' + (typed + '</span><span style="width: 1px; height: 18px; background: #151D18"></span>' if typed else 'All customers</span>')
    return must(s, PICKER_TAIL, inner + '\n        ' + overlay + '\n      </div>')

FILTER_BTN_START = '<button style="height: 40px; padding: 0 14px; border: 1px solid #CBD7CF; background: #fff; border-radius: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px">'

def with_board_filter(s, overlay):
    a = s.index(FILTER_BTN_START)
    b = s.index('Filter</button>', a) + len('Filter</button>')
    return s[:a] + '<div style="position: relative">' + s[a:b].replace('border: 1px solid #CBD7CF', 'border: 2px solid #14803C') + overlay + '</div>' + s[b:]

def with_board_icons(s, overlay):
    anchor = '      </div>\n    </div>\n\n    <div style="display: flex; gap: 14px; overflow-x: auto'
    return must(s, anchor, '        ' + overlay + '\n' + anchor)

STATUS_ANCHOR = '      </button>\n    </div>\n\n    <div style="background: #fff; border: 1px solid #D5DED8;'

def with_status_overlay(s, overlay):
    return must(s, STATUS_ANCHOR, '      </button>\n      ' + overlay + '\n    </div>\n\n    <div style="background: #fff; border: 1px solid #D5DED8;')

# ---------- variants ----------
V = []  # (file, title, page-title, html)

# base views
V.append(('QOBoard.dc.html', 'Board view', 'Quote Overview Board', retitle(BOARD, 'Kelly Board Solid Heads', 'Quote Overview Board')))
V.append(('QOTable.dc.html', 'Table view', 'Quote Overview Table', retitle(TABLE, 'Kelly Table Solid Heads', 'Quote Overview Table')))

def bv(t):
    return retitle(BOARD, 'Kelly Board Solid Heads', t)

def tv(t):
    return retitle(TABLE, 'Kelly Table Solid Heads', t)

# B1 customer picker
s = root_rel(bv('Board Customer Picker'))
s = with_picker(s, picker_list(CUST5, 'Showing 5 of 14. Scroll to see more or type to search.'))
V.append(('QOB1.dc.html', 'B1 Customer picker', '', s))
# B2 filter
s = root_rel(bv('Board Filter'))
s = with_board_filter(s, filter_panel('top: 48px; left: 0'))
V.append(('QOB2.dc.html', 'B2 Filter', '', s))
# B3 attention
s = root_rel(bv('Board Needs Attention'))
s = with_board_icons(s, ATTN)
s = must(s, 'aria-label="Needs attention, 2 items" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid #E8A8A0;', 'aria-label="Needs attention, open" style="width: 40px; height: 40px; border-radius: 10px; border: 2px solid #C92A1C;')
V.append(('QOB3.dc.html', 'B3 Needs attention', '', s))
# B4 notifications
s = root_rel(bv('Board Notifications'))
s = with_board_icons(s, NOTIF)
s = must(s, 'aria-label="Notifications" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid #CBD7CF;', 'aria-label="Notifications, open" style="width: 40px; height: 40px; border-radius: 10px; border: 2px solid #14803C;')
V.append(('QOB4.dc.html', 'B4 Notifications', '', s))
# B5 preview
s = end_overlay(root_rel(bv('Board Quote Preview'), True), PREVIEW)
V.append(('QOB5.dc.html', 'B5 Quote preview', '', s))
# B6 note
s = end_overlay(root_rel(bv('Board View Note'), True), NOTE_MODAL)
V.append(('QOB6.dc.html', 'B6 View note', '', s))
# B7 show more (scrolled)
s = root_rel(bv('Board Show More'), True)
s = must(s, 'acc.slice(0, 7)', 'acc')
s = must(s, 'exp.slice(0, 5)', 'exp')
s = must(s, "'Show 13 more'", "'Show less'")
s = must(s, "'Show 2 more'", "'Show less'")
s = must(s, '<main style="flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 24px 32px 40px">', '<main style="flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 24px 32px 40px; transform: translateY(-1250px)">')
s = end_overlay(s, '<div style="position: absolute; top: 16px; right: 24px; z-index: 10; background: #0F3B22; color: #fff; font-weight: 700; font-size: 13px; padding: 7px 14px; border-radius: 999px">Scrolled down after Show more</div>')
V.append(('QOB7.dc.html', 'B7 Show more', '', s))
# B8 drag columns
s = root_rel(bv('Board Reorder Columns'))
s = must(s, '<section style="flex: 1 0 236px; background: #EEF3EF; border-radius: 12px; overflow: hidden">',
         '<section style="flex: 1 0 236px; background: #EEF3EF; border-radius: 12px; overflow: hidden; box-shadow: {{col.sh}}; transform: {{col.tf}}; outline: {{col.ol}}; outline-offset: 3px; position: relative; z-index: {{col.z}}">')
s = must(s, '    const alerts = [', "    cols.forEach((c, i) => { c.sh = i === 1 ? '0 24px 40px rgba(15,59,34,0.35)' : 'none'; c.tf = i === 1 ? 'rotate(2.5deg) translateY(-8px)' : 'none'; c.ol = i === 3 ? '3px dashed #14803C' : 'none'; c.z = i === 1 ? 5 : 1; });\n    const alerts = [")
V.append(('QOB8.dc.html', 'B8 Reorder columns', '', s))
# B9 sign out
s = end_overlay(root_rel(bv('Board Sign Out'), True), SIGNOUT_MODAL)
V.append(('QOB9.dc.html', 'B9 Sign out', '', s))

# table branches (filter and search now match the board view)
s = root_rel(tv('Table Filter'))
s = with_board_filter(s, filter_panel('top: 48px; left: 0'))
V.append(('QOT1.dc.html', 'T1 Filter', '', s))
s = end_overlay(root_rel(tv('Table Columns'), True), columns_panel('top: 138px; right: 40px'))
V.append(('QOT2.dc.html', 'T2 Columns', '', s))
s = end_overlay(root_rel(tv('Table Quote Preview'), True), PREVIEW)
V.append(('QOT3.dc.html', 'T3 Quote preview', '', s))
s = end_overlay(root_rel(tv('Table View Note'), True), NOTE_MODAL)
V.append(('QOT4.dc.html', 'T4 View note', '', s))
s = root_rel(tv('Table Show More'), True)
s = must(s, '.concat(acc, exp).slice(0, 13);', '.concat(acc, exp);')
s = must(s, 'Show 18 more quotes', 'Show fewer quotes')
s = must(s, '<main style="flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 24px 32px 40px">', '<main style="flex: 1 1 auto; min-width: 0; box-sizing: border-box; padding: 24px 32px 40px; transform: translateY(-1000px)">')
s = end_overlay(s, '<div style="position: absolute; top: 16px; right: 24px; z-index: 10; background: #0F3B22; color: #fff; font-weight: 700; font-size: 13px; padding: 7px 14px; border-radius: 999px">Scrolled down after Show more</div>')
V.append(('QOT5.dc.html', 'T5 Show more', '', s))
s = root_rel(tv('Table Reorder Columns'))
s = must(s, '<div>:: Status</div>', '<div style="position: relative"><span style="display: inline-block; padding: 5px 12px; margin: -5px 0 0 -6px; border-radius: 8px; background: #14803C; color: #fff; box-shadow: 0 14px 26px rgba(0,0,0,0.35); transform: rotate(-3deg)">:: Status</span></div>')
s = must(s, '<div>:: Customer</div>', '<div style="border-right: 3px solid #7FDBA0; padding-right: 8px">:: Customer</div>')
V.append(('QOT6.dc.html', 'T6 Reorder columns', '', s))
s = root_rel(tv('Table Customer Search'))
s = with_picker(s, picker_list([('Wasatch Mechanical Contractors', 'WAS-1142'), ('Wasatch Valley Roofing', 'WVR-5520')], '2 matches'), typed='Wasat')
V.append(('QOT7.dc.html', 'T7 Customer search', '', s))

for f, t, _, html in V:
    wr(f, html)

# ---------- canvas index ----------
cj = json.load(open(P + "\\canvas.json", encoding="utf-8"))
cj['pages'] = [{'id': 'explore', 'name': 'Home explorations'}, {'id': 'quote', 'name': 'Quote Overview'}]
cj['launch'] = {'view': 'canvas', 'page': 'quote'}
def put(f, title, x, y):
    cj['boards'][f] = {'expand': 'fill', 'h': 900, 'w': 1440, 'x': x, 'y': y, 'title': title, 'page': 'quote'}
    if f not in cj['order']:
        cj['order'].append(f)
put('QOBoard.dc.html', 'Board view', 0, 0)
put('QOTable.dc.html', 'Table view', 0, 3200)
bnames = ['QOB%d.dc.html' % i for i in range(1, 10)]
tnames = ['QOT%d.dc.html' % i for i in range(1, 8)]
for stale in ['QOT8.dc.html']:
    cj['boards'].pop(stale, None)
    if stale in cj['order']:
        cj['order'].remove(stale)
titles = {f: t for f, t, _, _ in V}
for i, f in enumerate(bnames):
    put(f, titles[f], 1760 + 1520 * (i % 5), 1020 * (i // 5))
for i, f in enumerate(tnames):
    put(f, titles[f], 1760 + 1520 * (i % 5), 3200 + 1020 * (i // 5))
cj['notes']['qo1'] = {'kind': 'title1', 'maxW': 9000, 'text': 'Quote Overview', 'x': 0, 'y': -560, 'page': 'quote'}
cj['notes']['qo2'] = {'kind': 'title1', 'maxW': 1440, 'text': 'Board view', 'x': 0, 'y': -300, 'page': 'quote'}
cj['notes']['qo3'] = {'text': 'Each frame to the right is one button on the board view, opened.', 'x': 1760, 'y': -300, 'w': 520, 'page': 'quote'}
cj['notes']['qo4'] = {'kind': 'title1', 'maxW': 1440, 'text': 'Table view', 'x': 0, 'y': 2900, 'page': 'quote'}
cj['notes']['qo5'] = {'text': 'Each frame to the right is one button on the table view, opened. Needs attention, notifications and sign out work the same as on the board.', 'x': 1760, 'y': 2900, 'w': 520, 'page': 'quote'}
json.dump(cj, open(P + "\\canvas.json", "w", encoding="utf-8", newline="\n"), indent=2, ensure_ascii=False)
print(len(V), 'files')
