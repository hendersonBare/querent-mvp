P = r"design\project"
def rd(n): return open(P + "\\" + n, encoding="utf-8").read()
def wr(n, s): open(P + "\\" + n, "w", encoding="utf-8", newline="\n").write(s)

k = rd("KTable.dc.html")
if 'aria-label="Choose columns"' in k:
    print("already patched"); raise SystemExit

# 1. filter button identical to the board view
kb = rd("KBoard.dc.html")
fa = kb.index('      <button style="height: 40px; padding: 0 14px; border: 1px solid #CBD7CF; background: #fff; border-radius: 10px; font-weight: 600; display: flex; align-items: center; gap: 8px">')
fb = kb.index('Filter</button>', fa) + len('Filter</button>\n')
FILTER_BTN = kb[fa:fb]
toggle = '      <div style="display: flex; background: #fff; border: 1px solid #CBD7CF; border-radius: 10px; padding: 3px">'
assert k.count(toggle) == 1
k = k.replace(toggle, FILTER_BTN + toggle)

# 2. remove the status dropdown block
a = k.index('    <div style="position: relative; margin-top: 22px; width: 250px">')
b = k.index('    <div style="background: #fff; border: 1px solid #D5DED8; border-radius: 14px; margin-top: 14px; overflow: hidden">')
k = k[:a] + k[b:]
k = k.replace('border-radius: 14px; margin-top: 14px; overflow: hidden">', 'border-radius: 14px; margin-top: 24px; overflow: hidden">', 1)

# 3. columns icon at the end of the header row, 7th grid track
k = k.replace('grid-template-columns: 1fr 2.2fr 0.9fr 1.5fr 1fr 0.9fr;', 'grid-template-columns: 1fr 2.2fr 0.9fr 1.5fr 1fr 0.9fr 28px;')
icon = ('<div style="display: flex; justify-content: flex-end"><button aria-label="Choose columns" style="width: 28px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: rgba(0,0,0,0.08); color: inherit; display: flex; align-items: center; justify-content: center">'
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v14H4z M9.5 5v14 M14.5 5v14"/></svg></button></div>')
old = '<div style="text-align: right">:: Margin</div>'
assert k.count(old) == 1
k = k.replace(old, old + icon)
wr("KTable.dc.html", k)
print("patched KTable")
