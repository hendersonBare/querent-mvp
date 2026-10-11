# Customer access tab: search box plus a Filter button (filter customers by each data access), replacing the dropdown frames.
# Writes S1, S1a (filter open), S1b (filter applied) and the C_ copies. Usage: python -I mk_access_filter.py <project dir>
import os, re, sys

D = sys.argv[1]
CATS = ['Items and stock', 'Pricing', 'Orders and quotes', 'Account']
CUSTS = [('Great Basin Fabrication', 'GBF-2207'), ('Uinta Facility Services', 'UFS-4051')]


def rd(n):
    return open(os.path.join(D, n + '.dc.html'), encoding='utf-8').read()


def wr(n, t):
    open(os.path.join(D, n + '.dc.html'), 'w', encoding='utf-8', newline='\n').write(t)


FILT_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4L3 5z"/></svg>'

for pre in ('', 'C_'):
    charcoal = pre == 'C_'
    border, muted, segbg, ink2, rowline, offbg, shadow = (('#D6D9D7', '#767D79', '#F0F1F0', '#585F5B', '#E8EAE9', '#BFC3C1', 'rgba(0,0,0,0.2)') if charcoal else
                                                          ('#CBD7CF', '#6A7F73', '#EEF3EF', '#4B5E52', '#E3EAE5', '#B9C6BE', 'rgba(15,59,34,0.22)'))
    t = rd(pre + 'S1')
    m = re.search(r'<div style="position: relative"><div style="width: \d+px; max-width: 100%; box-sizing: border-box; height: 42px; border-radius: 10px; background: #fff; border: 1px solid #[0-9A-Fa-f]{6}; display: flex; align-items: center; gap: 10px; padding: 0 14px">(<svg.*?</svg>)<span style="font-weight: 600">All customers</span><svg.*?</svg></div></div>', t, flags=re.S)
    assert m, pre
    search = ('<div style="width: 300px; max-width: 100%; box-sizing: border-box; height: 42px; border-radius: 10px; background: #fff; border: 1px solid ' + border + '; display: flex; align-items: center; gap: 10px; padding: 0 14px">'
              + m.group(1) + '<span style="color: ' + muted + '">Search customers</span></div>')

    def fbtn(open_=False, count=0):
        pill = '<span style="min-width: 18px; height: 18px; box-sizing: border-box; padding: 0 5px; border-radius: 999px; background: #14803C; color: #fff; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center">%d</span>' % count if count else ''
        return ('<button style="height: 40px; padding: 0 14px; border: %s solid %s; background: #fff; border-radius: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px">%sFilter%s</button>'
                % ('2px' if open_ else '1px', '#14803C' if open_ else border, FILT_SVG, pill))

    def seg(opts, sel):
        cells = ''.join(
            '<span style="flex: 1; text-align: center; padding: 7px 4px; font-weight: %s; color: %s; %s">%s</span>'
            % ('700' if o == sel else '600', '#fff' if o == sel else ink2, 'border-radius: 7px; background: #14803C' if o == sel else '', o) for o in opts)
        return '<div style="display: flex; background: %s; border-radius: 9px; padding: 3px">%s</div>' % (segbg, cells)

    def panel():
        body = '<div style="font-weight: 800; font-size: 16px; margin-bottom: 10px">Filter customers</div>'
        for c in CATS:
            body += '<div style="font-size: 12px; font-weight: 700; color: %s; margin: 10px 0 4px">%s</div>' % (ink2, c) + seg(['Any', 'Querent answers', 'Not shared'], 'Not shared' if c == 'Pricing' else 'Any')
        body += '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 18px"><span style="font-weight: 700; color: %s">Clear all</span><span style="height: 38px; padding: 0 22px; border-radius: 9px; background: #14803C; color: #fff; font-weight: 700; display: flex; align-items: center">Apply filters</span></div>' % ink2
        return ('<div style="position: absolute; top: 48px; left: 0; width: 420px; box-sizing: border-box; background: #fff; border: 1px solid %s; border-radius: 14px; box-shadow: 0 20px 44px %s; z-index: 8; padding: 18px; color: #1B1F1D; font-size: 14px">%s</div>' % (border, shadow, body))

    def block(open_=False, count=0, panel_html=''):
        return search + '<div style="position: relative">' + fbtn(open_, count) + panel_html + '</div>'

    base = t[:m.start()] + block() + t[m.end():]
    wr(pre + 'S1', base)
    wr(pre + 'S1a', t[:m.start()] + block(True, 0, panel()) + t[m.end():])

    # applied: customers whose Pricing is not shared, with every access toggle editable per customer
    tog = lambda on: ('<span style="position: relative; width: 40px; height: 22px; border-radius: 999px; background: %s; display: block; flex: none"><span style="position: absolute; top: 3px; %s: 3px; width: 16px; height: 16px; border-radius: 50%%; background: #fff"></span></span>' % (('#14803C', 'right') if on else (offbg, 'left')))
    cols = 'grid-template-columns: minmax(220px, 2fr) 1fr 1fr 1.2fr 1fr; gap: 16px'
    head = '<div style="display: grid; %s; padding: 10px 20px; background: %s; font-size: 12.5px; font-weight: 800; color: #3A4A40"><div>:: Customer</div>%s</div>' % (cols, '#E8EAE9' if charcoal else '#E4EAE5', ''.join('<div>:: %s</div>' % c for c in CATS))
    rows = ''
    for name, code in CUSTS:
        rows += ('<div style="display: grid; %s; align-items: center; padding: 14px 20px; border-top: 1px solid %s"><div><div style="font-weight: 800">%s</div><div style="font-family: Geist Mono, monospace; font-size: 12px; color: %s; margin-top: 2px">%s</div></div>%s</div>'
                 % (cols, rowline, name, ink2, code, ''.join('<div>%s</div>' % tog(c != 'Pricing') for c in CATS)))
    section = '<section style="background: #fff; border-radius: 14px; overflow: hidden">' + head + rows + '</section>'
    sm = re.search(r'<section style="background: #fff; border-radius: 14px; overflow: hidden">.*?</section>', t, flags=re.S)
    t1 = t[:m.start()] + block(False, 1) + '<span style="color: %s; font-weight: 600">2 of 6 customers</span>' % ink2 + t[m.end():]
    sm = re.search(r'<section style="background: #fff; border-radius: 14px; overflow: hidden">.*?</section>', t1, flags=re.S)
    wr(pre + 'S1b', t1[:sm.start()] + section + t1[sm.end():])
print('ok')
