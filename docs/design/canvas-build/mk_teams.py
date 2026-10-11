import json
_o = open(r"mk_orders.py", encoding="utf-8").read()
exec(_o[:_o.index("wr('ORBase.dc.html'")])   # helpers: rail, check, fld, lab, kv, card, ICONS, HEAD_HTML, svg, wr, P ...

def tpage(title, body, overlay=''):
    s = HEAD_HTML
    for k, v in [('@@TITLE@@', title), ('@@CANVAS@@', CANVAS), ('@@INK@@', INK), ('@@RAIL@@', rail(5)), ('@@BODY@@', body)]:
        s = s.replace(k, v)
    if overlay:
        s = s.replace('</main>\n</div>\n</x-dc>', '</main>\n' + overlay + '\n</div>\n</x-dc>')
    return s

SCRIM = '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(15,35,25,0.45); z-index: 20"></div>'

def switch(on=True):
    return '<span style="position: relative; width: 40px; height: 22px; border-radius: 999px; background: %s; display: block"><span style="position: absolute; top: 3px; %s; width: 16px; height: 16px; border-radius: 50%%; background: #fff"></span></span>' % (ACC if on else '#B9C6BE', 'right: 3px' if on else 'left: 3px')

def btn(label, primary=False, small=False, danger=False):
    h = 34 if small else 42
    if primary:
        return '<span style="height: %dpx; padding: 0 %dpx; border-radius: 10px; background: %s; color: #fff; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap">%s</span>' % (h, 16 if small else 24, ACC, label)
    return '<span style="height: %dpx; padding: 0 %dpx; border-radius: 10px; border: 1px solid %s; background: #fff; font-weight: 700; display: inline-flex; align-items: center; white-space: nowrap">%s</span>' % (h, 14 if small else 20, LINE, label)

REPS = [('Brandi Gallegos', 'Inside Sales', 'Inside Sales', True, [('Canyon Ridge Builders', 'CRB-3318'), ('Great Basin Fabrication', 'GBF-2207'), ('Wasatch Mechanical Contractors', 'WAS-1142')]),
        ('Eli Porter', 'Outside Sales', 'Field Sales', True, [('Utah Valley Electric', 'UVE-5126'), ('Weber Basin Fabricators', 'WBF-6074')]),
        ('Mara Jensen', 'Inside Sales', 'Inside Sales', True, []),
        ('Nora Chen', 'Counter Sales', 'Field Sales', True, [('Uinta Facility Services', 'UFS-4051')])]
RG = 'minmax(180px, 1.6fr) 1.2fr 1.1fr 70px'

def cust_line(name, code, extra=''):
    return ('<div style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 10px; background: #F2F6F3"><div style="flex: 1"><span style="font-weight: 700">%s</span> <span style="font-family: %s; font-size: 12px; color: %s">%s</span></div>'
            '<button aria-label="Disconnect %s" style="width: 28px; height: 28px; border: 1px solid %s; background: #fff; border-radius: 8px; color: #6A7F73; font-size: 15px; padding: 0">x</button>%s</div>' % (name, MONO, MUT, code, name, LINE, extra))

def rep_row(r, expanded=False, connect_overlay=''):
    name, role, team, active, custs = r
    n = len(custs)
    toggle = '<button style="height: 28px; padding: 0 12px; border: 1px solid %s; background: #fff; border-radius: 8px; font-weight: 700; color: %s; font-size: 12.5px; white-space: nowrap">%s</button>' % (LINE, MUT, ('Hide customers' if expanded else ('%d customer%s' % (n, '' if n == 1 else 's'))))
    row = ('<div style="display: grid; grid-template-columns: %s; gap: 14px; align-items: center; padding: 14px 20px"><div style="display: flex; align-items: center; gap: 12px"><span style="font-weight: 800">%s</span>%s</div><div>%s</div><div>%s</div><div>%s</div></div>'
           % (RG, name, toggle, role, team, switch(active)))
    body = ''
    if expanded:
        lines = ''.join('<div style="margin-top: 8px">' + cust_line(c, k) + '</div>' for c, k in custs)
        body = ('<div style="padding: 0 20px 16px 20px"><div style="font-size: 12.5px; font-weight: 700; color: %s; margin-bottom: 2px">Customers for %s</div>%s'
                '<div style="position: relative; margin-top: 8px"><button style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%%; height: 42px; border: 1px dashed #8FA699; background: transparent; border-radius: 10px; color: #2F4A3A; font-weight: 700"><span style="font-size: 20px; line-height: 1">+</span>Connect a customer</button>%s</div></div>' % (MUT, name, lines, connect_overlay))
    return '<div style="border-top: 1px solid #E3EAE5; background: %s">%s%s</div>' % ('#fff', row, body)

def reps_panel(expanded_name=None, connect_overlay=''):
    heads = ['Rep name', 'Role', 'Team', 'Active']
    hh = ''.join('<div style="text-align: %s">:: %s</div>' % ('left', h) for h in heads)
    rows = ''.join(rep_row(r, r[0] == expanded_name, connect_overlay if r[0] == expanded_name else '') for r in REPS)
    return ('<section style="background: #fff; border-radius: 14px; overflow: visible; flex: 1.7 1 560px; min-width: 0"><div style="display: flex; align-items: center; gap: 14px; padding: 12px 20px; background: %s; color: #fff; border-radius: 14px 14px 0 0"><span style="font-weight: 800; font-size: 16px">Reps</span>'
            '<span style="color: #CFE6D6; font-size: 13px">4 reps. Managers are not listed.</span><span style="margin-left: auto; height: 34px; padding: 0 20px; border-radius: 9px; background: #7FDBA0; color: %s; font-weight: 800; display: inline-flex; align-items: center">Save</span></div>'
            '<div style="display: grid; grid-template-columns: %s; gap: 14px; padding: 10px 20px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40">%s</div>%s'
            '<div style="height: 6px; border-radius: 0 0 14px 14px"></div></section>' % (HEAD, DARK, RG, hh, rows))

TEAMS = [('Inside Sales', ['Brandi Gallegos', 'Mara Jensen']), ('Field Sales', ['Eli Porter', 'Nora Chen'])]

def teams_panel(selected=None):
    actions = ''
    if selected:
        actions = ('<div style="display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px; background: #EEF6F0; border-bottom: 1px solid #D5E5DA"><span style="font-weight: 800; align-self: center; margin-right: 4px">%s</span>%s%s%s</div>' % (selected, btn('Add to team', False, True), btn('Remove from team', False, True), btn('Move into other team', False, True)))
    rows = ''
    for t, members in TEAMS:
        sel = t == selected
        box = '<span style="width: 16px; height: 16px; border-radius: 4px; border: 2px solid %s; background: %s; display: inline-block; flex: none"></span>' % (ACC, ACC if sel else '#fff')
        chips = ''
        if sel:
            chips = '<div style="display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 14px 44px">' + ''.join('<span style="padding: 5px 12px; border-radius: 999px; background: #E4EAE5; font-weight: 600; font-size: 13px">%s</span>' % m for m in members) + '</div>'
        rows += ('<div style="border-top: 1px solid #E3EAE5; background: %s"><div style="display: flex; align-items: center; gap: 12px; padding: 14px 16px">%s<span style="font-weight: 800">%s</span><span style="margin-left: auto; color: %s">%d reps</span></div>%s</div>' % ('#F7FAF8' if sel else '#fff', box, t, MUT, len(members), chips))
    return ('<section style="background: #fff; border-radius: 14px; overflow: hidden; flex: 1 1 340px; min-width: 0"><div style="display: flex; align-items: center; gap: 14px; padding: 12px 16px; background: %s; color: #fff"><span style="font-weight: 800; font-size: 16px">Teams</span>'
            '<span style="margin-left: auto; height: 34px; padding: 0 16px; border-radius: 9px; background: #7FDBA0; color: %s; font-weight: 800; display: inline-flex; align-items: center">Create team</span></div>%s'
            '<div style="padding: 10px 16px; background: #E4EAE5; font-size: 12.5px; font-weight: 800; color: #3A4A40">:: Team</div>%s</section>' % (HEAD, DARK, actions, rows))

def body_page(expanded_name=None, connect_overlay='', selected_team=None):
    head = ('<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px"><div><h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: -0.035em">Teams and Reps</h1><div style="color: ' + MUT + '; margin-top: 2px">Who is on your team and which customers they own</div></div>' + ICONS + '</div>')
    return head + '<div style="display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; margin-top: 22px">' + reps_panel(expanded_name, connect_overlay) + teams_panel(selected_team) + '</div>'

def dialog(title, inner, buttons, width=560, top=150):
    return (SCRIM + '<div style="position: absolute; left: 50%%; top: %dpx; margin-left: -%dpx; width: %dpx; box-sizing: border-box; background: #fff; border-radius: 16px; box-shadow: 0 28px 60px rgba(15,35,25,0.4); z-index: 30; padding: 26px 28px; color: %s">'
            '<div style="font-size: 22px; font-weight: 800; line-height: 1.2">%s</div>%s<div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px">%s</div></div>' % (top, width // 2, width, INK, title, inner, buttons))

def radio(label, sub, sel):
    dot = '<span style="width: 18px; height: 18px; border-radius: 50%%; border: 2px solid %s; display: flex; align-items: center; justify-content: center; flex: none">%s</span>' % (ACC if sel else '#9DB0A5', ('<span style="width: 8px; height: 8px; border-radius: 50%%; background: %s"></span>' % ACC) if sel else '')
    return '<div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; border: %s; background: %s; margin-top: 8px">%s<div style="flex: 1"><div style="font-weight: 800">%s</div><div style="font-size: 12.5px; color: %s">%s</div></div></div>' % ('2px solid ' + ACC if sel else '1px solid ' + LINE, '#EEF6F0' if sel else '#fff', dot, label, MUT, sub)

def checkrow(label, sub, on=False):
    box = '<span style="width: 16px; height: 16px; border-radius: 4px; border: 2px solid %s; background: %s; display: inline-block; flex: none; margin-top: 2px"></span>' % (ACC, ACC if on else '#fff')
    return '<div style="display: flex; gap: 10px; padding: 12px 14px; border-radius: 10px; background: #F2F6F3; margin-top: 14px">%s<div><div style="font-weight: 700">%s</div><div style="font-size: 12.5px; color: %s; margin-top: 2px">%s</div></div></div>' % (box, label, MUT, sub)

MOVE_OPEN = checkrow("Also move this customer's open quotes", "Drafts, change requests and sent quotes that haven't expired go to the new rep, each with an Activity entry.")

DISCONNECT = dialog('Disconnect Canyon Ridge Builders?',
    '<div style="color: %s; margin-top: 8px; line-height: 1.45">Every customer needs a rep. Pick who takes Canyon Ridge Builders from Brandi Gallegos.</div>' % MUT
    + radio('Eli Porter', '2 customers', False) + radio('Mara Jensen', 'No customers yet', True) + radio('Nora Chen', '1 customer', False) + MOVE_OPEN,
    btn('Cancel') + btn('Disconnect and reassign', True))

APPROVE = dialog('Utah Valley Electric is with Eli Porter',
    '<div style="color: %s; margin-top: 8px; line-height: 1.45">Connecting it to Brandi Gallegos takes it off Eli Porter. Eli will keep 1 customer.</div>' % MUT + MOVE_OPEN.replace("Also move this customer's open quotes", "Also move this customer's open quotes (12 quotes)"),
    btn('Cancel') + btn('Move to Brandi Gallegos', True), 540, 200)

CREATE = dialog('Create team',
    fld('Team name', 'Counter and Yard') + '<div style="font-size: 12px; font-weight: 700; color: %s; margin: 4px 0 2px">Add reps</div>' % MUT
    + '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px">' + check('Brandi Gallegos', False) + check('Eli Porter', False) + check('Mara Jensen', False) + check('Nora Chen', True) + '</div>'
    + '<div style="height: 8px"></div>' + fld('Inside another team', 'None'),
    btn('Cancel') + btn('Create team', True), 520, 170)

MOVE_TEAM = dialog('Move Field Sales into another team',
    '<div style="color: %s; margin-top: 8px; line-height: 1.45">Reps in Field Sales stay in it, and also count in the team you pick.</div>' % MUT + radio('Inside Sales', '2 reps', True) + radio('No parent team', 'Field Sales stands on its own', False),
    btn('Cancel') + btn('Move team', True), 520, 190)

CONNECT_PICK = ('<div style="position: absolute; left: 0; right: 0; top: 48px; background: #fff; border: 1px solid #B9C9BF; border-radius: 12px; box-shadow: 0 18px 40px rgba(15,59,34,0.22); padding: 6px; z-index: 12">'
    '<div style="height: 40px; box-sizing: border-box; border: 2px solid %s; border-radius: 9px; display: flex; align-items: center; gap: 8px; padding: 0 12px; margin: 2px 2px 6px">%s<span style="color: #6A7F73">Search customers</span></div>' % (ACC, svg('M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M20 20l-4-4', 16, 2))
    + ''.join('<div style="display: flex; justify-content: space-between; gap: 12px; padding: 9px 12px; border-radius: 8px; background: %s"><div><span style="font-weight: 700">%s</span> <span style="font-family: %s; font-size: 12px; color: %s">%s</span></div><span style="color: %s; font-size: 13px">With %s</span></div>' % (bg, n, MONO, MUT, c, MUT, r) for bg, n, c, r in [('#E3F1E8', 'Utah Valley Electric', 'UVE-5126', 'Eli Porter'), ('transparent', 'Weber Basin Fabricators', 'WBF-6074', 'Eli Porter'), ('transparent', 'Uinta Facility Services', 'UFS-4051', 'Nora Chen')])
    + '<div style="padding: 6px 12px 2px; font-size: 11.5px; color: %s">Customers that already have a rep ask you to confirm the move.</div></div>' % MUT)

wr('TRBase.dc.html', tpage('Teams and Reps', body_page()))
wr('TR1.dc.html', tpage('Teams and Reps rep expanded', body_page('Brandi Gallegos')))
wr('TR2.dc.html', tpage('Teams and Reps disconnect', body_page('Brandi Gallegos'), DISCONNECT))
wr('TR3.dc.html', tpage('Teams and Reps connect', body_page('Brandi Gallegos', CONNECT_PICK)))
wr('TR4.dc.html', tpage('Teams and Reps move approval', body_page('Brandi Gallegos'), APPROVE))
wr('TR5.dc.html', tpage('Teams and Reps team selected', body_page(None, '', 'Field Sales')))
wr('TR6.dc.html', tpage('Teams and Reps create team', body_page(), CREATE))
wr('TR7.dc.html', tpage('Teams and Reps move team', body_page(None, '', 'Field Sales'), MOVE_TEAM))

# ---------- canvas ----------
cj = json.load(open(P + "\\canvas.json", encoding="utf-8"))
def put(f, title, x, y):
    cj['boards'][f] = {'expand': 'fill', 'h': 900, 'w': 1440, 'x': x, 'y': y, 'title': title, 'page': 'quote'}
    if f not in cj['order']:
        cj['order'].append(f)
names = [('TRBase.dc.html', 'Teams and Reps'), ('TR1.dc.html', 'Rep customers'), ('TR2.dc.html', 'Disconnect a customer'), ('TR3.dc.html', 'Connect a customer'), ('TR4.dc.html', 'Move approval'), ('TR5.dc.html', 'Team selected'), ('TR6.dc.html', 'Create team'), ('TR7.dc.html', 'Move team')]
for i, (f, t) in enumerate(names):
    put(f, t, 1520 * i, 15100)
cj['notes']['tr1'] = {'kind': 'title1', 'maxW': 11000, 'size': 200, 'w': 240, 'text': 'Teams and Reps', 'x': -1474, 'y': 15337, 'page': 'quote'}
cj['notes']['tr2'] = {'text': 'Replaces the Team tab and the Reps and Rep assignments settings. Assignments only, no analytics. The leaderboard and decline numbers from the old Team tab belong on Analytics.', 'x': 1520, 'y': 14760, 'w': 560, 'page': 'quote'}
json.dump(cj, open(P + "\\canvas.json", "w", encoding="utf-8", newline="\n"), indent=2, ensure_ascii=False)
print('ok', len(cj['boards']))
