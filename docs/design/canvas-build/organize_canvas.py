# Re-lays out the "New UI" page of the canvas into four labelled sections with consistent group titles.
# Usage: python -I organize_canvas.py <path to project/canvas.json>   (rewrites it in place)
# Run it only on a freshly read canvas.json, then publish.
import json, sys

p = sys.argv[1]
c = json.load(open(p, encoding='utf-8'))
PG = 'quote'
for b in ('CV2', 'CV3'):
    f = b + '.dc.html'
    if f not in c['boards']:
        c['boards'][f] = {'x': 0, 'y': 0, 'w': 1440, 'h': 900, 'page': PG}
        c['order'].append(f)

# group: (title, [frame stems], spacing in the old layout, sticky text)
SECTIONS = [
    ('1. SHARED: REP AND MANAGER', 'green',
     'Same pages and same layout for reps and managers. Reps only see their own customers and quotes. Drawn here in the manager view.', [
         ('Quotes board', ['QOBoard'] + ['QOB%d' % i for i in range(1, 10)], 1760, 'Board view. Each frame to the right is one button on the page, opened.'),
         ('Quotes table', ['QOTable'] + ['QOT%d' % i for i in range(1, 8)], 1760, 'Table view. Each frame to the right is one button on the page, opened.'),
         ('Quote editing', ['QEBase'] + ['QE%d' % i for i in range(1, 12)], 1760, 'Each frame to the right is one button on the quote editing page, opened.'),
         ('Customers', ['CUBase', 'CU1', 'CU2', 'CU3'], 1520, 'One list with the rep on every row. Filter by one rep or several. Clicking a customer opens the customer page.'),
         ('Orders', ['ORBase', 'OR1', 'OR2'], 1520, 'Orders come from the ERP and are read-only. Clicking an order opens the order page.'),
         ('Stock', ['STBase', 'ST1', 'ST2', 'ST3'], 1520, 'Items is now Stock. The category dropdown became the Filter button. Clicking an item opens the item page. Add to quote works from the list or the item page.'),
     ]),
    ('2. MANAGER ONLY', 'purple',
     'Drawn for the manager view. Reps get their own smaller Analytics and Settings (section 3). Teams and Reps does not exist for reps.', [
         ('Analytics', ['ANBase', 'AN1', 'AN3', 'AN4', 'AN6', 'AN7', 'AN8', 'AN2', 'AN5'], 1520, 'Five tabs: Overview, Rep leaderboard, Decline reasons, Untouched quotes and Customer questions. The Filter button works on every tab.'),
         ('Teams and Reps', ['TRBase'] + ['TR%d' % i for i in range(1, 8)], 1520, 'Replaces the Team tab and the Reps and Rep assignments settings. Assignments only, no analytics.'),
         ('Settings', ['S1', 'S2', 'S3', 'S8', 'S9', 'S4', 'S5', 'S6', 'S7'], 1520, 'Only managers can change these. Margin floors are the organization hard stops, with a rep review below. Descriptions only where a new user could misread a setting.'),
     ]),
    ('3. REP VIEW', 'orange',
     'Drawn for Brandi Gallegos, who owns Canyon Ridge, Great Basin and Wasatch. Same look as the manager pages. Rail has no Teams and Reps, Analytics reads My Analytics, role reads Rep. Not redrawn because only the data changes: Orders, Stock, customer page, order page, quote editor and the caution and bell dropdowns. Rep numbers are placeholders. Open: role switch for reps who are managers.', [
         ('Rep quotes', ['RQBoard', 'RQB1', 'RQB2', 'RQTable'], 1520, 'Only her customers. No rep filter. The Filter button lists her customers, statuses and dates.'),
         ('Rep customers', ['RCUBase', 'RCU1'], 1520, 'Own customers only. No Rep column and no rep filter.'),
         ('My Analytics', ['RAN1', 'RAN2', 'RAN3', 'RAN4', 'RAN5'], 1520, 'Own numbers only. No Rep leaderboard tab, no rep or team filter.'),
         ('Rep settings', ['RS1', 'RS2', 'RS3', 'RS4'], 1520, 'Margins, Profile and Notifications only. Margins cannot go below the organization floor.'),
     ]),
    ('4. CUSTOMER VIEW', 'blue',
     'One page for customers: rep and supplier contacts on the left, chat in the middle, their quotes on the right. Request a quote and the bell are new. Provo hours are a placeholder.', [
         ('Customer page', ['CV1', 'CV2', 'CV3'], 1520, 'Frames: the page, a sent quote opened (Accept, Request changes, Decline), and a quote still awaiting the rep.'),
     ]),
]
FRAME_NAMES = {
    'RQBoard': 'Board', 'RQB1': 'Customer picker', 'RQB2': 'Filter', 'RQTable': 'Table', 'RCUBase': 'Customers', 'RCU1': 'Filter',
    'RAN1': 'Overview', 'RAN2': 'Filter', 'RAN3': 'Decline reasons', 'RAN4': 'Untouched quotes', 'RAN5': 'Customer questions',
    'RS1': 'Margins', 'RS2': 'Profile', 'RS3': 'Margin below floor', 'RS4': 'Notifications',
    'CV1': 'Customer page', 'CV2': 'Quote sent', 'CV3': 'Quote awaiting rep',
}

# drop every note on this page; the page is rebuilt below. Other pages keep theirs.
c['notes'] = {k: v for k, v in c['notes'].items() if v.get('page') != PG}

cursor = 0
note = lambda key, **kw: c['notes'].__setitem__(key, dict(page=PG, w=240, **kw))

c['notes']['readme'] = dict(page=PG, x=-1781, y=-2200, w=1100, maxH=700, size='s', fill='gray',
                            text='Querent new UI. Four sections, top to bottom: 1 Shared (rep and manager), 2 Manager only, 3 Rep view, 4 Customer view.\n'
                                 'Each page is a row of frames, 1440 x 900: the page first, then one frame per button opened. The group title is on the left of its row.\n'
                                 'Look: dark green rail, Albert Sans, accent green. No em-dashes. Numbers are placeholders, not product data.')
cursor = -1400
for si, (stitle, color, ssum, groups) in enumerate(SECTIONS):
    note('sec%d' % (si + 1), kind='title1', size=320, color=color, text=stitle, x=-1781, y=cursor, maxW=8000)
    c['notes']['sec%ds' % (si + 1)] = dict(page=PG, x=-1781, y=cursor + 460, w=1100, maxH=520, size='s', fill=color, text=ssum)
    cursor += 1300
    for gi, (gtitle, stems, spacing, gtext) in enumerate(groups):
        keys = [s + '.dc.html' for s in stems]
        bs = [c['boards'][k] for k in keys]
        ymin = min(b['y'] for b in bs)
        for k, b in zip(keys, bs):
            col = 0 if b['x'] == 0 else (round((b['x'] - 1760) / 1520) + 1 if spacing == 1760 else round(b['x'] / 1520))
            if k in ('CV2.dc.html', 'CV3.dc.html'):
                col = int(k[2]) - 1
            b['x'] = col * 1520
            b['y'] = cursor + (b['y'] - ymin)
            b['page'] = PG
            stem = k[:-8]
            if stem in FRAME_NAMES:
                b['title'] = FRAME_NAMES[stem]
        bottom = max(b['y'] + b['h'] for b in bs)
        gk = 's%dg%d' % (si + 1, gi + 1)
        note(gk + 't', kind='title1', size=200, text=gtitle, x=-1781, y=cursor + 40, maxW=1600)
        c['notes'][gk + 's'] = dict(page=PG, x=-1781, y=cursor + 560, w=640, maxH=300, size='s', text=gtext)
        cursor = bottom + 320
    cursor += 500

for pg in c['pages']:
    if pg['id'] == PG:
        pg['name'] = 'New UI'
c['title'] = 'Querent New UI'
json.dump(c, open(p, 'w', encoding='utf-8', newline='\n'), indent=2, ensure_ascii=False)
print('boards', len(c['boards']), 'notes', len(c['notes']))
