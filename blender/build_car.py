"""The stunt car (a 1970s-style orange fastback coupé, twin black stripes) → blender/cache/car_raw.glb
(then tools/optimize.mjs → assets/car.glb).

Run:  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" -b --factory-startup --python blender/build_car.py
          [-- --preview .superpowers/car-agent]   (renders 6 views after the export; --engine BLENDER_EEVEE to try Eevee)
      node tools/optimize.mjs blender/cache/car_raw.glb assets/car.glb --no-compress

Written in three.js car-local coordinates (metres, y up, the car faces +z, the driver sits on +x) and converted with
T(): Blender (x, y, z) = three (x, -z, y). Origin = ground centre.

Body: one quad cage (rings along z, a fixed column count) with loops on every boundary that matters — the stripe edges
(|x| = 0.06 / 0.30, the band paintMaterial() paints) and the window openings. Materials are set on the cage, window faces
are cut out, then Subdivision (1) → Solidify (inner skin = M_interior, window rims = M_trim) → wheel-arch booleans.
The window faces themselves, subdivided the same way, become the glass (M_glass, its own node CAR_glass).

Nodes: CAR_paint (body shell: M_paint + M_stripe + inner skin + rims; also arch lips), CAR_glass, CAR_detail (grille,
lamps, bumpers, mirrors, trim), CAR_interior (dash, gauges, seats, cage...), CAR_steer (optional steering wheel at the
game's 'wheel' pose), CAR_wheel_FL/FR/RL/RR (origin at the hub, spin about local x, radius 0.368).
The sight line from the driver's eye (0.38, 1.12, -0.35) is checked by ray casts at the end of every build.
"""
import bpy, bmesh, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa
from mathutils import Vector, Matrix
from collections import Counter
from mathutils.bvhtree import BVHTree

sc = reset()
ARGS = args()
R_WHEEL = 0.368
ARCH_R = 0.425                  # wheel-arch radius: 5.7 cm over the tyre
EYE = (0.38, 1.12, -0.35)


def T(x, y, z):
    return Vector((x, -z, y))


def U(v):                       # Blender → three
    return Vector((v.x, v.z, -v.y))


def ss(a, b, t):
    u = min(1, max(0, (t - a) / (b - a)))
    return u * u * (3 - 2 * u)


def lerp(a, b, t):
    return a + (b - a) * t


def curve(keys, t):
    """Hermite spline through (z, value) keys (secant tangents), clamped at the ends."""
    ks = sorted(keys)
    if t <= ks[0][0]:
        return ks[0][1]
    if t >= ks[-1][0]:
        return ks[-1][1]
    i = max(j for j in range(len(ks) - 1) if ks[j][0] <= t)
    z0, y0 = ks[max(i - 1, 0)]; z1, y1 = ks[i]; z2, y2 = ks[i + 1]; z3, y3 = ks[min(i + 2, len(ks) - 1)]
    m1 = (y2 - y0) / (z2 - z0) if z2 != z0 else 0
    m2 = (y3 - y1) / (z3 - z1) if z3 != z1 else 0
    h, u = z2 - z1, (t - z1) / (z2 - z1)
    return (2 * u**3 - 3 * u**2 + 1) * y1 + (u**3 - 2 * u**2 + u) * h * m1 + (-2 * u**3 + 3 * u**2) * y2 + (u**3 - u**2) * h * m2


# ---------------- materials (≤ 10; values all distinct so gltf-transform dedup keeps them apart) ----------------
M = {
    'paint': mat('M_paint', (0.87, 0.20, 0.012), 0.24, 0.2),                    # the game swaps it for its own paint
    'stripe': mat('M_stripe', (0.016, 0.016, 0.018), 0.32, 0.15),
    'trim': mat('M_trim', (0.03, 0.03, 0.033), 0.62, 0.0),
    'chrome': mat('M_chrome', (0.86, 0.86, 0.88), 0.14, 1.0),
    'glass': mat('M_glass', (0.025, 0.035, 0.045), 0.04, 0.0, alpha=0.35),
    'lamp': mat('M_lamp', (1.0, 0.95, 0.85), 0.15, 0.0, (1.0, 0.92, 0.75), 1.5),
    'tail': mat('M_tail', (0.7, 0.05, 0.03), 0.3, 0.0, (0.9, 0.08, 0.05), 1.2),
    'interior': mat('M_interior', (0.075, 0.068, 0.065), 0.82, 0.0),
    'rubber': mat('M_rubber', (0.021, 0.021, 0.023), 0.9, 0.0),
    'white': mat('M_white', (0.82, 0.80, 0.76), 0.5, 0.0),
}

parts = {}                      # node name → [objects]


def P(node, o, key=None):
    if key:
        o.data.materials.clear(); o.data.materials.append(M[key])
    parts.setdefault(node, []).append(o)
    return o


def mesh3(name, verts3, faces, key=None, node=None, smooth_deg=40, outward=None):
    """Mesh from three.js-space verts. outward(centre3) → a three.js vector the faces should point along."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([T(*v) for v in verts3], [], faces)
    me.update()
    if outward:
        b = bmesh.new(); b.from_mesh(me)
        flip = [f for f in b.faces if U(f.normal).dot(Vector(outward(U(f.calc_center_median())))) < 0]
        bmesh.ops.reverse_faces(b, faces=flip)
        b.to_mesh(me); b.free()
    o = link(bpy.data.objects.new(name, me))
    smooth(o, smooth_deg)
    if key:
        o.data.materials.append(M[key])
    if node:
        P(node, o)
    return o


def blk(node, key, size3, loc3, bevel=0.0, rot=(0, 0, 0)):
    o = box('blk', (size3[0], size3[2], size3[1]), T(*loc3), bevel=bevel)
    o.rotation_euler = (-rot[0], rot[2], -rot[1])           # three (rx, ry, rz) → Blender (−rx about x, rz about y, −ry about z)
    return P(node, o, key)


def bar(node, key, a, b, r=0.02, verts=8):
    A, B = T(*a), T(*b)
    v = B - A
    o = cyl('bar', r, v.length, (A + B) / 2, verts=verts)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(v.normalized())
    return P(node, o, key)


def apply_mod(o, m):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


# =====================================================================================================================
# BODY CAGE
# columns (half): 1 bottom, 2 bottom corner, 3 rocker, 4 lower side, 5 upper side, 6 shoulder, 7 belt crease,
#                 8 window sill, 9 side-window top / pillar lower edge, 10 roof edge (windshield/backlight edge),
#                 11 x=0.30, 12 x=0.18, 13 x=0.06 (stripe edges), + centre bottom (0) and centre top (14)
# =====================================================================================================================
Z_COWL, Z_HDR, Z_BLT, Z_QW, Z_DECK = 0.41, -0.20, -0.70, -0.92, -1.55
ZS = [-2.20, -2.16, -2.08, -1.95, -1.78, -1.55, -1.35, -1.12, -0.92, -0.70, -0.45, -0.20,
      -0.05, 0.10, 0.25, 0.41, 0.58, 0.75, 0.95, 1.15, 1.35, 1.55, 1.78, 1.95, 2.08, 2.16, 2.20]
YB = [(-2.2, 0.31), (-1.9, 0.27), (-1.6, 0.22), (-1.2, 0.20), (1.2, 0.20), (1.6, 0.22), (1.9, 0.25), (2.2, 0.29)]
W = [(-2.2, 0.80), (-2.08, 0.875), (-1.9, 0.92), (-1.35, 0.958), (-0.85, 0.92), (-0.3, 0.90), (0.4, 0.90),
     (0.9, 0.925), (1.35, 0.945), (1.85, 0.915), (2.08, 0.87), (2.2, 0.80)]
YBELT = [(-2.2, 1.005), (-2.08, 1.0), (-1.9, 0.985), (-1.35, 0.962), (-0.7, 0.935), (0.0, 0.915), (0.41, 0.912),
         (1.35, 0.87), (1.9, 0.835), (2.2, 0.80)]
YTOP0 = [(-2.2, 1.02), (-2.12, 1.035), (-1.95, 1.005), (-1.75, 0.99), (-1.55, 0.985), (0.41, 0.94), (0.9, 0.93),
         (1.5, 0.902), (1.9, 0.86), (2.1, 0.825), (2.2, 0.795)]
YROOF = [(-0.70, 1.28), (-0.45, 1.315), (-0.20, 1.315)]
XR = [(-0.70, 0.665), (-0.45, 0.70), (-0.20, 0.70)]


def hood_y(z, x):
    y = curve(YTOP0, z) - 0.035 * (x / 0.9) ** 2
    if x <= 0.29:                                              # hood power bulge between the stripes' outer edges
        f = ss(0.72, 0.98, z) * (1 - ss(1.72, 1.98, z))
        y += 0.028 * f * (0.6 if x > 0.25 else 1.0)
    return y


def stripe_cols(x10, x12=0.17):
    """Cage x of columns 11-13 so the subdivided stripe edges land at |x| = 0.06 and 0.30 (the band paintMaterial()
    paints): a loop's limit across the columns is (left + 4·self + right) / 6, so solve that for the column."""
    return ((6 * 0.30 - x10 - x12) / 4, x12, (6 * 0.06 - x12) / 4)


def tpl_flat(z, wsh, yl):
    return [(wsh - 0.045, yl + 0.006), (0.72, hood_y(z, 0.72)), (0.52, hood_y(z, 0.52))] + \
           [(x, hood_y(z, x)) for x in stripe_cols(0.52)] + [(0, hood_y(z, 0))]


def tpl_bunched(z, wsh, yl):
    return [(wsh - 0.032, yl + 0.006), (wsh - 0.046, yl + 0.012), (wsh - 0.062, yl + 0.018)] + \
           [(x, hood_y(z, x)) for x in stripe_cols(wsh - 0.062)] + [(0, hood_y(z, 0))]


def tpl_cabin(z, wsh, yl):
    yr, xr, rc = curve(YROOF, z), curve(XR, z), 0.035
    yre = yr - rc
    return [(wsh - 0.045, yl + 0.006), (xr + 0.028, yre - 0.032), (xr, yre)] + \
           [(x, yr - rc * (x / xr) ** 2) for x in stripe_cols(xr, 0.16)] + [(0, yr)]


def sec(z):
    yb, w, yl = curve(YB, z), curve(W, z), curve(YBELT, z)
    wsh = w - 0.03
    side = [(0.55 * w, yb), (0.93 * w, yb + 0.015), (0.975 * w, yb + 0.09), (w - 0.012, yb + 0.36 * (yl - yb)),
            (w, yb + 0.68 * (yl - yb)), (wsh, yl - 0.035), (wsh - 0.022, yl)]
    if abs(z - Z_COWL) < 1e-6 or abs(z - Z_DECK) < 1e-6:
        top = tpl_bunched(z, wsh, yl)
    elif z > Z_COWL or z < Z_DECK:
        top = tpl_flat(z, wsh, yl)
    elif Z_HDR < z < Z_COWL:                                   # windshield: straight A-pillar, slightly bowed glass
        t = (Z_COWL - z) / (Z_COWL - Z_HDR)
        a = tpl_bunched(Z_COWL, curve(W, Z_COWL) - 0.03, curve(YBELT, Z_COWL))
        b = tpl_cabin(Z_HDR, curve(W, Z_HDR) - 0.03, curve(YBELT, Z_HDR))
        top = [(wsh - 0.045, yl + 0.006)] + [(lerp(p[0], q[0], t), lerp(p[1], q[1], t)) for p, q in zip(a[1:], b[1:])]
        bow = math.sin(math.pi * t)
        top = top[:2] + [(top[2][0], top[2][1] + 0.010 * bow)] + [(x, y + 0.022 * bow) for x, y in top[3:]]
    elif Z_DECK < z < Z_BLT:                                   # fastback: backlight + sail panel
        t = (Z_BLT - z) / (Z_BLT - Z_DECK)
        a = tpl_cabin(Z_BLT, curve(W, Z_BLT) - 0.03, curve(YBELT, Z_BLT))
        b = tpl_bunched(Z_DECK, curve(W, Z_DECK) - 0.03, curve(YBELT, Z_DECK))
        top = [(wsh - 0.045, yl + 0.006)] + [(lerp(p[0], q[0], t), lerp(p[1], q[1], t)) for p, q in zip(a[1:], b[1:])]
        y9 = curve([(Z_BLT, a[1][1]), (Z_QW, 1.10), (-1.20, 1.03), (Z_DECK, b[1][1])], z)
        bow = math.sin(math.pi * t)
        top = [top[0], (top[1][0], y9), (top[2][0], top[2][1] + 0.012 * bow)] + [(x, y + 0.03 * bow) for x, y in top[3:]]
    else:
        top = tpl_cabin(z, wsh, yl)
    half = side + top                                          # cols 1..14 (14 = centre top)
    pts = [(0.0, yb)] + half[:-1] + [(0.0, half[-1][1])] + [(-x, y) for x, y in reversed(half[:-1])]
    return pts                                                 # 28 points


def colof(k):
    return k if k <= 14 else 28 - k


def classify(zm, lo, hi):
    if lo >= 10 and Z_HDR < zm < Z_COWL:
        return 'glass'
    if lo >= 10 and Z_DECK < zm < Z_BLT:
        return 'glass'
    if (lo, hi) == (8, 9) and Z_QW < zm < Z_COWL:
        return 'glass'
    if (lo, hi) in ((11, 12), (12, 13)):
        return 'stripe?'
    return 'paint'


SLOT = {'paint': 0, 'stripe': 1, 'glass': 6}
bm = bmesh.new()
V = [[bm.verts.new(T(x, y, z)) for x, y in sec(z)] for z in ZS]
kinds = {}
for i in range(len(ZS) - 1):
    zm = (ZS[i] + ZS[i + 1]) / 2
    for k in range(28):
        a, b = colof(k), colof((k + 1) % 28)
        f = bm.faces.new((V[i][k], V[i][(k + 1) % 28], V[i + 1][(k + 1) % 28], V[i + 1][k]))
        kinds[f] = classify(zm, min(a, b), max(a, b))
for ring in (V[0], V[-1]):
    ctr = sum((v.co for v in ring), Vector()) / len(ring)
    prev = ring
    for sc_ in (0.80, 0.45):
        cur = [bm.verts.new(ctr + (v.co - ctr) * sc_) for v in ring]
        for k in range(28):
            bm.faces.new((prev[k], prev[(k + 1) % 28], cur[(k + 1) % 28], cur[k]))
        prev = cur
    bm.faces.new(prev)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
for f in bm.faces:
    kd = kinds.get(f, 'paint')
    if kd == 'stripe?':
        c = f.calc_center_median()
        kd = 'stripe' if (f.normal.z > 0.3 and c.z > 0.6) else 'paint'
    f.material_index = SLOT[kd]
cage = bpy.data.meshes.new('cage')
bm.to_mesh(cage); bm.free()


def sub_object(name, keep):
    me = cage.copy(); me.name = name
    o = link(bpy.data.objects.new(name, me))
    b = bmesh.new(); b.from_mesh(me)
    bmesh.ops.delete(b, geom=[f for f in b.faces if not keep(f)], context='FACES')
    bmesh.ops.delete(b, geom=[v for v in b.verts if not v.link_faces], context='VERTS')
    b.to_mesh(me); b.free()
    return o


body = sub_object('body', lambda f: f.material_index != 6)
glass = sub_object('glass', lambda f: f.material_index == 6)
for key in ('paint', 'stripe', 'interior', 'interior', 'trim', 'trim'):
    body.data.materials.append(M[key])
glass.data.materials.append(M['glass'])
for f in glass.data.polygons:
    f.material_index = 0

for o in (body, glass):
    m = o.modifiers.new('sub', 'SUBSURF'); m.levels = m.render_levels = 1; m.boundary_smooth = 'ALL'
    apply_mod(o, m)
m = body.modifiers.new('solid', 'SOLIDIFY')
m.thickness = 0.022; m.offset = -1; m.use_rim = True; m.use_even_offset = True
m.material_offset = 2; m.material_offset_rim = 4
apply_mod(body, m)
idx = [{0: 0, 1: 1, 2: 2, 3: 2, 4: 3, 5: 3}[pl.material_index] for pl in body.data.polygons]
body.data.materials.clear()                                    # (clear() resets the face indices, so remap after it)
for key in ('paint', 'stripe', 'interior', 'trim'):
    body.data.materials.append(M[key])
for pl, i in zip(body.data.polygons, idx):                     # collapse the duplicate slots before the booleans
    pl.material_index = i

# wheel arches: one short cutter per wheel (only the side skin goes); the cut faces are M_trim
n0 = len(body.data.polygons)
for x in (-1, 1):
    for zc in (-1.35, 1.35):
        cut = cyl('arch', ARCH_R, 0.8, T(x * 0.98, R_WHEEL, zc), verts=48)
        cut.rotation_euler = (0, math.pi / 2, 0)
        for key in ('paint', 'stripe', 'interior', 'trim'):
            cut.data.materials.append(M[key])
        for pl in cut.data.polygons:
            pl.material_index = 3                              # INDEX mode keeps the body's indices; cut faces → M_trim
        mb = body.modifiers.new('arch', 'BOOLEAN'); mb.operation = 'DIFFERENCE'; mb.object = cut; mb.solver = 'EXACT'
        mb.material_mode = 'INDEX'
        apply_mod(body, mb)
        bpy.data.objects.remove(cut)
print('BOOLEAN faces', n0, '→', len(body.data.polygons), 'per slot', Counter(p.material_index for p in body.data.polygons))

# keep the inner skin only where it can be seen (the cabin); merge duplicate slots
b = bmesh.new(); b.from_mesh(body.data)
slot_names = [s.name for s in body.data.materials]
drop = []
for f in b.faces:
    nm = slot_names[f.material_index]
    if nm == 'M_interior':
        c = U(f.calc_center_median())
        if not (-1.62 < c.z < 0.64 and c.y > 0.33):
            drop.append(f)
bmesh.ops.delete(b, geom=drop, context='FACES')
bmesh.ops.delete(b, geom=[v for v in b.verts if not v.link_faces], context='VERTS')
first = {}
for i, nm in enumerate(slot_names):
    first.setdefault(nm, i)
for f in b.faces:
    f.material_index = first[slot_names[f.material_index]]
b.to_mesh(body.data); b.free()
bpy.context.view_layer.objects.active = body
for o in bpy.context.selected_objects:
    o.select_set(False)
body.select_set(True)
bpy.ops.object.material_slot_remove_unused()
smooth(body, 42)
P('CAR_paint', body)

# glass sits 1 cm inside the outer skin, within the black rim
gb = bmesh.new(); gb.from_mesh(glass.data)
gb.normal_update()
for v in gb.verts:
    v.co -= v.normal * 0.011
gb.to_mesh(glass.data); gb.free()
smooth(glass, 60)
P('CAR_glass', glass)

body_bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())


def cast3(o3, d3, dist=6.0, bvh=None):
    d = T(*d3).normalized()
    loc, nrm, idx, dd = (bvh or body_bvh).ray_cast(T(*o3), d, dist)
    if loc is None:
        return None
    n = U(nrm)
    if n.dot(U(d)) > 0:
        n = -n
    return U(loc), n


# ---------------- arch liners (dark wells so the hollow body never shows) ----------------
for sx in (-1, 1):
    for zc in (-1.35, 1.35):
        verts, faces, N = [], [], 20
        for i in range(N + 1):
            a = math.radians(-20 + 220 * i / N)
            y, z = R_WHEEL + (ARCH_R + 0.01) * math.sin(a), zc + (ARCH_R + 0.01) * math.cos(a)
            h = cast3((sx * 2.0, R_WHEEL + 0.47 * math.sin(a), zc + 0.47 * math.cos(a)), (-sx, 0, 0))
            xo = (abs(h[0].x) - 0.012) if h else 0.90
            verts += [(sx * 0.60, y, z), (sx * xo, y, z), (sx * 0.60, R_WHEEL + 0.10 * math.sin(a), zc + 0.10 * math.cos(a))]
        for i in range(N):
            a, b2 = 3 * i, 3 * (i + 1)
            faces += [(a, b2, b2 + 1, a + 1), (a + 2, b2 + 2, b2, a)]
        mesh3('liner', verts, faces, 'trim', 'CAR_detail', 30)

# ---------------- arch lips (rolled fender flares, conformed to the body) ----------------
PROF = [(-0.012, -0.018), (-0.006, 0.010), (0.006, 0.020), (0.022, 0.016), (0.040, 0.004), (0.052, -0.010)]
for sx in (-1, 1):
    for zc in (-1.35, 1.35):
        verts, faces, N, rows = [], [], 26, 0
        for i in range(N + 1):
            a = math.radians(-14 + 208 * i / N)
            ry, rz = math.sin(a), math.cos(a)
            y, z = R_WHEEL + 0.47 * ry, zc + 0.47 * rz
            h = cast3((sx * 2.0, y, z), (-sx, 0, 0))
            if not h:
                continue
            xs = h[0].x
            for dr, dx in PROF:
                r = ARCH_R + dr
                verts.append((xs + sx * dx, R_WHEEL + r * ry, zc + r * rz))
            rows += 1
        n = len(PROF)
        for i in range(rows - 1):
            for j in range(n - 1):
                faces.append((i * n + j, (i + 1) * n + j, (i + 1) * n + j + 1, i * n + j + 1))
        mesh3('lip', verts, faces, 'paint', 'CAR_paint', 50,
              outward=lambda c, sx=sx, zc=zc: (sx * 1.0, (c.y - R_WHEEL) * 0.8, (c.z - zc) * 0.8))

# =====================================================================================================================
# EXTERIOR DETAILS (placed on the finished shell by ray casts, so they follow its real, subdivided surface)
# =====================================================================================================================
D = 'CAR_detail'


def hit_z(x, y, front=True):
    h = cast3((x, y, 3.0 if front else -3.0), (0, 0, -1 if front else 1))
    return h[0].z if h else (2.2 if front else -2.2)


def hit_y(x, z):
    h = cast3((x, 3.0, z), (0, -1, 0))
    return h[0].y if h else 0.9


def hit_side(sx, y, z):
    return cast3((sx * 2.0, y, z), (-sx, 0, 0))


def frame_at(n):
    """(u, v) on a surface with normal n: v = 'up' in the surface, u = the outside viewer's right."""
    up = Vector((0, 1, 0))
    v = (up - n * n.dot(up)).normalized()
    return v.cross(n).normalized(), v


def decal(node, key, c, n, pts2, lift, tris=None):
    """Flat 2-D shape (u, v list) laid on the body around surface point c (normal n), each vertex re-cast onto the skin."""
    u, v = frame_at(n)
    vs = []
    for a, b in pts2:
        p = c + u * a + v * b
        h = cast3(tuple(p + n * 0.08), tuple(-n), 0.3)
        vs.append(tuple((h[0] if h else p) + n * lift))
    faces = tris or [tuple(range(len(vs)))]
    return mesh3('decal', vs, faces, key, node, 60, outward=lambda _c, n=n: tuple(n))


def disc_pts(r, k=24):
    return [(r * math.cos(2 * math.pi * i / k), r * math.sin(2 * math.pi * i / k)) for i in range(k)]


def fan(k):
    return [(0, i, i % k + 1) for i in range(1, k + 1)]


def decal_disc(node, key, c, n, r, lift, k=24):
    return decal(node, key, c, n, [(0, 0)] + disc_pts(r, k), lift, fan(k))


def ribbon(node, key, samples, width, lift=0.003):
    """samples: [(point, normal)] along a line on the skin → a thin strip (panel gaps, seams, vents)."""
    vs, faces = [], []
    for i, (p, n) in enumerate(samples):
        q = samples[min(i + 1, len(samples) - 1)][0] - samples[max(i - 1, 0)][0]
        a = n.cross(q).normalized() * (width / 2)
        vs += [tuple(p + n * lift + a), tuple(p + n * lift - a)]
    for i in range(len(samples) - 1):
        faces.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
    nav = sum((n for _, n in samples), Vector()).normalized()
    return mesh3('ribbon', vs, faces, key, node, 60, outward=lambda _c, nav=nav: tuple(nav))


def sweep(node, key, path, prof, centre, closed_prof=True, caps=True, smooth_deg=50):
    """Profile [(u = outward, v = up)] swept along a three.js path; 'outward' points away from `centre` (x, z)."""
    vs, n = [], len(prof)
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        o = t.cross(Vector((0, 1, 0))).normalized()
        if o.dot(Vector((p.x - centre[0], 0, p.z - centre[1]))) < 0:
            o = -o
        up = o.cross(t).normalized()
        if up.y < 0:
            up = -up
        vs += [tuple(p + o * a + up * b) for a, b in prof]
    faces = []
    for i in range(len(path) - 1):
        for j in range(n if closed_prof else n - 1):
            faces.append((i * n + j, (i + 1) * n + j, (i + 1) * n + (j + 1) % n, i * n + (j + 1) % n))
    if caps:
        faces += [tuple(range(n))[::-1], tuple(range((len(path) - 1) * n, len(path) * n))]
    o = mesh3('sweep', vs, faces, key, node, smooth_deg)
    b = bmesh.new(); b.from_mesh(o.data); bmesh.ops.recalc_face_normals(b, faces=b.faces[:]); b.to_mesh(o.data); b.free()
    return o


def outline(y, zc, front, zlim, out=0.0, n=40):
    """Plan outline of the body at height y around the nose (front) or tail, cast outward from (0, y, zc)."""
    pts = []
    for i in range(n + 1):
        a = math.radians(-88 + 176 * i / n)
        d = Vector((math.sin(a), 0, math.cos(a) * (1 if front else -1)))
        h = cast3((0, y, zc), tuple(d), 4.0)
        if not h:
            continue
        p = h[0] + Vector((d.x, 0, d.z)) * out
        if (p.z > zlim) if front else (p.z < -zlim):
            pts.append(Vector((p.x, y, p.z)))
    return pts


def round_lamp(c, r):
    """A round headlamp facing +z: chrome bezel + slightly domed lens (lathe about Blender z → turned to three z)."""
    bez = lathe('bezel', [(r * 0.80, 0.004), (r * 1.0, 0.014), (r * 1.12, 0.006), (r * 1.10, -0.012)], (0, 0, 0),
                M['chrome'], steps=20)
    lens = lathe('lens', [(0.0, 0.016), (r * 0.5, 0.013), (r * 0.82, 0.006), (r * 0.82, -0.004)], (0, 0, 0),
                 M['lamp'], steps=20)
    for o in (bez, lens):
        o.rotation_euler = (math.pi / 2, 0, 0)          # Blender z → Blender -y = three +z
        o.location = T(*c)
        P(D, o)


# --- front: black full-width grille with four round lamps and a chrome surround, chrome blade bumper, chin spoiler
zf = hit_z(0, 0.60)
blk(D, 'trim', (1.30, 0.20, 0.05), (0, 0.60, zf - 0.012), bevel=0.012)
for yy in (0.70, 0.50):
    blk(D, 'chrome', (1.32, 0.012, 0.012), (0, yy + (0.004 if yy > 0.6 else -0.004), zf + 0.016))
for sx in (-1, 1):
    blk(D, 'chrome', (0.012, 0.21, 0.012), (sx * 0.66, 0.60, hit_z(sx * 0.66, 0.60) + 0.012))
    for lx in (0.39, 0.56):
        round_lamp((sx * lx, 0.60, hit_z(sx * lx, 0.60) + 0.008), 0.068)
for yy in (0.575, 0.625):                                                    # thin grille bars between the lamps
    blk(D, 'stripe', (0.54, 0.008, 0.008), (0, yy, zf + 0.012))
blk(D, 'chrome', (0.10, 0.045, 0.012), (0, 0.60, zf + 0.018), bevel=0.005)   # centre badge
BUMPER = [(-0.03, 0.045), (0.008, 0.05), (0.026, 0.036), (0.033, 0.0), (0.026, -0.036), (0.008, -0.05), (-0.03, -0.045)]
sweep(D, 'chrome', outline(0.42, 1.60, True, 1.86, 0.012), BUMPER, (0, 1.60))
sweep(D, 'trim', outline(0.285, 1.60, True, 1.90, 0.0),
      [(-0.03, 0.03), (0.02, 0.03), (0.06, -0.012), (0.06, -0.024), (-0.03, -0.024)], (0, 1.60))
for sx in (-1, 1):                                                           # parking lamps in the valance
    blk(D, 'lamp', (0.16, 0.035, 0.02), (sx * 0.52, 0.335, hit_z(sx * 0.52, 0.335) + 0.004), bevel=0.006)

# --- rear: black tail panel with twin three-cell tail lamps, centre fuel filler, plate, chrome bumper, exhausts
zt = hit_z(0, 0.80, False)
blk(D, 'trim', (1.52, 0.19, 0.04), (0, 0.80, zt + 0.012), bevel=0.012)
for sx in (-1, 1):
    blk(D, 'tail', (0.50, 0.12, 0.03), (sx * 0.47, 0.80, zt - 0.003), bevel=0.008)
    for dx in (-0.085, 0.085):
        blk(D, 'chrome', (0.012, 0.13, 0.012), (sx * 0.47 + dx, 0.80, zt - 0.016))
    blk(D, 'chrome', (0.52, 0.010, 0.012), (sx * 0.47, 0.865, zt - 0.014))
    blk(D, 'chrome', (0.52, 0.010, 0.012), (sx * 0.47, 0.735, zt - 0.014))
o = cyl('filler', 0.05, 0.02, T(0, 0.80, zt - 0.012), M['chrome'], verts=20); o.rotation_euler = (math.pi / 2, 0, 0); P(D, o)
zp = hit_z(0, 0.615, False)
blk(D, 'white', (0.32, 0.15, 0.012), (0, 0.615, zp - 0.006), bevel=0.006)
blk(D, 'trim', (0.34, 0.17, 0.008), (0, 0.615, zp - 0.001))
sweep(D, 'chrome', outline(0.48, -1.60, False, 1.86, 0.012), BUMPER, (0, -1.60))
sweep(D, 'trim', outline(0.33, -1.60, False, 1.95, 0.0), [(-0.03, 0.04), (0.012, 0.04), (0.02, -0.03), (-0.03, -0.03)], (0, -1.60))
for sx in (-1, 1):
    for r, key, h, dz in ((0.042, 'chrome', 0.24, 0.0), (0.033, 'rubber', 0.02, -0.115)):
        o = cyl('pipe', r, h, T(sx * 0.50, 0.27, -2.12 + dz), M[key], verts=16)
        o.rotation_euler = (math.pi / 2, 0, 0); P(D, o)

# --- sides: door gaps, handle, mirror, skirt, number roundel, fuel cap, quarter-window divider
DOOR_F, DOOR_R, DOOR_B = 0.47, -0.78, 0.30
for sx in (-1, 1):
    top_f, top_r = curve(YBELT, DOOR_F) - 0.02, curve(YBELT, DOOR_R) - 0.02
    line = [(DOOR_F, top_f - 0.02 * i) for i in range(int((top_f - DOOR_B - 0.04) / 0.02))]
    line += [(DOOR_F - 0.01, DOOR_B + 0.012)]
    line += [(DOOR_F - 0.04 - 0.05 * i, DOOR_B) for i in range(int((DOOR_F - DOOR_R - 0.08) / 0.05))]
    line += [(DOOR_R + 0.01, DOOR_B + 0.012)]
    line += [(DOOR_R - 0.004 * i, DOOR_B + 0.04 + 0.02 * i) for i in range(int((top_r - DOOR_B - 0.04) / 0.02))]
    ribbon(D, 'trim', [h for h in (hit_side(sx, y, z) for z, y in line) if h], 0.007)
    h = hit_side(sx, curve(YBELT, -0.62) - 0.075, -0.62)                    # door handle
    if h:
        decal(D, 'chrome', h[0], h[1], [(-0.07, -0.012), (0.07, -0.012), (0.07, 0.012), (-0.07, 0.012)], 0.006)
    h = hit_side(sx, 0.60, -0.16)                                            # number roundel: black ring, white disc, "7"
    if h:
        c, n = h
        decal_disc(D, 'stripe', c, n, 0.168, 0.003)
        decal_disc(D, 'white', c, n, 0.150, 0.006)
        decal(D, 'stripe', c, n, [(-0.07, 0.065), (0.075, 0.065), (0.075, 0.10), (-0.07, 0.10)], 0.009)
        decal(D, 'stripe', c, n, [(0.038, 0.065), (0.075, 0.065), (0.0, -0.105), (-0.04, -0.105)], 0.009)
    path = []                                                                # side skirt between the arches
    for i in range(25):
        z = -0.86 + 1.72 * i / 24
        hh = hit_side(sx, 0.27, z)
        if hh:
            path.append(Vector((hh[0].x, 0.27, z)))
    sweep(D, 'trim', path, [(-0.02, 0.035), (0.010, 0.032), (0.022, 0.0), (0.016, -0.04), (-0.02, -0.045)], (0, 0))
    my = curve(YBELT, 0.33) + 0.075                                          # bullet mirror on the door
    hh = hit_side(sx, curve(YBELT, 0.33) - 0.01, 0.33)
    base = hh[0] if hh else Vector((sx * 0.9, my - 0.08, 0.33))
    mx = base.x + sx * 0.10
    o = lathe('mirror', [(0.0, -0.065), (0.048, -0.065), (0.055, -0.045), (0.05, 0.005), (0.034, 0.05), (0.0, 0.075)],
              (0, 0, 0), M['paint'], steps=16)
    o.rotation_euler = (math.pi / 2, 0, 0); o.location = T(mx, my, 0.33); P('CAR_paint', o)
    o = cyl('mglass', 0.045, 0.004, T(mx, my, 0.33 - 0.067), M['chrome'], verts=16); o.rotation_euler = (math.pi / 2, 0, 0); P(D, o)
    bar(D, 'chrome', (base.x - sx * 0.01, base.y, 0.34), (mx - sx * 0.02, my - 0.02, 0.335), 0.011, 8)
    if sx > 0:                                                               # chrome fuel cap, left rear quarter
        hh = hit_side(sx, 0.86, -1.88)
        if hh:
            decal_disc(D, 'chrome', hh[0], hh[1], 0.05, 0.004, 16)
    p0 = hit_side(sx, curve(YBELT, DOOR_R) + 0.02, DOOR_R)                  # divider: door glass | quarter glass
    if p0:
        bar(D, 'trim', (p0[0].x - sx * 0.02, curve(YBELT, DOOR_R) + 0.01, DOOR_R), (sx * 0.70, 1.215, DOOR_R), 0.012, 6)

# --- hood: blacked-out power scoop on the bulge, cowl vent, panel seams
rings = []
for i in range(8):
    z = 0.95 + 0.47 * i / 7
    hgt = 0.075 * ss(0.95, 1.30, z)
    hw = 0.15 + 0.05 * ss(0.95, 1.2, z)
    row = []
    for j in range(11):
        x = -hw + 2 * hw * j / 10
        e = max(0.0, 1 - (abs(x) / hw) ** 4) ** 0.5
        row.append((x, hit_y(x, z) - 0.006 + hgt * e, z))
    rings.append(row)
mesh3('scoop', [p for r in rings for p in r],
      [(i * 11 + j, i * 11 + j + 1, (i + 1) * 11 + j + 1, (i + 1) * 11 + j) for i in range(7) for j in range(10)],
      'stripe', D, 40, outward=lambda c: (0, 1, 0.3))
mesh3('mouth', [(x, y, z + 0.002) for x, y, z in rings[-1]], [tuple(range(11))], 'trim', D, 40, outward=lambda c: (0, 0, 1))


def seam(pts, width=0.007):
    ribbon(D, 'trim', [h for h in (cast3((x, 3.0, z), (0, -1, 0)) for x, z in pts) if h], width)


seam([(-0.74 + 1.48 * i / 30, 2.02) for i in range(31)])                                   # hood front edge
for sx in (-1, 1):
    seam([(sx * 0.74, 0.47 + 0.05 * i) for i in range(32)])                                # hood sides
    seam([(sx * 0.72, -1.62 - 0.05 * i) for i in range(11)])                                # deck lid sides
seam([(-0.72 + 1.44 * i / 30, -1.62) for i in range(31)])                                  # deck lid front
seam([(-0.72 + 1.44 * i / 30, -2.13) for i in range(31)])                                  # deck lid rear (ducktail lip)
seam([(-0.62 + 1.24 * i / 30, 0.47) for i in range(31)], 0.05)                             # cowl vent

# =====================================================================================================================
# WHEELS (hub origin, axle = local x, rim faces outward)
# =====================================================================================================================
_K = 0.105 / 0.118                                              # tyre half width 0.105: outer face at x = 0.955
TYRE = [(r, h * _K) for r, h in (
    (0.212, -0.100), (0.255, -0.113), (0.305, -0.118), (0.342, -0.110), (0.360, -0.092), (0.367, -0.066),
    (0.368, -0.030), (0.362, -0.022), (0.362, -0.010), (0.368, -0.004), (0.368, 0.030), (0.367, 0.066),
    (0.360, 0.092), (0.342, 0.110), (0.305, 0.118), (0.255, 0.113), (0.212, 0.100))]
LIP = [(r, h * _K) for r, h in ((0.200, 0.072), (0.214, 0.090), (0.229, 0.096), (0.231, 0.104), (0.214, 0.104))]
BARREL = [(0.201, -0.098 * _K), (0.199, 0.072 * _K)]


def spoke(a, key='chrome'):
    """A tapered, slightly dished spoke from the hub to the rim lip, at angle a (Blender local, axle = z)."""
    c, s = math.cos(a), math.sin(a)
    pts = []
    for r, w, h in ((0.045, 0.030, 0.088 * _K), (0.203, 0.019, 0.074 * _K)):
        for side in (-1, 1):
            for dh in (0.0, -0.028):
                pts.append(Vector((r * c - side * w * s, r * s + side * w * c, h + dh)))
    me = bpy.data.meshes.new('spoke')
    # verts: 0 in-left-top 1 in-left-bot 2 in-right-top 3 in-right-bot 4..7 outer
    me.from_pydata(pts, [], [(0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6), (0, 1, 3, 2), (4, 6, 7, 5)])
    o = link(bpy.data.objects.new('spoke', me)); smooth(o, 30)
    o.data.materials.append(M[key])
    return o


def make_wheel(name, x, z):
    objs = [lathe('tyre', TYRE, (0, 0, 0), M['rubber'], steps=32),
            lathe('lip', LIP, (0, 0, 0), M['chrome'], steps=32),
            lathe('barrel', BARREL, (0, 0, 0), M['trim'], steps=24),
            lathe('hub', [(0.0, 0.094), (0.028, 0.091), (0.046, 0.081), (0.050, 0.062)], (0, 0, 0), M['chrome'], steps=16),
            cyl('disc', 0.165, 0.022, (0, 0, -0.035), M['trim'], verts=24),
            cyl('back', 0.20, 0.004, (0, 0, -0.06), M['trim'], verts=24)]
    for k in range(5):
        a = k * 2 * math.pi / 5 + math.pi / 2
        objs.append(spoke(a))
        la = a + math.pi / 5
        objs.append(cyl('lug', 0.010, 0.02, (0.06 * math.cos(la), 0.06 * math.sin(la), 0.08), M['chrome'], verts=6))
    w = join(objs, name)
    w.rotation_euler = (0, math.pi / 2, 0 if x > 0 else math.pi)   # axle → Blender x; -x wheels turned 180° (no mirror)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    w.location = T(x, R_WHEEL, z)
    return w


wheels = [make_wheel(f'CAR_wheel_{n}', x, z) for n, x, z in
          (('FL', 0.85, 1.35), ('FR', -0.85, 1.35), ('RL', 0.85, -1.35), ('RR', -0.85, -1.35))]

# =====================================================================================================================
# INTERIOR (low dash, binnacle in front of the driver only, console, buckets, cage behind the windshield view)
# =====================================================================================================================
I = 'CAR_interior'
blk(I, 'interior', (1.66, 0.03, 1.80), (0, 0.37, -0.28))                              # floor
blk(I, 'interior', (0.26, 0.17, 1.55), (0, 0.45, -0.18), bevel=0.06)                 # tunnel
blk(I, 'interior', (1.66, 0.50, 0.03), (0, 0.61, 0.62))                               # firewall / footwell
blk(I, 'interior', (1.66, 0.17, 0.36), (0, 0.805, 0.46), bevel=0.05)                 # dash (top ≈ 0.89, runs under the cowl)
blk(I, 'interior', (1.40, 0.16, 0.10), (0, 0.69, 0.34), bevel=0.03)                  # lower dash / knee panel
blk(I, 'interior', (0.29, 0.05, 0.19), (0.38, 0.94, 0.38), bevel=0.024)             # binnacle hood (top ≈ 0.965, overhangs the gauges)
blk(I, 'interior', (0.28, 0.12, 0.12), (0.38, 0.86, 0.37), bevel=0.02)               # gauge pod under it
blk(I, 'interior', (0.24, 0.30, 0.26), (0, 0.65, 0.42), bevel=0.04)                  # centre stack
blk(I, 'interior', (0.22, 0.09, 0.62), (0, 0.565, 0.02), bevel=0.03)                 # console
bar(I, 'chrome', (0, 0.60, 0.05), (0, 0.76, -0.01), 0.008)                            # shifter
o = cyl('knob', 0.025, 0.04, T(0, 0.775, -0.015), M['white'], verts=10); P(I, o)
for gx in (0.31, 0.45):                                                                # two round gauges facing the driver (tilted up 14°)
    for r, h, key, dz in ((0.056, 0.014, 'chrome', 0.0), (0.048, 0.014, 'white', -0.004)):
        g = cyl('gauge', r, h, T(gx, 0.875, 0.31 + dz), M[key], verts=20)
        g.rotation_euler = (math.radians(90 + 14), 0, 0)
        P(I, g)
    bar(I, 'stripe', (gx, 0.875, 0.297), (gx + 0.03, 0.902, 0.303), 0.004, 4)         # needle
for k, gx in enumerate((-0.07, 0.0, 0.07)):                                            # small centre-stack gauges
    g = cyl('cg', 0.026, 0.01, T(gx, 0.74, 0.288), M['white'], verts=12); g.rotation_euler = (math.radians(100), 0, 0); P(I, g)
for x in (-0.38, 0.38):                                                                 # bucket seats
    blk(I, 'rubber', (0.46, 0.10, 0.50), (x, 0.45, -0.30), bevel=0.04)
    for s in (-1, 1):
        blk(I, 'rubber', (0.07, 0.10, 0.46), (x + s * 0.215, 0.52, -0.30), bevel=0.03)
        blk(I, 'rubber', (0.07, 0.55, 0.16), (x + s * 0.225, 0.82, -0.62), bevel=0.03, rot=(-0.17, 0, 0))
    blk(I, 'rubber', (0.46, 0.74, 0.10), (x, 0.84, -0.66), bevel=0.04, rot=(-0.17, 0, 0))
    blk(I, 'interior', (0.04, 0.06, 0.45), (x * 2.15, 0.79, -0.08), bevel=0.015)       # door armrest
blk(I, 'interior', (1.66, 0.55, 0.03), (0, 0.66, -1.02))                              # rear bulkhead
blk(I, 'interior', (1.66, 0.03, 0.60), (0, 0.93, -1.32))                              # parcel shelf
# roll cage (white): main hoop behind the seats, roof rails to the header, rear braces, door bars
C = 0.021
for s in (-1, 1):
    bar(I, 'white', (s * 0.70, 0.38, -0.86), (s * 0.66, 1.13, -0.86), C)
    bar(I, 'white', (s * 0.62, 1.17, -0.86), (s * 0.60, 1.22, -0.22), C)
    bar(I, 'white', (s * 0.62, 1.15, -0.86), (s * 0.50, 0.94, -1.45), C)
    bar(I, 'white', (s * 0.74, 0.42, 0.50), (s * 0.74, 0.68, -0.86), C)
bar(I, 'white', (-0.66, 1.15, -0.86), (0.66, 1.15, -0.86), C)
bar(I, 'white', (-0.64, 1.13, -0.86), (0.68, 0.45, -0.86), C)
for s in (-1, 1):
    o = cyl('elbow', C, 0.08, T(s * 0.645, 1.15, -0.86), M['white'], verts=8); o.rotation_euler = (0, math.pi / 2, 0); P(I, o)

# steering column (along the game wheel's axis, into the binnacle) + optional steering wheel node CAR_steer
ax = Vector((0, math.sin(0.45), math.cos(0.45)))                    # three local +z after rotation.x = -0.45
hub = Vector((0.38, 0.80, 0.10))
bar(I, 'trim', tuple(hub + ax * 0.03), tuple(hub + ax * 0.19), 0.032, 10)


def make_steer():
    objs = []
    rim = lathe('rim', [(0.17 + 0.019 * math.cos(a), 0.019 * math.sin(a)) for a in
                        [2 * math.pi * k / 8 for k in range(9)]], (0, 0, 0), M['rubber'], steps=28)
    objs.append(rim)
    objs.append(cyl('hubc', 0.045, 0.04, (0, 0, -0.015), M['trim'], verts=14))
    for a in (0, math.pi, -math.pi / 2):                                 # three spokes: left, right, down
        s = box('sp', (0.15, 0.03, 0.008), (0.09 * math.cos(a), 0.09 * math.sin(a), -0.01), M['chrome'])
        s.rotation_euler = (0, 0, a)
        objs.append(s)
    w = join(objs, 'CAR_steer')
    # built in the three.js xy plane facing z (like TorusGeometry): three (x, y, z) → Blender (x, -z, y)
    w.rotation_euler = (math.pi / 2, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    w.location = T(0.38, 0.80, 0.10)
    w.rotation_euler = (-0.45, 0, 0)                                     # = the game's wheel.rotation.x
    return w


steer = make_steer()

# =====================================================================================================================
# JOIN + EXPORT
# =====================================================================================================================
out = []
for node, objs in parts.items():
    j = join(objs, node)
    j.data.transform(j.matrix_world); j.matrix_world = Matrix()   # every body node sits at the car origin
    out.append(j)
out += wheels + [steer]
for o in out:
    while o.data.uv_layers:
        o.data.uv_layers.remove(o.data.uv_layers[0])
st = Counter()                                                  # where the baked stripe edges really are
for pl in out[0].data.polygons if out[0].name == 'CAR_paint' else []:
    if out[0].data.materials[pl.material_index].name == 'M_stripe':
        for vi in pl.vertices:
            st[round(abs(out[0].data.vertices[vi].co.x), 3)] += 1
print('STRIPE |x| range', min(st), max(st))
_e = {}
for pl in out[0].data.polygons:
    if out[0].data.materials[pl.material_index].name == 'M_stripe':
        c = U(pl.center); xs_ = [abs(out[0].data.vertices[vi].co.x) for vi in pl.vertices]
        k = round(c.z * 2) / 2
        lo_, hi_ = _e.get(k, (9, 0))
        _e[k] = (min(lo_, min(xs_)), max(hi_, max(xs_)))
print('STRIPE edges by z:', {k: (round(a, 3), round(b, 3)) for k, (a, b) in sorted(_e.items())})
os.makedirs(CACHE, exist_ok=True)
export_glb(os.path.join(CACHE, 'car_raw.glb'), out)
print('CAR tris', {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in out})
print('CAR tris total', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in out))


# ---------------- measurements ----------------
def bbox3(objs):
    pts = [U(o.matrix_world @ v.co) for o in objs for v in o.data.vertices]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


lo, hi = bbox3([o for o in out if not o.name.startswith('CAR_wheel')])
print('BODY bbox three: x %.3f..%.3f  y %.3f..%.3f  z %.3f..%.3f' % (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
lo, hi = bbox3(wheels)
print('WHEELS bbox three: x %.3f..%.3f  y %.3f..%.3f' % (lo[0], hi[0], lo[1], hi[1]))


# ---------------- sight line from the driver's eye ----------------
def sightline():
    dg = bpy.context.evaluated_depsgraph_get()
    eye = T(*EYE)

    def first_solid(yaw, pitch, maxd=20.0):
        d3 = Vector((math.sin(math.radians(yaw)) * math.cos(math.radians(pitch)), math.sin(math.radians(pitch)),
                     math.cos(math.radians(yaw)) * math.cos(math.radians(pitch))))
        d = T(*d3).normalized()
        o, travelled, through = eye.copy(), 0.0, False
        for _ in range(8):
            hit, loc, nrm, idx, ob, _m = sc.ray_cast(dg, o, d, distance=maxd - travelled)
            if not hit:
                return None, through
            travelled += (loc - o).length
            mname = ob.material_slots[ob.data.polygons[idx].material_index].material.name
            if mname == 'M_glass':
                through = True
                o = loc + d * 1e-4
                continue
            return (ob.name, mname, U(loc), travelled), through
        return None, through

    def exterior(h):                     # the hood/cowl/fenders/mirrors, i.e. not the dash, binnacle or cabin skin
        name, mname, p = h[0], h[1], h[2]
        if name == 'CAR_interior' or mname == 'M_interior':
            return False
        return p.z > Z_COWL - 0.06 or abs(p.x) > 0.93
    res = {}
    # grid tests
    bad_up, bad_dn = [], []
    for yaw in range(-30, 31):
        for pitch in range(0, 21):
            h, _ = first_solid(yaw, pitch, 3.0)
            if h:
                bad_up.append((yaw, pitch, h[0], h[1], round(h[3], 2)))
        h, _ = first_solid(yaw, -8)
        if h and not exterior(h):
            bad_dn.append((yaw, h[0], h[1], tuple(round(c, 2) for c in h[2])))
    print('SIGHT pitch 0..20 x yaw ±30: %d of %d rays hit non-glass within 3 m' % (len(bad_up), 61 * 21), bad_up[:6])
    print('SIGHT pitch -8 x yaw ±30: %d of 61 rays hit cabin geometry before the hood' % len(bad_dn), bad_dn[:6])
    # margins
    dash = []
    for yaw in range(-30, 31, 5):
        p = -2.0
        while p > -30:
            h, _ = first_solid(yaw, p)
            if h and not exterior(h):
                dash.append((yaw, p, h[0], h[1]))
                break
            p -= 0.25
    print('SIGHT dash: highest pitch that meets cabin geometry, per yaw:', [(y, p) for y, p, *_ in dash])
    print('       worst %.2f deg (needs < -8)' % max(p for _, p, *_ in dash), [d for d in dash if d[1] == max(p for _, p, *_ in dash)][:2])
    pil = []
    for pitch in (0, 5, 10, 15, 20):
        row = []
        for sgn in (1, -1):
            yv = 0.0
            while yv < 80:
                h, _ = first_solid(sgn * yv, pitch, 2.0)
                if h:
                    row.append((sgn * yv, h[1]))
                    break
                yv += 0.25
        pil.append((pitch, row))
    print('SIGHT pillars: first non-glass yaw each side, per pitch:', pil)
    hdr = []
    for yaw in range(-30, 31, 10):
        p = 0.0
        while p < 60:
            h, _ = first_solid(yaw, p, 2.0)
            if h:
                hdr.append((yaw, p, h[1]))
                break
            p += 0.25
    print('SIGHT header: lowest pitch meeting roof/header, per yaw:', hdr)
    # the game's paint is front-side only: from either seat, no ray may first meet the back of an M_paint face
    for nm, e3 in (('seat', EYE), ('seatP', (-EYE[0], EYE[1], EYE[2]))):
        back, tot = [], 0
        for yaw in range(-180, 180, 3):
            for pitch in range(-60, 81, 3):
                d3 = Vector((math.sin(math.radians(yaw)) * math.cos(math.radians(pitch)), math.sin(math.radians(pitch)),
                             math.cos(math.radians(yaw)) * math.cos(math.radians(pitch))))
                d = T(*d3).normalized()
                o, tot = T(*e3), tot + 1
                for _ in range(8):
                    hit, loc, nrm, idx, ob, _m = sc.ray_cast(dg, o, d, distance=6.0)
                    if not hit:
                        break
                    pl = ob.data.polygons[idx]
                    mname = ob.material_slots[pl.material_index].material.name
                    if mname == 'M_glass':
                        o = loc + d * 1e-4
                        continue
                    if mname == 'M_paint' and (ob.matrix_world.to_3x3() @ pl.normal).dot(d) > 0:
                        back.append((yaw, pitch, ob.name, tuple(round(c, 2) for c in U(loc))))
                    break
        print('SIGHT back-faces of M_paint seen from %s: %d of %d rays' % (nm, len(back), tot), back[:5])
    for nm, p3 in (('seat eye', EYE), ('seatP eye', (-0.38, 1.12, -0.35)), ('helmet (0.38, z -0.45)', (0.38, 1.0, -0.45))):
        hit, loc, *_r = sc.ray_cast(dg, T(*p3), Vector((0, 0, 1)), distance=2.0)
        print('SIGHT liner above %s: y = %.3f' % (nm, U(loc).y if hit else -1))


sightline()

# =====================================================================================================================
# PREVIEWS (after the export: ground, sun and cameras never reach the GLB)
# =====================================================================================================================
pv = ARGS.get('preview')
if pv:
    pv = pv if os.path.isabs(pv) else os.path.join(os.path.dirname(HERE), pv)
    os.makedirs(pv, exist_ok=True)
    tag = ARGS.get('tag', 'r')
    g = box('ground', (60, 60, 0.02), (0, 0, -0.01), mat('pv_ground', (0.30, 0.22, 0.17), 0.85))
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); link(sun)
    sun.data.energy = 4.0; sun.data.color = (1.0, 0.80, 0.60); sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(68), 0, math.radians(150))
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.78, 0.58, 0.48, 1); bg.inputs['Strength'].default_value = 0.9
    sc.view_settings.view_transform = 'AgX'
    eng = ARGS.get('engine', 'CYCLES')
    shots = [
        ('chase', (0.0, 3.0, -7.0), (0.0, 0.9, 2.9), 26, False),
        ('chase34', (1.9, 3.0, -6.8), (0.0, 0.8, 0.6), 30, False),
        ('front34', (3.4, 0.85, 4.4), (0.0, 0.62, 0.3), 30, False),
        ('side', (8.0, 0.68, 0.0), (0.0, 0.68, 0.0), 0, 'side'),
        ('top', (0.0, 8.0, 0.0), (0.0, 0.0, 0.0), 0, 'top'),
        ('eye', EYE, (0.38, 1.12, 5.0), 18, False),
        ('eyeL', EYE, (5.0, 1.0, -0.35), 18, False),
        ('eyeR', EYE, (-5.0, 1.0, -0.35), 18, False),
        ('eyeB', EYE, (0.2, 1.0, -5.0), 18, False),
    ]
    only = ARGS.get('only')
    for name, loc, look, lens, ortho in shots:
        if only and name not in only.split(','):
            continue
        cam = preview_camera(T(*loc), T(*look), lens=lens or 50)
        cam.data.sensor_fit = 'HORIZONTAL'
        if ortho:
            cam.data.type = 'ORTHO'
            cam.data.ortho_scale = 5.0
            if ortho == 'top':
                cam.rotation_euler = (0, 0, math.pi / 2)
        render_preview(os.path.join(pv, f'{tag}-{name}.png'), 1280 if name == 'eye' else 960,
                       720 if name == 'eye' else 540, engine=eng, samples=int(ARGS.get('samples', 24)))
