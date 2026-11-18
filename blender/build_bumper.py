"""Bumper, the crash-test robot (film sheet assets/film/raw/sheet-bumper.jpg) → blender/cache/bumper_raw.glb
(then tools/optimize.mjs → assets/bumper.glb).

Run:  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" -b --factory-startup --python blender/build_bumper.py
          [-- --preview .superpowers/bumper-agent [--only front34,seat] [--samples 24]]
      node tools/optimize.mjs blender/cache/bumper_raw.glb assets/bumper.glb --no-compress

Written in three.js coordinates (metres, y up, he faces +z, feet at the origin, 1.05 m tall) and converted with
T(): Blender (x, y, z) = three (x, -z, y). His left is +x.

Shells are superellipsoids (a subdivided cube pushed onto |x|^e+|z|^e)^(n/e)+|y|^n = 1, smooth shaded), the black
parts are ridged lathes (bellows); seams, decals, the screen and its bezel are laid on the shells by ray casts.

Rig (every pivot an Empty with identity rotation; one mesh hangs under each, named <pivot>_geo):
  BUMPER                         root, feet at the origin. extras.sit = the seated pose (JSON), read by bumper.js
    BUMPER_hips  (0, .37, 0)     pelvis shell, hip caps; BUMPER_belt_hip_L / _R (lap belt ends, front of the hips)
      BUMPER_thigh_L/R (±.095, .37, 0)       thigh bellows
        BUMPER_shin_L/R (±.095, .21, 0)      knee ring, boot
    BUMPER_body  (0, .45, 0)     waist pivot: torso, chest plate, waist + neck bellows, shoulder caps;
                                 BUMPER_belt_shoulder (his left shoulder, top front), BUMPER_belt_chest (sternum)
      BUMPER_head  (0, .75, 0)   neck top: head shell, bezel, side targets; BUMPER_face (the screen, own material, UV 0..1)
      BUMPER_arm_L/R (±.215, .665, 0)        shoulder: upper-arm bellows (BUMPER_upper_L/R, stretchable)
        BUMPER_forearm_L/R (±.215, .455, 0)  elbow: elbow ring, forearm cuff, mitten hand
"""
import bpy, bmesh, math, os, sys, json, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

sc = reset()
ARGS = args()


def T(x, y, z):
    return Vector((x, -z, y))


def U(v):
    return Vector((v.x, v.z, -v.y))


# ---------------- materials (6; all values distinct so gltf-transform dedup keeps them apart) ----------------
M = {
    'white': mat('M_white', (0.83, 0.83, 0.81), 0.26, 0.0),
    'rubber': mat('M_rubber', (0.016, 0.016, 0.018), 0.52, 0.0),
    'dark': mat('M_dark', (0.022, 0.022, 0.024), 0.36, 0.0),
    'yellow': mat('M_yellow', (0.92, 0.62, 0.02), 0.38, 0.0),
    'grey': mat('M_grey', (0.30, 0.31, 0.33), 0.32, 0.55),
    'face': mat('M_face', (0.006, 0.010, 0.012), 0.10, 0.0),
}

PIV = {                                     # name: (three-space world rest position, parent)
    'BUMPER': ((0, 0, 0), None),
    'BUMPER_hips': ((0, 0.37, 0), 'BUMPER'),
    'BUMPER_body': ((0, 0.45, 0), 'BUMPER'),
    'BUMPER_head': ((0, 0.75, 0), 'BUMPER_body'),
}
for s, k in ((1, 'L'), (-1, 'R')):
    PIV[f'BUMPER_arm_{k}'] = ((s * 0.215, 0.665, 0), 'BUMPER_body')
    PIV[f'BUMPER_forearm_{k}'] = ((s * 0.215, 0.455, 0), f'BUMPER_arm_{k}')
    PIV[f'BUMPER_thigh_{k}'] = ((s * 0.095, 0.37, 0), 'BUMPER_hips')
    PIV[f'BUMPER_shin_{k}'] = ((s * 0.095, 0.21, 0), f'BUMPER_thigh_{k}')

GROUPS = {}                                 # geometry node name → [objects]; node parent = a pivot


def P(node, o):
    GROUPS.setdefault(node, []).append(o)
    return o


def mk(name, verts3, faces, key, node, outward=None, sm=80):
    me = bpy.data.meshes.new(name)
    me.from_pydata([T(*v) for v in verts3], [], faces)
    me.update()
    b = bmesh.new(); b.from_mesh(me)
    if outward:
        flip = [f for f in b.faces if U(f.normal).dot(Vector(outward(U(f.calc_center_median())))) < 0]
        bmesh.ops.reverse_faces(b, faces=flip)
    b.to_mesh(me); b.free()
    o = link(bpy.data.objects.new(name, me))
    me.materials.append(M[key])
    smooth(o, sm)
    return P(node, o)


def bm_obj(name, bm, key, node, sm=80):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me))
    me.materials.append(M[key])
    smooth(o, sm)
    return P(node, o)


def rot3(e):
    """three.js Euler XYZ → Matrix (three space)."""
    return (Matrix.Rotation(e[0], 3, 'X') @ Matrix.Rotation(e[1], 3, 'Y') @ Matrix.Rotation(e[2], 3, 'Z'))


def sel(node, key, half, ctr, n=3.0, e=None, N=8, gamma=0.8, deform=None, rot=None, name='shell'):
    """Superellipsoid shell: (|x/a|^e + |z/c|^e)^(n/e) + |y/b|^n = 1 around ctr (three space).
    deform(q, u) gets the local point q and its unit-shape coords u (each in -1..1) and returns a new q."""
    e = e or n
    a, b, c = half
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=N - 1, use_grid_fill=True)
    R = rot3(rot) if rot else None
    for v in bm.verts:
        x, y, z = (math.copysign(abs(t) ** gamma, t) for t in v.co)
        F = (abs(x) ** e + abs(z) ** e) ** (n / e) + abs(y) ** n
        k = F ** (-1.0 / n)
        u = Vector((x * k, y * k, z * k))
        q = Vector((u.x * a, u.y * b, u.z * c))
        if deform:
            q = deform(q, u)
        if R:
            q = R @ q
        v.co = T(*(q + Vector(ctr)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm_obj(name, bm, key, node)


def lathe3(node, key, prof, ctr, segs=16, rot=None, sx=1.0, sz=1.0, name='lathe', phase=0.0):
    """Revolve [(r, h)] about the local y axis (h along it), optional rotation (three Euler) and ellipse scales."""
    R = rot3(rot) if rot else Matrix.Identity(3)
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        a = 2 * math.pi * i / segs + phase
        rings.append([bm.verts.new(T(*(R @ Vector((r * math.cos(a) * sx, h, r * math.sin(a) * sz)) + Vector(ctr))))
                      for r, h in prof])
    for i in range(segs):
        r0, r1 = rings[i], rings[(i + 1) % segs]
        for j in range(len(prof) - 1):
            bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # open tubes: recalc can't tell in from out, so point the faces away from the axis
    axis_o, axis_d = T(*ctr), (T(*(R @ Vector((0, 1, 0)))) - T(0, 0, 0)).normalized()
    tot = 0.0
    for f in bm.faces:
        c = f.calc_center_median()
        rad = (c - axis_o) - axis_d * (c - axis_o).dot(axis_d)
        tot += f.normal.dot(rad) * f.calc_area()
    if tot < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm_obj(name, bm, key, node)


def bellows_prof(length, r, pitches, top=0.0, valley=0.80):
    """Ridged accordion profile hanging down from h = top (rings: valley, crest, crest)."""
    pts = []
    for i in range(pitches):
        h0 = top - length * i / pitches
        p = length / pitches
        pts += [(r * valley, h0), (r, h0 - p * 0.28), (r, h0 - p * 0.72)]
    pts.append((r * valley, top - length))
    return pts


# ---------------- ray-cast helpers (three space) ----------------
def bvh(objs):
    vs, ps, off = [], [], 0
    for o in objs:
        me = o.data
        vs += [v.co.copy() for v in me.vertices]
        ps += [[i + off for i in p.vertices] for p in me.polygons]
        off += len(me.vertices)
    return BVHTree.FromPolygons(vs, ps)


def hit(bv, o3, d3, dist=3.0):
    d = T(*d3).normalized()
    loc, n, i, dd = bv.ray_cast(T(*o3), d, dist)
    if loc is None:
        return None
    n3 = U(n)
    if n3.dot(Vector(d3)) > 0:
        n3 = -n3
    return U(loc), n3


def frame(n):
    """(u, v) tangent to a surface with normal n: v = up along the surface, u = the outside viewer's right."""
    up = Vector((0, 1, 0)) if abs(n.y) < 0.9 else Vector((0, 0, -1))
    v = (up - n * n.dot(up)).normalized()
    return v.cross(n).normalized(), v


def project(bv, c, n, pts2, lift):
    """2-D (u, v) points around the surface point c (normal n) → points on the surface, lifted along their normals."""
    u, v = frame(n)
    out = []
    for a, b in pts2:
        p = c + u * a + v * b
        h = hit(bv, tuple(p + n * 0.06), tuple(-n), 0.2)
        out.append((h[0] + h[1] * lift, h[1]) if h else (p + n * lift, n))
    return out


def decal_poly(node, key, bv, c, n, pts2, lift, faces):
    vs = [tuple(p) for p, _ in project(bv, c, n, pts2, lift)]
    return mk('decal', vs, faces, key, node, outward=lambda _c, n=n: tuple(n))


def target(node, bv, c, n, r, lift=0.0016, seg=6):
    """The crash-test target: yellow / black quarters inside a black ring (viewer: top-right yellow)."""
    for q in range(4):
        pts = [(0, 0)] + [(r * 0.84 * math.cos(math.pi / 2 * (q + i / seg)), r * 0.84 * math.sin(math.pi / 2 * (q + i / seg)))
                          for i in range(seg + 1)]
        decal_poly(node, 'yellow' if q % 2 == 0 else 'dark', bv, c, n, pts, lift + 0.0004,
                   [(0, i, i + 1) for i in range(1, seg + 1)])
    K = 4 * seg
    ring = []
    for i in range(K):
        a = 2 * math.pi * i / K
        ring += [(r * 0.80 * math.cos(a), r * 0.80 * math.sin(a)), (r * math.cos(a), r * math.sin(a))]
    decal_poly(node, 'dark', bv, c, n, ring, lift, [(2 * i, 2 * ((i + 1) % K), 2 * ((i + 1) % K) + 1, 2 * i + 1) for i in range(K)])


def ribbon(node, key, samples, width, lift=0.0012, closed=False):
    """[(p, n)] along a line on a shell → a thin dark strip (panel seam)."""
    vs, faces, m = [], [], len(samples)
    for i, (p, n) in enumerate(samples):
        if closed:
            q = samples[(i + 1) % m][0] - samples[(i - 1) % m][0]
        else:
            q = samples[min(i + 1, m - 1)][0] - samples[max(i - 1, 0)][0]
        a = n.cross(q).normalized() * (width / 2)
        vs += [tuple(p + n * lift + a), tuple(p + n * lift - a)]
    for i in range(m if closed else m - 1):
        j = (i + 1) % m
        faces.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    pts = [s[0] for s in samples]; ns = [s[1] for s in samples]

    def outward(c):
        k = min(range(m), key=lambda i: (pts[i] - c).length)
        return tuple(ns[k])
    return mk('seam', vs, faces, key, node, outward=outward)


def ring_on(bv, ctr, axis, n=40, start=Vector((1, 0, 0)), arc=(0, 2 * math.pi)):
    """Samples of the shell where the plane through ctr ⟂ axis cuts it (rays cast outward from ctr)."""
    axis = Vector(axis).normalized()
    e1 = (Vector(start) - axis * axis.dot(Vector(start))).normalized()
    e2 = axis.cross(e1)
    out = []
    for i in range(n + (0 if arc[1] - arc[0] >= 2 * math.pi - 1e-6 else 1)):
        a = arc[0] + (arc[1] - arc[0]) * i / n
        d = e1 * math.cos(a) + e2 * math.sin(a)
        h = hit(bv, tuple(Vector(ctr)), tuple(d), 1.0)
        if h:
            out.append(h)
    return out


def rrect(w, h, r, k=5):
    """Rounded rectangle outline (u, v), counter-clockwise, k segments per corner."""
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(k + 1):
            a = math.radians(a0 + 90 * i / k)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def resample(pts, step, closed=True):
    """Split long straight runs of a 2-D outline so laid-on seams don't cut through a curved shell."""
    out, m = [], len(pts)
    for i in range(m if closed else m - 1):
        a, b = Vector(pts[i]), Vector(pts[(i + 1) % m])
        k = max(1, int(math.ceil((b - a).length / step)))
        out += [tuple(a + (b - a) * (j / k)) for j in range(k)]
    if not closed:
        out.append(tuple(pts[-1]))
    return out


def screw(node, p, n, r=0.0075):
    R = Vector((0, 1, 0)).rotation_difference(n).to_matrix()
    bm = bmesh.new()
    prof = [(r * 1.05, -0.002), (r * 0.85, 0.0022), (0.0, 0.0032)]
    rings = []
    for i in range(6):
        a = 2 * math.pi * i / 6
        rings.append([bm.verts.new(T(*(R @ Vector((rr * math.cos(a), hh, rr * math.sin(a))) + p))) for rr, hh in prof])
    for i in range(6):
        r0, r1 = rings[i], rings[(i + 1) % 6]
        for j in range(len(prof) - 1):
            bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    tot = sum(f.normal.dot(T(*n) - T(0, 0, 0)) for f in bm.faces)
    if tot < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    # a dark cross slot
    o = bm_obj('screw', bm, 'grey', node)
    u, v = frame(n)
    c = p + n * 0.0034
    for d in (u, v):
        a, b = d * r * 0.75, n.cross(d).normalized() * 0.0011
        mk('slot', [tuple(c - a - b), tuple(c + a - b), tuple(c + a + b), tuple(c - a + b)], [(0, 1, 2, 3)], 'dark', node,
           outward=lambda _c, n=n: tuple(n))
    return o


def text_mesh(node, key, body, size, c, n, lift):
    cu = bpy.data.curves.new('txt', 'FONT')
    cu.body = body; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    cu.resolution_u = 2; cu.extrude = 0.0008
    ob = link(bpy.data.objects.new('txt', cu))
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    u, v = frame(n)
    # text plane: Blender-local (x, y) → u, v; z → n
    o3 = c + n * lift
    Mb = Matrix((
        (*(T(*u) - T(0, 0, 0)), 0), (*(T(*v) - T(0, 0, 0)), 0), (*(T(*n) - T(0, 0, 0)), 0), (0, 0, 0, 1))).transposed()
    Mb.translation = T(*o3)
    me.transform(Mb)
    o = link(bpy.data.objects.new('txt', me))
    me.materials.clear(); me.materials.append(M[key])
    smooth(o, 30)
    return P(node, o)


# =====================================================================================================================
# HEAD (pivot at the neck top, y 0.75): a soft TV-shaped block, screen inset in a white bezel, targets on both sides
# =====================================================================================================================
HG = 'BUMPER_head_geo'
HEAD_C, HEAD_H = Vector((0, 0.895, -0.005)), (0.222, 0.163, 0.19)


def head_def(q, u):
    q.x *= 1 - 0.05 * (1 - u.y) / 2                         # a touch narrower at the chin
    q.z *= 1 - 0.04 * (1 - u.y) / 2
    if u.z < 0:                                             # rounder at the back
        q.y *= 1 - 0.06 * (-u.z) ** 2
    return q


head = sel(HG, 'white', HEAD_H, HEAD_C, n=3.4, N=10, gamma=0.78, deform=head_def, name='head')
hb = bvh([head])

SCR_W, SCR_H, SCR_C = 0.300, 0.225, Vector((0, 0.886, 0))     # 4:3 like the 256×192 face canvas
SCR_R = 0.030


def screen_surface(x, y, lift):
    h = hit(hb, (x, y, 1.0), (0, 0, -1), 2.0)
    return (h[0] + Vector((0, 0, lift))) if h else Vector((x, y, 0.17))


# the screen: a rounded-rect grid laid 3 mm in front of the shell; UV = planar (u right as seen from the front, v up)
NX, NY = 12, 9
sv, suv, sf = [], [], []
for j in range(NY + 1):
    for i in range(NX + 1):
        x, y = -SCR_W / 2 + SCR_W * i / NX, -SCR_H / 2 + SCR_H * j / NY
        cx = max(-SCR_W / 2 + SCR_R, min(SCR_W / 2 - SCR_R, x)); cy = max(-SCR_H / 2 + SCR_R, min(SCR_H / 2 - SCR_R, y))
        dx, dy = x - cx, y - cy
        dl = math.hypot(dx, dy)
        if dl > SCR_R:                                      # pull the corner points onto the rounded corner
            x, y = cx + dx / dl * SCR_R, cy + dy / dl * SCR_R
        sv.append(screen_surface(x, y + SCR_C.y, 0.003))
        suv.append(((x + SCR_W / 2) / SCR_W, (y + SCR_H / 2) / SCR_H))
for j in range(NY):
    for i in range(NX):
        a = j * (NX + 1) + i
        sf.append((a, a + 1, a + NX + 2, a + NX + 1))
me = bpy.data.meshes.new('BUMPER_face')
me.from_pydata([T(*v) for v in sv], [], sf)
uvl = me.uv_layers.new(name='UVMap')
for p in me.polygons:
    for li in p.loop_indices:
        uvl.data[li].uv = suv[me.loops[li].vertex_index]
face = link(bpy.data.objects.new('BUMPER_face', me))
me.materials.append(M['face'])
smooth(face, 80)
fb = bmesh.new(); fb.from_mesh(me)                          # the screen faces +z
if sum(U(f.normal).z for f in fb.faces) < 0:
    bmesh.ops.reverse_faces(fb, faces=fb.faces[:])
fb.to_mesh(me); fb.free()

# bezel: a rounded lip swept around the screen (its inner edge overlaps the screen's border)
BEZ = [(-0.011, -0.002), (-0.009, 0.0075), (-0.002, 0.0125), (0.008, 0.011), (0.017, 0.004), (0.023, -0.008)]
path2 = resample(rrect(SCR_W + 0.010, SCR_H + 0.010, SCR_R + 0.005, 4), 0.045)
samples = [(screen_surface(x, y + SCR_C.y, 0.0), None) for x, y in path2]
bv_, bf_, m_ = [], [], len(samples)
for i, (p, _) in enumerate(samples):
    h = hit(hb, tuple(p + Vector((0, 0, 0.05))), (0, 0, -1), 0.2)
    n = h[1] if h else Vector((0, 0, 1))
    t = samples[(i + 1) % m_][0] - samples[(i - 1) % m_][0]
    o = t.cross(n).normalized()
    if o.dot(p - Vector((0, SCR_C.y, p.z))) < 0:
        o = -o
    bv_ += [tuple(p + o * a + n * b) for a, b in BEZ]
k_ = len(BEZ)
for i in range(m_):
    j = (i + 1) % m_
    for q in range(k_ - 1):
        bf_.append((i * k_ + q, j * k_ + q, j * k_ + q + 1, i * k_ + q + 1))
mk('bezel', bv_, bf_, 'white', HG, outward=None)
o = GROUPS[HG][-1]
b = bmesh.new(); b.from_mesh(o.data)
# the lip's faces should face away from the lip's core (centre line lifted 6 mm)
core = [p + Vector((0, 0, 0.006)) for p, _ in samples]
flip = []
for f in b.faces:
    c = U(f.calc_center_median())
    k = min(range(m_), key=lambda i: (core[i] - c).length)
    if U(f.normal).dot(c - core[k]) < 0:
        flip.append(f)
bmesh.ops.reverse_faces(b, faces=flip)
b.to_mesh(o.data); b.free()

# side targets, a seam ring splitting the front shell from the back, screws
for s in (1, -1):
    h = hit(hb, (s * 1.0, 0.905, -0.02), (-s, 0, 0))
    target(HG, hb, h[0], h[1], 0.064)
    for y, z in ((0.985, -0.135), (0.81, -0.135)):
        h = hit(hb, (s * 1.0, y, z), (-s, 0, 0))
        screw(HG, h[0], h[1], 0.0068)
ring = ring_on(hb, (0, 0.895, -0.105), (0, 0, 1), 56)
ribbon(HG, 'dark', ring, 0.0045, closed=True)
# a small grille of three slots at the back of the head
for k in range(3):
    y = 0.93 - 0.03 * k
    pts = [hit(hb, (x, y, -1.0), (0, 0, 1)) for x in [(-0.06 + 0.12 * i / 8) for i in range(9)]]
    ribbon(HG, 'dark', [p for p in pts if p], 0.010)

# =====================================================================================================================
# BODY (waist pivot y 0.45): torso shell with a raised chest plate, waist + neck bellows, shoulder caps
# =====================================================================================================================
BG = 'BUMPER_body_geo'
TOR_C, TOR_H = Vector((0, 0.590, 0)), (0.192, 0.122, 0.138)


def torso_def(q, u):
    w = 0.86 + 0.14 * (u.y + 1) / 2                        # broad shoulders, narrower at the bottom
    q.x *= w
    q.z *= 0.92 + 0.08 * (u.y + 1) / 2
    if u.y < 0:                                             # the lower edge arches up at the front and back
        q.y += 0.035 * (-u.y) ** 2 * (1 - min(1, abs(u.x)) ** 2) * min(1, abs(u.z) * 1.4)
    return q


torso = sel(BG, 'white', TOR_H, TOR_C, n=3.0, N=9, gamma=0.8, deform=torso_def, name='torso')
tb = bvh([torso])
h = hit(tb, (0, 0.625, 1.0), (0, 0, -1))
zf = h[0].z
plate = sel(BG, 'white', (0.128, 0.076, 0.03), (0, 0.622, zf - 0.019), n=4.0, N=5, name='chestplate',
            deform=lambda q, u: Vector((q.x, q.y, q.z - 0.018 * (q.x / 0.128) ** 2)))
pb = bvh([plate])
ph = hit(pb, (0.055, 0.634, 1.0), (0, 0, -1))
target(BG, pb, ph[0], Vector((0, 0, 1)), 0.044)
# number plate "B-1": a dark tag with yellow letters
nh = hit(pb, (-0.060, 0.636, 1.0), (0, 0, -1))
sel(BG, 'dark', (0.043, 0.023, 0.006), tuple(nh[0] - nh[1] * 0.0015), n=4.0, N=3, name='tag',
    rot=(0, math.atan2(nh[1].x, nh[1].z), 0))
text_mesh(BG, 'yellow', 'B-1', 0.036, nh[0] + Vector((0, -0.001, 0)), nh[1], 0.0052)
# the rib line under the target and tag, screws at the plate's corners
ribbon(BG, 'dark', [hit(pb, (x, 0.590, 1.0), (0, 0, -1)) for x in [(-0.098 + 0.196 * i / 12) for i in range(13)]], 0.0045)
for x, y in ((0.105, 0.680), (-0.105, 0.680), (0.105, 0.564), (-0.105, 0.564)):
    hh = hit(pb, (x, y, 1.0), (0, 0, -1))
    screw(BG, hh[0], hh[1], 0.0062)
# a seam ring around the chest plate's base (where it meets the torso)
ribbon(BG, 'dark', ring_on(bvh([plate]), (0, 0.622, zf - 0.019 + 0.012), (0, 0, 1), 36), 0.004, closed=True)
# side seams (front/back halves) and a back hatch
for s in (1, -1):
    pts = [hit(tb, (s * 1.0, y, -0.01), (-s, 0, 0)) for y in [0.50 + 0.19 * i / 8 for i in range(9)]]
    ribbon(BG, 'dark', [p for p in pts if p], 0.004)
bh = hit(tb, (0, 0.60, -1.0), (0, 0, 1))
smp = project(tb, bh[0], bh[1], resample(rrect(0.17, 0.12, 0.03, 3), 0.02), 0.0)
ribbon(BG, 'dark', smp, 0.004, closed=True)
for x in (-0.065, 0.065):
    hh = hit(tb, (x, 0.645, -1.0), (0, 0, 1))
    screw(BG, hh[0], hh[1], 0.006)

# waist bellows (y 0.40..0.505), neck bellows (0.69..0.765)
lathe3(BG, 'rubber', bellows_prof(0.115, 0.132, 5, top=0.515, valley=0.86), (0, 0, 0.0), segs=18, sz=0.80, name='waist')
lathe3(BG, 'rubber', bellows_prof(0.085, 0.058, 3, top=0.78, valley=0.82), (0, 0, -0.005), segs=14, name='neck')
# shoulder caps (grey domes on the torso's upper sides), with a white collar
for s in (1, -1):
    lathe3(BG, 'grey', [(0.0, 0.034), (0.030, 0.031), (0.050, 0.022), (0.060, 0.008), (0.060, -0.010), (0.050, -0.016)],
           (s * 0.188, 0.665, 0.0), segs=12, rot=(0, 0, -s * math.pi / 2), name='shcap')

# =====================================================================================================================
# HIPS (pivot y 0.37): the pelvis shell ("briefs"), hip caps
# =====================================================================================================================
PG = 'BUMPER_hips_geo'


def pelvis_def(q, u):
    q.x *= 0.80 + 0.20 * (u.y + 1) / 2
    q.z *= 0.90 + 0.10 * (u.y + 1) / 2
    return q


pelvis = sel(PG, 'white', (0.168, 0.074, 0.128), (0, 0.362, 0.0), n=3.0, N=7, deform=pelvis_def, name='pelvis')
pvb = bvh([pelvis])
belly = bvh([pelvis] + [o for o in GROUPS[BG] if o.name.startswith('waist')] + [torso])     # (for the lap-belt points)
zfront = max(h[0].z for h in (hit(belly, (x, 0.445, 1.0), (0, 0, -1)) for x in [-0.13 + 0.26 * i / 12 for i in range(13)]) if h)
ribbon(PG, 'dark', ring_on(pvb, (0, 0.402, 0), (0, 1, 0), 36), 0.0045, closed=True)
for s in (1, -1):
    hh = hit(pvb, (s * 1.0, 0.36, 0.0), (-s, 0, 0))
    lathe3(PG, 'grey', [(0.0, 0.016), (0.026, 0.014), (0.040, 0.006), (0.044, -0.008)],
           tuple(hh[0] - Vector((s * 0.006, 0, 0))), segs=14, rot=(0, 0, -s * math.pi / 2), name='hipcap')
    hh = hit(pvb, (s * 0.07, 0.392, 1.0), (0, 0, -1))
    screw(PG, hh[0], hh[1], 0.006)

# =====================================================================================================================
# ARMS: bellows upper arm from the shoulder; forearm = elbow ring + big cuff + mitten (thumb + finger block)
# =====================================================================================================================
for s, k in ((1, 'L'), (-1, 'R')):
    sx = s * 0.215
    lathe3(f'BUMPER_upper_{k}', 'rubber', bellows_prof(0.255, 0.047, 8, top=0.695), (sx, 0, 0), segs=10, name='upper')
    FG = f'BUMPER_forearm_{k}_geo'
    lathe3(FG, 'grey', [(0.036, 0.016), (0.052, 0.014), (0.058, 0.0), (0.054, -0.014), (0.040, -0.018)],
           (sx, 0.452, 0), segs=12, name='elbow')

    def cuff_def(q, u):
        f = 1 + 0.10 * (1 - u.y) / 2                         # flares toward the wrist
        q.x *= f; q.z *= f
        return q
    cuff = sel(FG, 'white', (0.060, 0.096, 0.064), (sx, 0.355, 0.0), n=4.0, e=2.0, N=6, deform=cuff_def, name='cuff')
    cb = bvh([cuff])
    ribbon(FG, 'dark', ring_on(cb, (sx, 0.302, 0), (0, 1, 0), 24), 0.0042, closed=True)
    hh = hit(cb, (s * 1.0, 0.40, 0.0), (-s, 0, 0))
    screw(FG, hh[0], hh[1], 0.0058)
    # mitten: palm block, finger block (rounded, a groove between), thumb on the front, angled in
    sel(FG, 'white', (0.034, 0.042, 0.050), (sx, 0.236, 0.004), n=3.0, N=4, name='palm')
    sel(FG, 'white', (0.031, 0.040, 0.047), (sx, 0.178, 0.008), n=2.8, N=4, name='fingers',
        deform=lambda q, u: Vector((q.x, q.y, q.z + 0.010 * (1 - u.y) / 2)))
    sel(FG, 'white', (0.017, 0.034, 0.018), (sx - s * 0.010, 0.214, 0.050), n=2.6, N=3, name='thumb',
        rot=(0.35, 0, s * 0.25))
    hb_ = bvh([o for o in GROUPS[FG] if o.name.startswith('fingers')])
    for dz in (-0.017, 0.017):                               # finger grooves on the outer face
        pts = [hit(hb_, (s * 1.0, y, 0.008 + dz), (-s, 0, 0)) for y in [0.147 + 0.05 * i / 6 for i in range(7)]]
        ribbon(FG, 'dark', [p for p in pts if p], 0.0035)

# =====================================================================================================================
# LEGS: thigh bellows from the hip; shin = knee ring + tall boot with a toe and a dark sole
# =====================================================================================================================
for s, k in ((1, 'L'), (-1, 'R')):
    x = s * 0.095
    lathe3(f'BUMPER_thigh_{k}_geo', 'rubber', bellows_prof(0.20, 0.058, 7, top=0.39), (x, 0, 0), segs=10, name='thigh')
    SG = f'BUMPER_shin_{k}_geo'
    lathe3(SG, 'grey', [(0.042, 0.016), (0.060, 0.014), (0.066, 0.0), (0.062, -0.014), (0.046, -0.018)],
           (x, 0.208, 0), segs=12, name='knee')
    boot = sel(SG, 'white', (0.068, 0.098, 0.072), (x, 0.112, -0.008), n=3.4, e=2.3, N=6, name='boot')
    toe = sel(SG, 'white', (0.066, 0.046, 0.086), (x, 0.048, 0.042), n=3.0, N=4, name='toe',
              deform=lambda q, u: Vector((q.x, q.y - 0.012 * max(0, u.z) * (u.y + 1) / 2, q.z)))
    sel(SG, 'dark', (0.071, 0.012, 0.112), (x, 0.012, 0.024), n=4.0, N=3, name='sole')
    sb = bvh([boot])
    ribbon(SG, 'dark', ring_on(sb, (x, 0.172, -0.008), (0, 1, 0), 24), 0.0042, closed=True)
    hh = hit(sb, (s * 1.0, 0.13, -0.01), (-s, 0, 0))
    screw(SG, hh[0], hh[1], 0.0058)

# =====================================================================================================================
# RIG: pivots (Empties), one joined mesh per pivot, belt anchors
# =====================================================================================================================
NODES = {}
for name, (pos, parent) in PIV.items():
    e = link(bpy.data.objects.new(name, None))
    e.empty_display_size = 0.05
    NODES[name] = e
for name, (pos, parent) in PIV.items():
    if parent:
        NODES[name].parent = NODES[parent]
        NODES[name].location = T(*pos) - T(*PIV[parent][0])

GEO_PARENT = {HG: 'BUMPER_head', BG: 'BUMPER_body', PG: 'BUMPER_hips'}
for k in ('L', 'R'):
    GEO_PARENT[f'BUMPER_upper_{k}'] = f'BUMPER_arm_{k}'
    GEO_PARENT[f'BUMPER_forearm_{k}_geo'] = f'BUMPER_forearm_{k}'
    GEO_PARENT[f'BUMPER_thigh_{k}_geo'] = f'BUMPER_thigh_{k}'
    GEO_PARENT[f'BUMPER_shin_{k}_geo'] = f'BUMPER_shin_{k}'

from collections import Counter
_tb = Counter()
for objs in GROUPS.values():
    for o in objs:
        _tb[o.name.split('.')[0]] += sum(len(p.vertices) - 2 for p in o.data.polygons)
print('BUMPER tris by piece', dict(_tb.most_common()))
GEO = {}
for gname, objs in GROUPS.items():
    j = join(objs, gname)
    piv = PIV[GEO_PARENT[gname]][0]
    j.data.transform(Matrix.Translation(-T(*piv)))
    j.parent = NODES[GEO_PARENT[gname]]
    j.location = (0, 0, 0)
    while j.data.uv_layers:
        j.data.uv_layers.remove(j.data.uv_layers[0])
    GEO[gname] = j
face.data.transform(Matrix.Translation(-T(*PIV['BUMPER_head'][0])))
face.parent = NODES['BUMPER_head']; face.location = (0, 0, 0)


def anchor(name, p3, parent):
    e = link(bpy.data.objects.new(name, None))
    e.empty_display_size = 0.03
    e.parent = NODES[parent]
    e.location = T(*p3) - T(*PIV[parent][0])
    NODES[name] = e


# belt points (crashTest.js lays straight straps between them, +2 cm in z): on the surface, a little proud, so the
# chords between them clear the convex shells. Shoulder: upper front edge of his left shoulder; chest: the sternum
# (chest plate); lap: the hip crease, above the seated thighs' tops (y 0.43) and in front of the belly at any x.
h = hit(tb, (0.125, 0.692, 1.0), (0, 0, -1))
anchor('BUMPER_belt_shoulder', tuple(h[0] + h[1] * 0.008), 'BUMPER_body')
h = hit(pb, (0, 0.612, 1.0), (0, 0, -1))
anchor('BUMPER_belt_chest', tuple(h[0] + h[1] * 0.004), 'BUMPER_body')
for s, k in ((1, 'L'), (-1, 'R')):
    anchor(f'BUMPER_belt_hip_{k}', (s * 0.13, 0.445, zfront - 0.012), 'BUMPER_hips')
print('BELT belly front z', round(zfront, 3))

# =====================================================================================================================
# SEATED POSE (driver's seat of assets/car.glb): solved here once, stored on the root as extras.sit
# =====================================================================================================================
SEAT = {'pos': [0.38, 0.0, -0.47], 'scale': 0.92}
SEAT['pos'][1] = 0.497 - 0.288 * SEAT['scale']                # pelvis bottom (y 0.288) on the cushion (y 0.50)
WHEEL_HUB, WHEEL_TILT, WHEEL_R = Vector((0.38, 0.80, 0.10)), -0.45, 0.17
BODY_LEAN = 0.24                                             # forward, about the waist (the seat back leans too)


def wheel_pt(clock_deg):
    """A point on the rim, 0° = 12 o'clock, +90 = 3 o'clock as seen by the driver (driver's right = -x)."""
    a = math.radians(clock_deg)
    p = Vector((-math.sin(a) * WHEEL_R, math.cos(a) * WHEEL_R, 0))
    return WHEEL_HUB + Matrix.Rotation(WHEEL_TILT, 3, 'X') @ p


def M4(t=(0, 0, 0), e=(0, 0, 0), s=1.0):
    return Matrix.Translation(Vector(t)) @ rot3(e).to_4x4() @ Matrix.Diagonal((s, s, s, 1))


def rel(name):
    p, parent = PIV[name]
    return Vector(p) - Vector(PIV[parent][0]) if parent else Vector(p)


ROOT = M4(SEAT['pos'], (0, 0, 0), SEAT['scale'])
GRIP = Vector((0, 0.205 - 0.455, 0.010))                     # palm centre, forearm-local


def grip_world(k, ax, az, fx, stretch, body=BODY_LEAN):
    s = 1 if k == 'L' else -1
    m = ROOT @ M4(rel('BUMPER_body'), (body, 0, 0)) @ M4(rel(f'BUMPER_arm_{k}'), (ax, 0, az)) \
        @ M4(rel(f'BUMPER_forearm_{k}') * stretch, (fx, 0, 0))
    return m @ GRIP


SIT = {'thigh': -1.62, 'shin': 0.0, 'body': BODY_LEAN, 'head': -0.12, 'arm': {}, 'forearm': {}, 'stretch': 1.0,
       'seat': SEAT}
targets = {'L': wheel_pt(-62), 'R': wheel_pt(62)}            # hands at ten to two
nrm = Matrix.Rotation(WHEEL_TILT, 3, 'X') @ Vector((0, 0, 1))
best_all = None
for stretch in [1.0 + 0.05 * i for i in range(9)]:
    tot, sol = 0.0, {}
    for k in ('L', 'R'):
        tgt = targets[k] - nrm * 0.012
        best = None
        for ax in [-2.1 + 0.02 * i for i in range(56)]:
            for az in [-0.45 + 0.05 * i for i in range(19)]:
                for fx in (-0.1, -0.2, -0.3, -0.4, -0.5):
                    d = (grip_world(k, ax, az, fx, stretch) - tgt).length
                    if best is None or d < best[0]:
                        best = (d, ax, az, fx)
        tot += best[0]; sol[k] = best
    if best_all is None or tot < best_all[0] - 0.004:
        best_all = (tot, stretch, sol)
tot, stretch, sol = best_all
SIT['stretch'] = round(stretch, 3)
for k in ('L', 'R'):
    SIT['arm'][k] = [round(sol[k][1], 3), 0.0, round(sol[k][2], 3)]
    SIT['forearm'][k] = [round(sol[k][3], 3), 0.0, 0.0]
print('SIT reach residuals', {k: round(sol[k][0], 3) for k in sol}, 'stretch', stretch)
# legs: thighs forward, shins down/forward until the sole meets the floor (y 0.385)
best = None
for thigh in [-1.45 - 0.01 * i for i in range(20)]:
    for shin in [1.1 + 0.01 * i for i in range(70)]:
        m = ROOT @ M4(rel('BUMPER_hips')) @ M4(rel('BUMPER_thigh_L'), (thigh, 0, 0)) @ M4(rel('BUMPER_shin_L'), (shin, 0, 0))
        heel, toe = m @ Vector((0, -0.21, -0.07)), m @ Vector((0, -0.21, 0.12))
        d = 10 * abs(min(heel.y, toe.y) - 0.392) + abs(thigh + shin + 0.25) + abs(thigh + 1.55)
        if best is None or d < best[0]:
            best = (d, thigh, shin, heel, toe)
SIT['thigh'], SIT['shin'] = round(best[1], 3), round(best[2], 3)
print('SIT legs', SIT['thigh'], SIT['shin'], 'heel', tuple(round(c, 3) for c in best[3]), 'toe', tuple(round(c, 3) for c in best[4]))
mh = ROOT @ M4(rel('BUMPER_body'), (BODY_LEAN, 0, 0)) @ M4(rel('BUMPER_head'), (SIT['head'], 0, 0))
print('SIT head top', tuple(round(c, 3) for c in mh @ Vector((0, 1.058 - 0.75, -0.02))), 'face centre',
      tuple(round(c, 3) for c in mh @ Vector((0, 0.886 - 0.75, 0.18))))
print('SIT', json.dumps(SIT))
NODES['BUMPER']['sit'] = json.dumps(SIT)

# ---------------- export ----------------
out = list(NODES.values()) + list(GEO.values()) + [face]
os.makedirs(CACHE, exist_ok=True)
export_glb(os.path.join(CACHE, 'bumper_raw.glb'), out)
tris = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in out if o.type == 'MESH'}
print('BUMPER tris', tris)
print('BUMPER tris total', sum(tris.values()))
print('BUMPER materials', sorted({m.name for o in out if o.type == 'MESH' for m in o.data.materials}))


# =====================================================================================================================
# PREVIEWS (after the export)
# =====================================================================================================================
def to_b_quat(e):
    C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))           # three → Blender
    return (C @ rot3(e) @ C.inverted()).to_quaternion()


def pose(sit):
    for o in NODES.values():
        o.rotation_mode = 'QUATERNION'
    root = NODES['BUMPER']
    if sit:
        root.location = T(*SEAT['pos']); root.scale = (SEAT['scale'],) * 3
        NODES['BUMPER_body'].rotation_quaternion = to_b_quat((SIT['body'], 0, 0))
        NODES['BUMPER_head'].rotation_quaternion = to_b_quat((SIT['head'], 0, 0))
        for k in ('L', 'R'):
            NODES[f'BUMPER_thigh_{k}'].rotation_quaternion = to_b_quat((SIT['thigh'], 0, 0))
            NODES[f'BUMPER_shin_{k}'].rotation_quaternion = to_b_quat((SIT['shin'], 0, 0))
            NODES[f'BUMPER_arm_{k}'].rotation_quaternion = to_b_quat(SIT['arm'][k])
            NODES[f'BUMPER_forearm_{k}'].rotation_quaternion = to_b_quat(SIT['forearm'][k])
            GEO[f'BUMPER_upper_{k}'].scale = (1, 1, SIT['stretch'])
            NODES[f'BUMPER_forearm_{k}'].location = (T(*rel(f'BUMPER_forearm_{k}')) * SIT['stretch'])
    else:
        root.location = (0, 0, 0); root.scale = (1, 1, 1)
        for o in NODES.values():
            o.rotation_quaternion = (1, 0, 0, 0)
        for s, k in ((1, 'L'), (-1, 'R')):
            NODES[f'BUMPER_arm_{k}'].rotation_quaternion = to_b_quat((0, 0, s * 0.09))
            NODES[f'BUMPER_forearm_{k}'].rotation_quaternion = to_b_quat((-0.12, 0, 0))
            GEO[f'BUMPER_upper_{k}'].scale = (1, 1, 1)
            NODES[f'BUMPER_forearm_{k}'].location = T(*rel(f'BUMPER_forearm_{k}'))


def face_image():
    import numpy as np
    W, H = 256, 192
    yy, xx = np.mgrid[0:H, 0:W]
    img = np.zeros((H, W, 4), np.float32); img[..., 3] = 1
    img[..., 0], img[..., 1], img[..., 2] = 0.004, 0.008, 0.009
    cy = (0.27, 0.90, 0.94)
    for ex in (80, 176):
        m = ((xx - ex) / 24) ** 2 + ((yy - 84) / 30) ** 2 < 1
        img[m, :3] = cy
        pm = ((xx - ex - 7) ** 2 + (yy - 84 + 8) ** 2) < 49           # pupil notch up-right (canvas y down)
        img[pm, :3] = 0.004
    for x in range(104, 153):                                         # smile (canvas)
        t = (x - 128) / 24
        y = int(146 + 7 * (1 - t * t))
        img[y - 3:y + 3, x, :3] = cy
    img = img[::-1]                                                   # canvas top row → image top (Blender rows go up)
    im = bpy.data.images.new('face_pv', W, H)
    im.pixels.foreach_set(img.ravel())
    return im


pv = ARGS.get('preview')
if pv:
    pv = pv if os.path.isabs(pv) else os.path.join(os.path.dirname(HERE), pv)
    os.makedirs(pv, exist_ok=True)
    tag = ARGS.get('tag', 'b')
    # the face: emission from a stand-in canvas image (preview only)
    nt = M['face'].node_tree
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = face_image()
    bsdf = nt.nodes['Principled BSDF']
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 2.0
    g = box('ground', (30, 30, 0.02), (0, 0, -0.01), mat('pv_ground', (0.55, 0.42, 0.33), 0.85))
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); link(sun)
    sun.data.energy = 3.5; sun.data.color = (1.0, 0.86, 0.72); sun.data.angle = math.radians(4)
    sun.rotation_euler = (math.radians(55), 0, math.radians(35))
    fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'AREA')); link(fill)
    fill.data.energy = 60; fill.data.size = 3; fill.location = T(-2.5, 2.0, 2.5)
    fill.rotation_euler = (T(0, 0.6, 0) - fill.location).to_track_quat('-Z', 'Y').to_euler()
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.62, 0.62, 0.66, 1); bg.inputs['Strength'].default_value = 0.8
    sc.view_settings.view_transform = 'AgX'
    eng = ARGS.get('engine', 'CYCLES')
    smp = int(ARGS.get('samples', 24))
    only = ARGS.get('only')
    stand = [
        ('front34', (0.95, 0.80, 2.25), (0.0, 0.55, 0.0), 50, None),
        ('front', (0.0, 0.53, 5.0), (0.0, 0.53, 0.0), 0, 1.25),
        ('side', (5.0, 0.53, 0.0), (0.0, 0.53, 0.0), 0, 1.25),
        ('back34', (-1.3, 1.0, -1.9), (0.0, 0.55, 0.0), 50, None),
        ('face', (0.22, 0.95, 0.95), (0.0, 0.88, 0.1), 50, None),
        ('chest', (0.10, 0.66, 0.65), (0.0, 0.62, 0.1), 50, None),
    ]
    pose(False)
    for name, loc, look, lens, ortho in stand:
        if only and name not in only.split(','):
            continue
        cam = preview_camera(T(*loc), T(*look), lens=lens or 50)
        cam.data.sensor_fit = 'HORIZONTAL'
        if ortho:
            cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
        render_preview(os.path.join(pv, f'{tag}-{name}.png'), 900 if ortho else 960, 900 if ortho else 720, engine=eng, samples=smp)
    seat_shots = [
        ('seat', (2.1, 1.12, -0.10), (0.38, 0.86, -0.18), 32),
        ('seatP', (-0.38, 1.12, -0.35), (0.38, 0.90, -0.2), 22),
        ('seatF', (0.9, 1.55, 1.9), (0.38, 0.85, -0.2), 30),
    ]
    if not only or any(n in only.split(',') for n, *_ in seat_shots):
        bpy.ops.import_scene.gltf(filepath=os.path.join(CACHE, 'car_raw.glb'))
        for o in list(sc.objects):
            if o.name.startswith('CAR_glass'):
                bpy.data.objects.remove(o)                   # the game hides the glass from the inside; see him clearly
        pose(True)
        for name, loc, look, lens in seat_shots:
            if only and name not in only.split(','):
                continue
            preview_camera(T(*loc), T(*look), lens=lens)
            render_preview(os.path.join(pv, f'{tag}-{name}.png'), 960, 720, engine=eng, samples=smp)
