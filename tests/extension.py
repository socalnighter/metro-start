"""Metro Start tests that need the real extension (Chrome storage, multiple tabs).

Loads this folder as an unpacked extension in Chromium and checks that tiles stay where you put them:
dragging to an empty square, dragging onto another tile, quick resizes, reloading and a second tab.

    python tests/extension.py

Set CHROME_PATH to use a specific Chromium binary. Network requests are blocked, so it runs offline.
"""
import asyncio, os, pathlib, sys, tempfile
from playwright.async_api import async_playwright
EXT=str(pathlib.Path(__file__).resolve().parent.parent)
LAUNCH={"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}
POS="""Object.fromEntries([...document.querySelectorAll('#grid .tile')].map(e=>{const r=e.getBoundingClientRect();return [(e.title||'').split('\\n')[0].replace(/ \\(\\d+\\)$/,''), [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]]}))"""
res=[]
def check(n, ok, x=''): res.append(ok); print('PASS' if ok else 'FAIL', n, x)
def overlaps(p):
    v=list(p.items()); out=[]
    for i,(an,a) in enumerate(v):
        for bn,b in v[i+1:]:
            if a[0] < b[0]+b[2] and b[0] < a[0]+a[2] and a[1] < b[1]+b[3] and b[1] < a[1]+a[3]: out.append((an,bn))
    return out
async def main():
    async with async_playwright() as p:
        ctx=await p.chromium.launch_persistent_context(tempfile.mkdtemp(prefix="metro-start-test-"), **LAUNCH,
            headless=True, viewport={"width":1440,"height":860}, args=["--headless=new",f"--disable-extensions-except={EXT}",f"--load-extension={EXT}"])
        await ctx.route("**/*", lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
        pg=await ctx.new_page(); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("chrome://newtab/"); await asyncio.sleep(1)
        # a fixed, flat layout so these checks don't depend on the default tiles
        await pg.evaluate("""chrome.storage.local.set({tiles: [link('Google','https://www.google.com','#2d89ef','wide'), link('YouTube','https://www.youtube.com','#ee1111'),
          link('Gmail','https://mail.google.com','#b91d47'), link('Maps','https://maps.google.com','#1e7145','small'), link('Drive','https://drive.google.com','#e3a21a','small'),
          link('Calendar','https://calendar.google.com','#2b5797','small'), link('Photos','https://photos.google.com','#da532c','small'),
          {id: uid(), type:'folder', title:'Social', color:'#603cba', size:'medium', children:[link('Reddit','https://www.reddit.com','#da532c')]},
          link('Wikipedia','https://www.wikipedia.org','#1d1d1d'), link('Amazon','https://www.amazon.com','#e3a21a','wide'), link('Netflix','https://www.netflix.com','#b91d47'),
          link('News','https://news.google.com','#00aba9'), gamesFolder()]})""")
        await pg.reload(); await asyncio.sleep(2)
        p0=await pg.evaluate(POS)
        gx,gy=p0['Google'][0],p0['Google'][1]   # top-left square of group 1
        # 1. drag Netflix into the empty bottom row of the first group (row 5, column 0)
        await pg.drag_and_drop("#grid [title^='Maps']", "#grid", source_position={"x":20,"y":20}, target_position={"x": gx - (await pg.evaluate("document.querySelector('#grid').getBoundingClientRect().left")) + 20, "y": gy + 5*80 + 20 - (await pg.evaluate("document.querySelector('#grid').getBoundingClientRect().top"))})
        await asyncio.sleep(1.2)
        p1=await pg.evaluate(POS)
        check("dragged tile stays on the empty square", p1['Maps'][:2]==[gx, gy+400], p1['Maps'])
        check("nothing overlaps", not overlaps(p1), overlaps(p1))
        others_same = all(p1[k]==p0[k] for k in p0 if k!='Maps')
        check("other tiles didn't move", others_same)
        # 2. drag Wikipedia onto Google's top-left square: Google gets nudged, Wikipedia stays
        g_box=await pg.evaluate("document.querySelector('#grid').getBoundingClientRect().toJSON()")
        await pg.drag_and_drop("#grid [title^='Wikipedia']", "#grid", source_position={"x":10,"y":10}, target_position={"x": gx-g_box['x']+10, "y": gy-g_box['y']+10})
        await asyncio.sleep(1.2)
        p2=await pg.evaluate(POS)
        check("dropped onto a tile: it takes the square", p2['Wikipedia'][:2]==[gx,gy], p2['Wikipedia'])
        check("the tile in the way moved aside, no overlap", not overlaps(p2) and p2['Google']!=p0['Google'], p2['Google'])
        # 3. resize YouTube to large, then quickly to small, then wide: stays at its top-left square
        yt=p2['YouTube'][:2]
        for size in ['Large','Small','Wide']:
            await pg.click("#grid [title^='YouTube']", button="right"); await pg.click(f"#ctx .ctx-size[title={size}]"); await asyncio.sleep(0.05)
        await asyncio.sleep(1.5)
        p3=await pg.evaluate(POS)
        check("resize keeps the tile's spot (after quick changes)", p3['YouTube'][:2]==yt and p3['YouTube'][2]>300, p3['YouTube'])
        check("nothing overlaps after resizing", not overlaps(p3), overlaps(p3))
        # 4. reload: everything is where it was
        await pg.reload(); await asyncio.sleep(1.5)
        p4=await pg.evaluate(POS)
        check("layout survives reload", p4==p3, [k for k in p3 if p4.get(k)!=p3[k]])
        # 5. a second open tab shows the same layout
        pg2=await ctx.new_page(); await pg2.goto("chrome://newtab/"); await asyncio.sleep(1.5)
        check("other tab matches", await pg2.evaluate(POS)==p4)
        # 6. drop in the empty space to the right of the last group (outside the tile area itself)
        sc=await pg.evaluate("document.querySelector('#grid-scroller').getBoundingClientRect().toJSON()")
        gr=await pg.evaluate("document.querySelector('#grid').getBoundingClientRect().toJSON()")
        last_right = max(v[0] + v[2] for v in p4.values())
        right_x = min(last_right + 160, sc['x'] + sc['width'] - 40)   # past the last group, still in the window
        check("test drop point is outside the tile area", right_x > gr['x'] + gr['width'] - 1 or right_x > last_right + 80, (right_x, gr['x'] + gr['width'], last_right))
        await pg.drag_and_drop("#grid [title^='News']", "#grid-scroller", source_position={"x":10,"y":10}, target_position={"x": right_x - sc['x'], "y": gy - sc['y'] + 10})
        await asyncio.sleep(1.2)
        p5=await pg.evaluate(POS)
        check("drop in empty space right of the tiles stays there", p5['News'][0] > max(v[0] for k,v in p4.items()), p5['News'])
        check("nothing overlaps after dropping in empty space", not overlaps(p5), overlaps(p5))
        # 7. drop below the tiles (outside the tile area): lands in the bottom row of that column
        below_y = gr['y'] + gr['height'] + 40
        await pg.drag_and_drop("#grid [title^='Gmail']", "#grid-scroller", source_position={"x":10,"y":10}, target_position={"x": gx - sc['x'] + 10, "y": below_y - sc['y']})
        await asyncio.sleep(1.2)
        p5b=await pg.evaluate(POS)
        check("drop below the tiles lands in the bottom rows", p5b['Gmail'][0]==gx and p5b['Gmail'][1] > p4['Gmail'][1], p5b['Gmail'])
        check("nothing overlaps after dropping below", not overlaps(p5b), overlaps(p5b))
        await pg.reload(); await asyncio.sleep(1.5)
        p4=await pg.evaluate(POS)
        check("those drops survive a reload", p4==p5b)
        # 8. a new tile goes after the existing ones, nothing moves
        await pg.click("#btn-add"); await pg.click("#ctx .ctx-item >> nth=0"); await pg.fill("#ed-url","github.com"); await pg.click("#ed-save"); await asyncio.sleep(1)
        p6=await pg.evaluate(POS)
        check("new tile added without moving others", all(p6[k]==p4[k] for k in p4) and 'Github' in p6, p6.get('Github'))
        # 9. folders: like the user's folder of two subfolders and three wide tiles
        await pg.evaluate("""(()=>{ const sub=(t,c)=>({id:'s'+t,type:'folder',title:t,color:c,size:'medium',children:[link(t+' 1','https://'+t.toLowerCase()+'1.example','#9f00a7')]});
          tiles.push({id:'fun',type:'folder',title:'Fun',color:'#da532c',size:'medium',children:[sub('Instagram','#00a300'), sub('Clash','#2d89ef'),
            link('A very long bookmark name that needs a wide tile','https://a.example','#da532c','wide'),
            link('Another long bookmark name for a wide tile','https://b.example','#ee1111','wide'),
            link('Third long bookmark name for a wide tile','https://c.example','#00a300','wide')]}); commit(); })()""")
        await asyncio.sleep(0.8)
        await pg.click("#grid [title^='Fun']"); await asyncio.sleep(2); await pg.evaluate("Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>0)))")
        FP="""(()=>{const g=document.querySelector('#folder-grid').getBoundingClientRect();return Object.fromEntries([...document.querySelectorAll('#folder-grid .tile')].map(e=>{const r=e.getBoundingClientRect();return [(e.title||'').split('\\n')[0].replace(/ \\(\\d+\\)$/,''), [Math.round(r.left-g.left), Math.round(r.top-g.top), Math.round(r.width), Math.round(r.height)]]}))})()"""
        f0=await pg.evaluate(FP)
        tops=sorted(set(v[1] for v in f0.values()))
        check("folder uses the band's width (not one narrow column)", len(tops) <= 2 and await pg.evaluate("folderCols") > 4, (await pg.evaluate("folderCols"), f0))
        await pg.screenshot(path="/tmp/claude-0/bug/folder1.png") if os.path.isdir("/tmp/claude-0/bug") else None
        # drag a wide tile to an empty spot further down and to the right inside the band
        fg=await pg.evaluate("document.querySelector('#folder-grid').getBoundingClientRect().toJSON()")
        band=await pg.evaluate("document.querySelector('#folder-band').getBoundingClientRect().toJSON()")
        step=80
        tx = fg['x'] + 4 + 6*step + 10; ty = fg['y'] + 4 + 3*step + 10
        name='Third long bookmark name for a wide tile'
        await pg.drag_and_drop(f"#folder-grid [title^='{name}']", "#folder-band", source_position={"x":10,"y":10}, target_position={"x": tx-band['x'], "y": ty-band['y']})
        await asyncio.sleep(1.5); await pg.evaluate("Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>0)))")
        f1=await pg.evaluate(FP)
        check("folder: dropped tile stays where it was dropped", f1[name][:2]==[4+6*step, 4+3*step], f1[name])
        check("folder: nothing overlaps", not overlaps(f1), overlaps(f1))
        # resize the first wide tile to medium: it keeps its corner
        first='A very long bookmark name that needs a wide tile'
        before=f1[first][:2]
        await pg.click(f"#folder-grid [title^='{first}']", button="right"); await pg.click("#ctx .ctx-size[title=Medium]"); await asyncio.sleep(1); await pg.evaluate("Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>0)))")
        f2=await pg.evaluate(FP)
        check("folder: resized tile keeps its spot", f2[first][:2]==before and f2[first][2]<200, f2[first])
        await pg.click("#folder-close"); await pg.reload(); await asyncio.sleep(1.5)
        await pg.click("#grid [title^='Fun']"); await asyncio.sleep(2)
        # let the folder's opening animation finish first (it scales the tiles for a moment)
        await pg.evaluate("Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>0)))")
        f3=await pg.evaluate(FP)
        check("folder layout survives reload", f3==f2, [k for k in f2 if f3.get(k)!=f2[k]])
        if await pg.is_visible("#folder-overlay"): await pg.click("#folder-close"); await asyncio.sleep(0.4)
        # 1.14: a feed tile without site access yet says so (real Chrome permissions), and the clock switches on scroll
        await pg.evaluate("(async()=>{tiles.push({id:'feedx',type:'feed',title:'Some News',url:'https://feeds.test.example/rss',site:'',color:'#b91d47',size:'wide'});commit();await refreshFeeds(true)})()")
        await asyncio.sleep(1)
        check("feed tile without access asks to allow", "Select to let Metro Start read" in await pg.inner_text("#grid [data-id=feedx]"))
        await pg.hover("#clock-widget"); await pg.mouse.wheel(0,100); await asyncio.sleep(0.4)
        check("clock switches on scroll", await pg.evaluate("clockWidget.classList.contains('remote')"))
        check("no page errors", not errs, errs)
        await ctx.close()
    print(f"{sum(res)}/{len(res)} passed")
asyncio.run(main())
sys.exit(0 if all(res) else 1)
