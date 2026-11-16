"""The film set around the director's tower → blender/cache/set_raw.glb (then tools/optimize.mjs → assets/set.glb).

Run:  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" -b --factory-startup --python blender/build_set.py
      node tools/optimize.mjs blender/cache/set_raw.glb assets/set.glb

Layout comes from src/world/layout.js (exported to blender/cache/layout.json by tools/world/export-layout.mjs) — never
copy coordinates by hand. Positions below are written in three.js coordinates (x, y-up, z) and converted with T():
Blender (x, y, z) = three (x, -z, y). The tower faces three -z (Blender +y), toward the braking strip.
Meshes are joined per material (one draw call each): SET_wood, SET_planks, SET_metal, SET_canvas, SET_dark, SET_lamp,
SET_orange, SET_red. The game keeps its own anchors/stations (stuntScene.js); this file is visuals only.
Sight-line rule: nothing between the tower and the strip (three z ∈ [-10, 0]); the tower's front and side rails stay
low (deck + 0.4 m) so the seated student sees the ruler.
"""
import bpy, json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa

L = json.load(open(os.path.join(CACHE, 'layout.json')))
DECK = L['DECK_Y']
STRIP = L['STRIP']
sc = reset()


def T(x, y, z):
    return (x, -z, y)


parts = {}


def P(key, o):
    parts.setdefault(key, []).append(o)
    return o


def beam(key, a, b, w, d=None):
    """A square beam between three.js points a and b."""
    d = d or w
    A, B = Vector(T(*a)), Vector(T(*b))
    v = B - A
    o = box('beam', (w, d, v.length), (A + B) / 2)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(v.normalized())
    return P(key, o)


def blk(key, size3, loc3, bevel=0.0, rot_y=0.0):
    """Box with size in three axes (sx, sy-up, sz) at three location."""
    o = box('blk', (size3[0], size3[2], size3[1]), T(*loc3), bevel=bevel)
    o.rotation_euler = (0, 0, -rot_y)
    return P(key, o)


def tube(key, r, h, loc3, verts=12, r2=None, axis='Y', rot=(0, 0, 0)):
    o = cyl('tube', r, h, T(*loc3), verts=verts, r2=r2)
    if axis == 'X':
        o.rotation_euler = (0, math.pi / 2, 0)
    elif axis == 'Z3':                       # along three z (Blender y)
        o.rotation_euler = (math.pi / 2, 0, 0)
    o.rotation_euler = (o.rotation_euler[0] + rot[0], o.rotation_euler[1] + rot[1], o.rotation_euler[2] + rot[2])
    return P(key, o)


# ---------------- director's tower (scaffold of rough timber) ----------------
H = DECK
for x in (-1.8, 1.8):
    for z in (-1.8, 1.8):
        beam('wood', (x, 0, z), (x, H + (1.05 if z > 0 else 0.42), z), 0.2)
for lvl in (0.25, H / 2, H - 0.25):          # girts on all four sides
    for z in (-1.8, 1.8):
        beam('wood', (-1.8, lvl, z), (1.8, lvl, z), 0.12, 0.08)
    for x in (-1.8, 1.8):
        beam('wood', (x, lvl, -1.8), (x, lvl, 1.8), 0.12, 0.08)
for (a, b) in (((-1.8, 1.8), (1.8, 1.8)), ((-1.8, -1.8), (1.8, -1.8)), ((-1.8, -1.8), (-1.8, 1.8)), ((1.8, -1.8), (1.8, 1.8))):
    for (y0, y1) in ((0.25, H / 2), (H / 2, H - 0.25)):       # X braces
        beam('wood', (a[0], y0, a[1]), (b[0], y1, b[1]), 0.1, 0.06)
        beam('wood', (b[0], y0, b[1]), (a[0], y1, a[1]), 0.1, 0.06)
# deck of planks with small gaps
for i in range(20):
    x = -1.95 + i * 0.205
    blk('planks', (0.19, 0.06, 4.1), (x + 0.1, H - 0.03, 0))
# rails: back high (1.0), front and sides low (0.4) so the seated student sees the strip
beam('wood', (-1.8, H + 1.0, 1.8), (1.8, H + 1.0, 1.8), 0.1, 0.07)
beam('wood', (-1.8, H + 0.55, 1.8), (1.8, H + 0.55, 1.8), 0.08, 0.06)
beam('wood', (-1.8, H + 0.4, -1.8), (1.8, H + 0.4, -1.8), 0.08, 0.06)
for x in (-1.8, 1.8):
    beam('wood', (x, H + 0.4, -1.8), (x, H + 0.4, 1.8), 0.08, 0.06)
# ladder at the back
for x in (-0.3, 0.3):
    beam('wood', (x, 0, 2.6), (x, H + 0.9, 1.85), 0.08, 0.06)
for k in range(1, 17):
    t = k / 17
    beam('wood', (-0.3, t * (H + 0.9), 2.6 - t * 0.75), (0.3, t * (H + 0.9), 2.6 - t * 0.75), 0.05, 0.05)

# director's chair (folding, canvas seat and back) where the student sits: three (0, DECK, -1.25)
cx, cz = 0.0, -1.25
for sx in (-0.26, 0.26):
    beam('planks', (cx + sx, H, cz - 0.22), (cx + sx, H + 0.48, cz + 0.22), 0.04)
    beam('planks', (cx + sx, H, cz + 0.22), (cx + sx, H + 0.48, cz - 0.22), 0.04)
    beam('planks', (cx + sx, H + 0.48, cz + 0.22), (cx + sx, H + 0.95, cz + 0.27), 0.035)
    beam('planks', (cx + sx, H + 0.6, cz - 0.24), (cx + sx, H + 0.62, cz + 0.22), 0.035)       # arm rests
blk('canvas', (0.5, 0.02, 0.42), (cx, H + 0.47, cz))
blk('canvas', (0.52, 0.24, 0.02), (cx, H + 0.8, cz + 0.255))
# narrow, low desk (never hides the strip) + a red megaphone on it
blk('planks', (1.2, 0.05, 0.3), (0, H + 0.62, -1.7))
for x in (-0.55, 0.55):
    beam('wood', (x, H, -1.7), (x, H + 0.6, -1.7), 0.05)
tube('red', 0.05, 0.22, (1.45, H + 0.1, 1.2), verts=14, r2=0.11, axis='X')     # megaphone on the deck, out of the sightline

# ---------------- film lights on stands (three of them, behind the far-side number signs) ----------------
def film_light(x, z, aim_x, aim_z, height=3.4):
    for k in range(3):                                       # tripod legs
        a = k * 2 * math.pi / 3
        beam('metal', (x + math.cos(a) * 0.8, 0, z + math.sin(a) * 0.8), (x, 1.1, z), 0.04)
    beam('metal', (x, 0.9, z), (x, height, z), 0.06)
    yaw = math.atan2(aim_x - x, aim_z - z)
    dx, dz = math.sin(yaw), math.cos(yaw)
    hx, hz = x + dx * 0.1, z + dz * 0.1
    o = tube('dark', 0.36, 0.7, (hx, height + 0.3, hz), verts=18, axis='Z3', rot=(0, 0, -yaw))
    lens = tube('lamp', 0.3, 0.04, (hx + dx * 0.36, height + 0.3, hz + dz * 0.36), verts=18, axis='Z3', rot=(0, 0, -yaw))
    for s in (-1, 1):                                        # barn doors
        bx, bz = hx + dx * 0.5 + dz * s * 0.33, hz + dz * 0.5 - dx * s * 0.33
        blk('dark', (0.02, 0.6, 0.28), (bx, height + 0.3, bz), rot_y=yaw + s * 0.5)
    beam('metal', (x - dz * 0.4, height - 0.1, z + dx * 0.4), (x + dz * 0.4, height - 0.1, z - dx * 0.4), 0.05)   # yoke
    return o, lens


film_light(-12, -31, -10, -14)
film_light(28, -32, 30, -14)
film_light(64, -31, 64, -14)

# ---------------- camera crane near the strip end (far side) ----------------
cx, cz = 84.0, -30.0
blk('dark', (2.0, 0.5, 1.2), (cx, 0.55, cz), bevel=0.04)
for sx in (-0.85, 0.85):
    for sz in (-0.5, 0.5):
        tube('dark', 0.22, 0.16, (cx + sx, 0.24, cz + sz), verts=14, axis='Z3')
beam('metal', (cx, 0.8, cz), (cx, 2.6, cz), 0.18)
arm_a, arm_b = (cx + 2.2, 2.7, cz - 0.4), (cx - 5.2, 4.9, cz + 3.6)
beam('metal', arm_a, arm_b, 0.16, 0.22)
blk('dark', (0.5, 0.6, 0.5), (arm_a[0] + 0.2, arm_a[1] - 0.1, arm_a[2]))                 # counterweight
blk('dark', (0.45, 0.35, 0.7), (arm_b[0], arm_b[1] - 0.35, arm_b[2]), bevel=0.03)         # camera body
tube('dark', 0.12, 0.35, (arm_b[0] - 0.1, arm_b[1] - 0.35, arm_b[2] + 0.45), verts=14, axis='Z3')

# camera on a tripod aimed at the stop line
tx, tz = 96.0, -27.0
for k in range(3):
    a = k * 2 * math.pi / 3 + 0.3
    beam('metal', (tx + math.cos(a) * 0.6, 0, tz + math.sin(a) * 0.6), (tx, 1.35, tz), 0.035)
blk('dark', (0.32, 0.3, 0.55), (tx, 1.55, tz), bevel=0.02)
tube('dark', 0.09, 0.3, (tx, 1.58, tz + 0.4), verts=12, axis='Z3')

# ---------------- base camp behind the tower: pop-up tent, flight cases, generator ----------------
gx, gz = -15.0, 8.0
for sx in (-1.6, 1.6):
    for sz in (-1.6, 1.6):
        beam('metal', (gx + sx, 0, gz + sz), (gx + sx, 2.3, gz + sz), 0.05)
roof = blk('orange', (3.4, 0.05, 3.4), (gx, 2.42, gz))
for sx, sz, ry in ((0, -1.7, 0), (0, 1.7, 0), (-1.7, 0, math.pi / 2), (1.7, 0, math.pi / 2)):
    blk('canvas', (3.4, 0.28, 0.02), (gx + sx, 2.2, gz + sz), rot_y=ry)                     # valance
blk('canvas', (1.6, 0.05, 0.7), (gx, 0.75, gz))                                            # folding table
for sx in (-0.7, 0.7):
    for sz in (-0.3, 0.3):
        beam('metal', (gx + sx, 0, gz + sz), (gx + sx, 0.73, gz + sz), 0.03)
for k, (dx, dz, h) in enumerate(((2.4, -1.0, 0.55), (2.5, 0.0, 0.55), (2.4, 1.1, 0.8), (-2.6, 0.6, 0.6))):
    blk('dark', (0.9, h, 0.6), (gx + dx, h / 2, gz + dz), bevel=0.03, rot_y=k * 0.2)
    blk('metal', (0.92, 0.04, 0.62), (gx + dx, h, gz + dz), rot_y=k * 0.2)
blk('orange', (1.6, 1.0, 0.9), (-6.0, 0.55, 9.5), bevel=0.06)                              # generator
blk('dark', (1.7, 0.12, 1.0), (-6.0, 0.06, 9.5))
tube('metal', 0.05, 0.6, (-5.5, 1.2, 9.3), verts=10)

# ---------------- materials + join per material ----------------
wood = pbr_material('M_wood', polyhaven_texture('rough_wood'), tint=(0.95, 0.82, 0.68))
planks = pbr_material('M_planks', polyhaven_texture('rough_wood'), tint=(1.05, 0.88, 0.70))
M = {
    'wood': wood, 'planks': planks,
    'metal': mat('M_metal', (0.55, 0.56, 0.58), 0.35, 0.8),
    'dark': mat('M_dark', (0.07, 0.07, 0.08), 0.5, 0.3),
    'lamp': mat('M_lamp', (1.0, 0.93, 0.8), 0.2, 0.0, (1.0, 0.85, 0.6), 2.0),
    'canvas': mat('M_canvas', (0.86, 0.82, 0.74), 0.9),
    'orange': mat('M_orange', (0.95, 0.42, 0.10), 0.6),
    'red': mat('M_red', (0.8, 0.07, 0.05), 0.45),
}
out = []
for key, objs in parts.items():
    for o in objs:
        o.data.materials.clear(); o.data.materials.append(M[key])
    j = join(objs, f'SET_{key}')
    if key in ('wood', 'planks'):
        uv_box_project(j, 0.35)
    out.append(j)

os.makedirs(CACHE, exist_ok=True)
export_glb(os.path.join(CACHE, 'set_raw.glb'), out)
print('SET', {o.name: len(o.data.polygons) for o in out})
