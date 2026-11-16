"""The stunt car from the opening film → blender/cache/car_raw.glb (then tools/optimize.mjs → assets/car.glb).

Run:  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" -b --factory-startup --python blender/build_car.py
      node tools/optimize.mjs blender/cache/car_raw.glb assets/car.glb --no-compress

A compact orange coupé: wide wheel arches, open window frames (no glass: clear view, nothing to reflect), a roll cage,
bucket seats, a small rear wing. The black racing stripes are painted at runtime (stuntScene.js, by local x/y).
Written in three.js car-local coordinates (metres, y up, the car faces +z, the driver sits on +x) and converted with
T(): Blender (x, y, z) = three (x, -z, y). Origin = ground centre. The game keeps its own nodes (seat, seatP, wheel,
frontWheel) in makeCar(); this file is visuals: CAR_paint, CAR_trim, CAR_interior, CAR_seat, CAR_cage, CAR_lamp,
CAR_tail and four wheels CAR_wheel_FL/FR/RL/RR with their origin at the hub (they spin in the game).
Proportions match makeCar(): 1.8 m wide, 4.2 m long, axles at z = ±1.35, track ±0.85, wheel radius 0.37 (big, like the film).
"""
import bpy, bmesh, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa
from mathutils import Vector

sc = reset()


def T(x, y, z):
    return Vector((x, -z, y))


parts = {}


def P(key, o):
    parts.setdefault(key, []).append(o)
    return o


def ss(a, b, t):
    u = min(1, max(0, (t - a) / (b - a)))
    return u * u * (3 - 2 * u)


def loft(name, rings, cap=True):
    """rings: list of lists of three.js points (same count). Quads between rings, fan caps at the ends."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vr = [[bm.verts.new(T(*p)) for p in r] for r in rings]
    n = len(rings[0])
    for a, b in zip(vr, vr[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap:
        bm.faces.new(list(reversed(vr[0])))
        bm.faces.new(vr[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me))
    smooth(o, 35)
    return o


def superellipse(w, y0, y1, z, n=4.0, k=40, flat_bottom=True):
    pts, yc, hh = [], (y0 + y1) / 2, (y1 - y0) / 2
    for i in range(k):
        t = 2 * math.pi * i / k
        c, s = math.cos(t), math.sin(t)
        x = w * math.copysign(abs(c) ** (2 / n), c)
        y = yc + hh * math.copysign(abs(s) ** (2 / n), s)
        if flat_bottom and y < y0 + 0.02:
            y = y0
        pts.append((x, y, z))
    return pts


def bar(key, a, b, r=0.025, verts=8):
    A, B = T(*a), T(*b)
    v = B - A
    o = cyl('bar', r, v.length, (A + B) / 2, verts=verts)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(v.normalized())
    return P(key, o)


def blk(key, size3, loc3, bevel=0.0, rot=(0, 0, 0)):
    o = box('blk', (size3[0], size3[2], size3[1]), T(*loc3), bevel=bevel)
    o.rotation_euler = (-rot[0], rot[2], -rot[1])           # three (rx, ry, rz) → Blender (−rx about x, rz about y, −ry about z)
    return P(key, o)


# ---------------- body: a rounded superellipse loft with wheel arches cut out ----------------
L2 = 2.1
rings = []
for i in range(31):
    s = -1 + 2 * i / 30
    z = s * L2
    a = abs(z)
    w = 0.90 * (1 - 0.10 * abs(s) ** 4) - 0.10 * ss(1.75, 2.1, a)
    top = 0.88 - 0.16 * ss(1.55, 2.1, a) + (0.03 if z > 0.9 else 0)          # hood slightly raised
    bot = 0.22 + 0.10 * ss(1.7, 2.1, a)
    rings.append(superellipse(w, bot, top, z))
# taper the very ends so the nose and tail are round
rings[0] = superellipse(0.62, 0.36, 0.66, -L2 - 0.03)
rings[-1] = superellipse(0.62, 0.34, 0.68, L2 + 0.03)
body = P('paint', loft('body', rings))
for zc in (-1.35, 1.35):                                       # wheel arches
    cut = cyl('arch', 0.46, 2.4, T(0, 0.37, zc), verts=32)
    cut.rotation_euler = (0, math.pi / 2, 0)
    m = body.modifiers.new('arch', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cut; m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier='arch')
    bpy.data.objects.remove(cut)
# fender flares (wide, like the film car)
for x in (-1, 1):
    for zc in (-1.35, 1.35):
        o = bpy.data.objects.new('flare', bpy.data.meshes.new('flare'))
        link(o)
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=False, segments=24, radius=0.50)
        bm.to_mesh(o.data); bm.free()
        o.location = T(x * 0.88, 0.37, zc)
        o.rotation_euler = (0, math.pi / 2, 0)
        sol = o.modifiers.new('s', 'SOLIDIFY'); sol.thickness = 0.06
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier='s')
        # keep the upper half only
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x > 0.06], context='VERTS')   # rotated 90° about y: local -x is up
        bm.to_mesh(o.data); bm.free()
        P('paint', o)

# ---------------- greenhouse: pillars, roof, window frames (open, no glass) ----------------
BELT, ROOF = 0.90, 1.40
ws_base, ws_top = 0.95, 0.30                                   # windshield base / top (z)
rw_base, rw_top = -1.40, -0.78                                 # rear window base / top (z)
for x in (-1, 1):
    bar('paint', (x * 0.80, BELT, ws_base), (x * 0.64, ROOF, ws_top), 0.045)          # A
    bar('paint', (x * 0.82, BELT, -0.62), (x * 0.66, ROOF, -0.62), 0.05)             # B (behind the driver's eye)
    bar('paint', (x * 0.80, BELT, rw_base), (x * 0.64, ROOF, rw_top), 0.07)          # C
    bar('trim', (x * 0.82, BELT + 0.01, ws_base), (x * 0.82, BELT + 0.01, rw_base), 0.025)   # window sill
blk('paint', (1.34, 0.06, ws_top - rw_top + 0.12), (0, ROOF, (ws_top + rw_top) / 2), bevel=0.025)
bar('trim', (-0.78, BELT + 0.02, ws_base), (0.78, BELT + 0.02, ws_base), 0.03)       # windshield frame
bar('trim', (-0.64, ROOF - 0.03, ws_top), (0.64, ROOF - 0.03, ws_top), 0.03)

# ---------------- details: lights, grille, bumpers, mirrors, wing ----------------
for x in (-0.58, 0.58):
    o = cyl('hl', 0.12, 0.06, T(x, 0.66, L2 - 0.02), verts=20); o.rotation_euler = (math.pi / 2, 0, 0); P('lamp', o)
    blk('tail', (0.34, 0.1, 0.05), (x, 0.70, -L2 + 0.0), bevel=0.02)
blk('trim', (0.86, 0.16, 0.08), (0, 0.48, L2 + 0.0), bevel=0.02)                     # grille
blk('trim', (1.62, 0.16, 0.14), (0, 0.30, L2 - 0.02), bevel=0.05)                    # front bumper
blk('trim', (1.62, 0.16, 0.14), (0, 0.32, -L2 + 0.02), bevel=0.05)                   # rear bumper
for x in (-1, 1):
    bar('trim', (x * 0.82, BELT + 0.04, 0.82), (x * 0.97, BELT + 0.10, 0.82), 0.015)
    blk('paint', (0.06, 0.1, 0.16), (x * 1.0, BELT + 0.12, 0.82), bevel=0.02)       # mirror
    bar('trim', (x * 0.45, 0.86, -1.85), (x * 0.45, 1.06, -1.92), 0.02)             # wing struts
    o = cyl('ex', 0.04, 0.16, T(x * 0.38, 0.27, -L2 - 0.02), verts=12); o.rotation_euler = (math.pi / 2, 0, 0); P('cage', o)
blk('trim', (1.5, 0.03, 0.26), (0, 1.07, -1.94), bevel=0.01)                         # rear wing

# ---------------- interior: floor, dash, binnacle, seats, cage, door cards ----------------
blk('interior', (1.6, 0.05, 2.4), (0, 0.34, -0.15))
blk('interior', (1.58, 0.24, 0.46), (0, 0.86, 0.64), bevel=0.05)                     # dashboard (top ≈ 0.98)
blk('interior', (0.36, 0.12, 0.2), (0.38, 1.02, 0.5), bevel=0.04, rot=(0.3, 0, 0))   # instrument binnacle
blk('interior', (0.22, 0.30, 1.4), (0, 0.48, -0.1), bevel=0.04)                      # centre tunnel
bar('cage', (0.0, 0.62, 0.25), (0.0, 0.78, 0.2), 0.012)                               # gear lever
for x in (-0.38, 0.38):
    blk('seat', (0.50, 0.12, 0.50), (x, 0.47, -0.42), bevel=0.05)
    blk('seat', (0.50, 0.66, 0.12), (x, 0.80, -0.70), bevel=0.05, rot=(-0.15, 0, 0))
    blk('interior', (0.30, 0.16, 0.08), (x, 1.17, -0.78), bevel=0.03)              # headrest pad
for x in (-1, 1):
    blk('interior', (0.04, 0.42, 1.7), (x * 0.86, 0.62, -0.2), bevel=0.01)          # door card
# roll cage: main hoop, A-pillar tubes, roof bars, door X, rear braces
for x in (-1, 1):
    bar('cage', (x * 0.70, 0.36, -0.82), (x * 0.66, ROOF - 0.08, -0.82))
    bar('cage', (x * 0.72, 0.36, 0.88), (x * 0.60, ROOF - 0.08, ws_top + 0.05))
    bar('cage', (x * 0.62, ROOF - 0.08, -0.82), (x * 0.58, ROOF - 0.08, ws_top + 0.05))
    bar('cage', (x * 0.74, 0.40, 0.75), (x * 0.74, 0.80, -0.75))
    bar('cage', (x * 0.74, 0.80, 0.75), (x * 0.74, 0.40, -0.75))
    bar('cage', (x * 0.68, ROOF - 0.1, -0.82), (x * 0.50, 0.40, -1.6))
bar('cage', (-0.66, ROOF - 0.08, -0.82), (0.66, ROOF - 0.08, -0.82))
bar('cage', (-0.66, ROOF - 0.10, -0.82), (0.66, 0.45, -0.82))

# ---------------- materials + join ----------------
M = {
    'paint': mat('M_paint', (0.95, 0.38, 0.06), 0.28, 0.25),
    'trim': mat('M_trim', (0.03, 0.03, 0.035), 0.55, 0.2),
    'interior': mat('M_interior', (0.10, 0.10, 0.11), 0.85),
    'seat': mat('M_seat', (0.42, 0.05, 0.04), 0.7),
    'cage': mat('M_cage', (0.55, 0.56, 0.58), 0.35, 0.85),
    'lamp': mat('M_lamp', (1.0, 0.95, 0.85), 0.15, 0.0, (1.0, 0.92, 0.75), 1.5),
    'tail': mat('M_tail', (0.7, 0.05, 0.03), 0.3, 0.0, (0.9, 0.08, 0.05), 1.2),
}
out = []
for key, objs in parts.items():
    for o in objs:
        o.data.materials.clear(); o.data.materials.append(M[key])
    out.append(join(objs, f'CAR_{key}'))

# ---------------- wheels (hub origin; tyre + 5-spoke rim) ----------------
rubber = mat('M_rubber', (0.025, 0.025, 0.028), 0.9)
rim = mat('M_rim', (0.72, 0.73, 0.75), 0.3, 0.9)
for name, x, z in (('FL', 0.85, 1.35), ('FR', -0.85, 1.35), ('RL', 0.85, -1.35), ('RR', -0.85, -1.35)):
    tyre = cyl('tyre', 0.37, 0.32, (0, 0, 0), verts=28)
    bev = tyre.modifiers.new('b', 'BEVEL'); bev.width = 0.06; bev.segments = 3
    bpy.context.view_layer.objects.active = tyre; bpy.ops.object.modifier_apply(modifier='b')
    tyre.data.materials.append(rubber)
    hub = cyl('rim', 0.24, 0.33, (0, 0, 0), verts=20); hub.data.materials.append(rim)
    spokes = []
    for k in range(5):
        a = k * 2 * math.pi / 5
        s = box('spoke', (0.05, 0.44, 0.02), (0, 0, 0.17)); s.rotation_euler = (0, 0, a); s.data.materials.append(rim); spokes.append(s)
    w = join([tyre, hub] + spokes, f'CAR_wheel_{name}')
    # cylinder axis is Blender z → turn it to the axle (Blender x), then move to the hub
    w.rotation_euler = (0, math.pi / 2, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    w.location = T(x, 0.37, z)
    out.append(w)

os.makedirs(CACHE, exist_ok=True)
export_glb(os.path.join(CACHE, 'car_raw.glb'), out)
if args().get('preview'):
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); link(sun)
    sun.data.energy = 4; sun.rotation_euler = (math.radians(50), 0, math.radians(40))
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.8, 0.5, 0.35, 1)
    for i, (loc, look) in enumerate(((T(4.2, 1.8, 4.6), T(0, 0.6, 0)), (T(-4.5, 1.4, -4.0), T(0, 0.6, 0)), (T(0.38, 1.12, -0.35), T(0.38, 0.9, 3.0)))):
        preview_camera(loc, look, lens=24 if i < 2 else 14)
        render_preview(os.path.join(CACHE, f'car_preview_{i}.png'), 640, 360, samples=12)
print('CAR', {o.name: len(o.data.polygons) for o in out})
