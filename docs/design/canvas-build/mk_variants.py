import re, sys
P = r"design\project"

def rd(n):
    return open(P + "\\" + n, encoding="utf-8").read()

def wr(n, s):
    open(P + "\\" + n, "w", encoding="utf-8", newline="\n").write(s)

def must(s, old, new, count=1):
    assert s.count(old) >= 1, "missing: " + old[:70]
    return s.replace(old, new, count)

def cut_block(s, start_marker, end_marker):
    a = s.index(start_marker)
    b = s.index(end_marker, a) + len(end_marker)
    return s[:a] + s[b:]

DRAWER = '''      <aside style="flex: 0 0 344px; max-width: 100%; box-sizing: border-box; background: #fff; border: 1px solid #CBD7CF; border-radius: 16px; padding: 22px 24px; box-shadow: 0 12px 34px rgba(15,59,34,0.12)">
        <div style="display: flex; justify-content: space-between; align-items: flex-start">
          <div><div style="font-size: 24px; font-weight: 800; letter-spacing: -0.03em">Q-24790</div><div style="color: #4B5E52; margin-top: 2px">Wasatch Mechanical Contractors</div></div>
          <button aria-label="Close preview" style="width: 32px; height: 32px; border: 0; border-radius: 8px; background: #EEF2F0; font-size: 16px; line-height: 1">x</button>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 16px 0; padding: 12px 0; border-top: 1px solid #E3EAE6; border-bottom: 1px solid #E3EAE6">
          <div><div style="font-size: 12px; color: #4B5E52">Total</div><div style="font-size: 22px; font-weight: 800">$1,164.00</div></div>
          <div style="text-align: right"><div style="font-size: 12px; color: #4B5E52">Margin</div><div style="font-size: 22px; font-weight: 800">34.9%</div></div>
        </div>
        <div style="background: #FBE7A1; border-radius: 10px; padding: 12px 14px">
          <div style="font-size: 12.5px; font-weight: 800; color: #5C4300">Dana Ortiz, Oct 9</div>
          <div style="margin-top: 5px; font-size: 15.5px; line-height: 1.4; color: #3D2E00">"Can you hold the anchors for pickup at Ogden instead?"</div>
        </div>
        <div style="margin-top: 14px; font-size: 13px; font-weight: 700; color: #C92A1C">Overdue</div>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 18px">
          <button style="height: 42px; border: 0; border-radius: 10px; background: {{accent}}; color: #fff; font-weight: 700; font-size: 15px">Open quote</button>
          <button style="height: 42px; border: 1px solid #CBD7CF; border-radius: 10px; background: #fff; font-weight: 600; font-size: 15px">Reply to Dana</button>
        </div>
      </aside>
'''

# ---------- Board preview ----------
s = rd("KBoard.dc.html")
s = must(s, "<title>Kelly Board</title>", "<title>Kelly Board Preview</title>")
s = cut_block(s, '        <div style="position: absolute; top: 50px; right: 0; width: 360px', "</sc-for>\n        </div>\n")
s = must(s, 'aria-label="Needs attention, open" style="width: 40px; height: 40px; border-radius: 10px; border: 2px solid #C92A1C;', 'aria-label="Needs attention, 2 items" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid #F1BEB8;')
s = must(s, '<div style="display: flex; gap: 14px; overflow-x: auto; padding: 24px 0 14px; align-items: flex-start">',
         '<div style="display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; padding-top: 24px">\n    <div style="flex: 1 1 520px; min-width: 0; display: flex; gap: 12px; overflow-x: auto; padding-bottom: 14px; align-items: flex-start">')
s = must(s, "flex: 1 0 236px; background: #E4EAE5", "flex: 0 0 228px; background: #E4EAE5")
s = must(s, "border: 1px solid #D5DED8\">\n              <div style=\"display: flex; justify-content: space-between; align-items: baseline\">", "border: 2px solid {{c.bd}}\">\n              <div style=\"display: flex; justify-content: space-between; align-items: baseline\">")
s = must(s, "flag: flag || '', note: note || '' });", "flag: flag || '', note: note || '', bd: id === 'Q-24790' ? '#14803C' : '#D5DED8' });")
s = must(s, "      </sc-for>\n    </div>\n  </main>", "      </sc-for>\n    </div>\n" + DRAWER + "    </div>\n  </main>")
wr("KBoardPreview.dc.html", s)

# ---------- Table preview ----------
t = rd("KTable.dc.html")
t = must(t, "<title>Kelly Table</title>", "<title>Kelly Table Preview</title>")
t = must(t, '<div style="background: #fff; border: 1px solid #D5DED8; border-radius: 14px; margin-top: 24px; overflow: hidden">',
         '<div style="display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; margin-top: 24px">\n    <div style="flex: 1 1 560px; min-width: 0; background: #fff; border: 1px solid #D5DED8; border-radius: 14px; overflow: hidden">')
t = must(t, '<div style="min-width: 880px">', '<div style="min-width: 740px">')
t = must(t, "padding: 15px 22px; border-top: 1px solid #E8EEEA; align-items: center\">", "padding: 15px 22px; border-top: 1px solid #E8EEEA; align-items: center; background: {{r.bg}}\">")
t = must(t, "flag: flag || '', note: note || '' });", "flag: flag || '', note: note || '', bg: id === 'Q-24790' ? '#E3F1E8' : '#FFFFFF' });")
t = must(t, "Show 18 more quotes</button></div>\n        </div>\n      </div>\n    </div>\n  </main>",
         "Show 18 more quotes</button></div>\n        </div>\n      </div>\n    </div>\n" + DRAWER + "    </div>\n  </main>")
wr("KTablePreview.dc.html", t)

# ---------- Board solid heads ----------
b = rd("KBoard.dc.html")
b = must(b, "<title>Kelly Board</title>", "<title>Kelly Board Solid Heads</title>")
b = must(b, "background: #F2F4F2; color: #151D18", "background: #D9E3DC; color: #151D18")
b = cut_block(b, '        <div style="position: absolute; top: 50px; right: 0; width: 360px', "</sc-for>\n        </div>\n")
b = must(b, 'aria-label="Needs attention, open" style="width: 40px; height: 40px; border-radius: 10px; border: 2px solid #C92A1C;', 'aria-label="Needs attention, 2 items" style="width: 40px; height: 40px; border-radius: 10px; border: 1px solid #E8A8A0;')
b = must(b, '''        <section style="flex: 1 0 236px; background: #E4EAE5; border-radius: 14px; padding: 10px">
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 10px">
            <div style="font-weight: 800"><span style="color: #8DA195">:: </span>{{col.label}}</div>
            <span style="font-family: 'Geist Mono', monospace; font-size: 12px; color: #4B5E52">{{col.n}}</span>
          </div>''', '''        <section style="flex: 1 0 236px; background: #EEF3EF; border-radius: 12px; overflow: hidden">
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 11px 14px; background: #1F4A39; color: #fff">
            <div style="font-weight: 800"><span style="color: #7FA894">:: </span>{{col.label}}</div>
            <span style="font-family: 'Geist Mono', monospace; font-size: 12px; background: rgba(255,255,255,0.16); padding: 1px 8px; border-radius: 999px">{{col.n}}</span>
          </div>
          <div style="padding: 10px">''')
b = must(b, "        </section>", "          </div>\n        </section>")
wr("KBoardSolid.dc.html", b)

# ---------- Table solid heads ----------
u = rd("KTable.dc.html")
u = must(u, "<title>Kelly Table</title>", "<title>Kelly Table Solid Heads</title>")
u = must(u, "background: #F2F4F2; color: #151D18", "background: #D9E3DC; color: #151D18")
u = must(u, "font-size: 13px; font-weight: 800; color: #3A4A40; background: #E4EAE5", "font-size: 13px; font-weight: 800; color: #fff; background: #1F4A39")
wr("KTableSolid.dc.html", u)
print("ok")
