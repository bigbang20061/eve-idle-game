from PIL import Image, ImageDraw, ImageFont
import random, math, pathlib, wave, struct
ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public' / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
random.seed(42)

def save_pixel(img, name):
    img.save(ASSETS / name)

# UI logo
img = Image.new('RGBA', (96,96), (0,0,0,0))
d = ImageDraw.Draw(img)
for r,c in [(45,(16,255,214,70)),(35,(64,140,255,90)),(24,(111,255,213,160))]:
    d.ellipse((48-r,48-r,48+r,48+r), outline=c, width=2)
d.polygon([(48,8),(60,42),(88,48),(60,54),(48,88),(36,54),(8,48),(36,42)], fill=(111,255,213,230))
d.polygon([(48,20),(55,45),(76,48),(55,51),(48,76),(41,51),(20,48),(41,45)], fill=(7,17,31,255))
d.rectangle((44,28,52,68), fill=(215,242,255,255))
img = img.resize((192,192), Image.Resampling.NEAREST).resize((96,96), Image.Resampling.NEAREST)
save_pixel(img, 'ui_logo.png')

# background sector
bg = Image.new('RGB', (960,540), (3,6,14))
d = ImageDraw.Draw(bg)
for i in range(600):
    x=random.randrange(960); y=random.randrange(540); b=random.randrange(60,230)
    s=1 if random.random()<.88 else 2
    d.rectangle((x,y,x+s-1,y+s-1), fill=(b,b+random.randrange(0,25), min(255,b+random.randrange(10,60))))
for cx,cy,r,col in [(780,115,64,(35,74,120)),(150,430,95,(22,63,82)),(510,260,130,(18,35,60))]:
    d.ellipse((cx-r,cy-r,cx+r,cy+r), fill=tuple(max(0,v-25) for v in col), outline=col, width=3)
    d.arc((cx-r+10,cy-r+20,cx+r-20,cy+r-5), 15, 175, fill=(111,255,213), width=2)
for i in range(0,960,40):
    d.line((i,0,i+220,540), fill=(10,25,40), width=1)
bg = bg.resize((1920,1080), Image.Resampling.NEAREST)
save_pixel(bg, 'background_sector.png')

# landing hero
hero = Image.new('RGB', (640,420), (2,4,11))
d = ImageDraw.Draw(hero)
for i in range(260):
    x=random.randrange(640); y=random.randrange(420); b=random.randrange(90,255)
    d.point((x,y), fill=(b,b,min(255,b+35)))
# station rings
for r in [160,120,82]:
    d.ellipse((320-r,210-r//2,320+r,210+r//2), outline=(36,68,89), width=3)
d.rectangle((288,130,352,290), fill=(18,34,54), outline=(111,255,213), width=2)
d.rectangle((260,180,380,236), fill=(10,22,38), outline=(128,183,255), width=2)
# ships
for x,y,s,c in [(130,260,5,(111,255,213)),(500,155,4,(255,209,102)),(470,320,3,(128,183,255))]:
    pts=[(0,-4),(1,-2),(-1,-2),(2,1),(-2,1),(0,3)]
    for px,py in pts:
        d.rectangle((x+px*s,y+py*s,x+px*s+s-1,y+py*s+s-1), fill=c)
    d.line((x+18,y,x+95,y-16), fill=c, width=2)
# UI overlay
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 18)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 12)
except Exception:
    font = small = None
d.rectangle((24,24,260,112), fill=(5,12,24), outline=(36,68,89), width=2)
d.text((38,38),'SEARCH · FIGHT · EXTRACT', fill=(111,255,213), font=small)
d.text((38,66),'EVE IDLE GAME', fill=(215,242,255), font=font)
d.rectangle((410,34,610,132), fill=(5,12,24), outline=(36,68,89), width=2)
for i,label in enumerate(['Jita .94','Low .42','Null .01']):
    d.text((426,50+i*24), label, fill=[(111,255,213),(255,209,102),(255,107,122)][i], font=small)
hero = hero.resize((1280,840), Image.Resampling.NEAREST)
save_pixel(hero, 'landing_hero.png')

# faction badges / market icons
icons = Image.new('RGBA', (512,128), (0,0,0,0))
d = ImageDraw.Draw(icons)
for i,c in enumerate([(111,255,213),(128,183,255),(255,209,102),(255,107,122)]):
    x=24+i*120
    d.rectangle((x,24,x+80,104), fill=(5,12,24,255), outline=c, width=3)
    d.polygon([(x+40,34),(x+64,64),(x+40,94),(x+16,64)], fill=c+(230,))
    d.rectangle((x+34,52,x+46,76), fill=(5,12,24,255))
save_pixel(icons, 'faction_badges.png')
print('assets generated', ASSETS)
