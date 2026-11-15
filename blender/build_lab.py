"""EXAMPLE room build → assets/lab.glb + assets/lab_lightmap.webp (same layout as the placeholder in src/lab/labScene.js).

Run:  blender -b --factory-startup --python blender/build_lab.py -- --out assets/ [--draft] [--preview]
then: node tools/optimize.mjs blender/cache/lab_raw.glb assets/lab.glb
      node tools/inspect-glb.mjs assets/lab.glb --require ST_bench,ST_entry,TP_bench,A_board --max-tris 150000 --max-mb 8
and set BUILT.lab = BUILT.lightmap = true in src/lab/labScene.js.

Coordinates: Blender Z-up; glTF export maps Blender (x, y, z) → three (x, z, -y). So three's "forward" (-z) is Blender +y.
Node-name contract (labScene.js reads these): LAB_static (merged + baked, UV1 lightmap), LAB_detail (small, not baked),
A_* anchors, ST_* stations (custom prop 'yaw' → userData.yaw), TP_* teleport discs.
"""
import bpy, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa

A = args()
OUT = os.path.abspath(A.get('out', 'assets'))
DRAFT = bool(A.get('draft'))
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
sc = reset()
t0 = time.time()

W, D, H = 7.0, 5.4, 3.0
static = []
def S(o):
    static.append(o); return o

M = {
    'wall': mat('M_wall', (0.62, 0.66, 0.70), 0.55),
    'floor': mat('M_floor', (0.16, 0.18, 0.21), 0.6, 0.1),
    'ceil': mat('M_ceil', (0.30, 0.31, 0.33), 0.6),
    'bench': mat('M_bench', (0.85, 0.87, 0.89), 0.35),
    'base': mat('M_base', (0.35, 0.38, 0.43), 0.45, 0.4),
    'led': mat('M_led', (0.9, 0.95, 1.0), 0.3, 0, (0.86, 0.93, 1.0), 10.0),
}
# Poly Haven CC0 textures, e.g.:  M['floor'] = pbr_material('M_floor', polyhaven_texture('metal_plate'))  (needs UV0: uv_box_project)

# ---- shell ----
S(box('floor', (W, D, 0.02), (0, 0, -0.01), M['floor']))
S(box('ceiling', (W, D, 0.02), (0, 0, H), M['ceil']))
S(box('wallN', (W, 0.1, H), (0, D / 2, H / 2), M['wall']))      # three -z side (in front of the bench)
S(box('wallS', (W, 0.1, H), (0, -D / 2, H / 2), M['wall']))
S(box('wallW', (0.1, D, H), (-W / 2, 0, H / 2), M['wall']))
S(box('wallE', (0.1, D, H), (W / 2, 0, H / 2), M['wall']))
# ---- seated bench: top at 0.72 m ----
S(box('bench', (1.8, 0.7, 0.06), (0, 1.4, 0.69), M['bench'], bevel=0.008))
S(box('benchBase', (1.7, 0.6, 0.66), (0, 1.4, 0.33), M['base'], bevel=0.01))
# ---- small details (not baked: too small to earn lightmap texels) ----
for x in (-2, 0, 2):
    S(box(f'led{x}', (1.2, 0.08, 0.02), (x, 0, H - 0.02), M['led']))

# ---- stations / anchors / teleport discs ----
empty('ST_bench', (0, 0.55, 0), yaw=yaw_facing(0, 1))           # facing the bench (Blender +y = three -z)
empty('ST_entry', (0, -1.6, 0), yaw=yaw_facing(0, 1))
empty('A_beaker', (0.2, 1.35, 0.72)); empty('A_goggles', (-0.55, 1.3, 0.72))
empty('A_board', (0, 1.85, 1.3), yaw=0.0)
tp = mat('M_tp', (0.1, 0.5, 0.5), 0.4, 0, (0.24, 0.85, 0.8), 1.5)
tps = [cyl(n, 0.28, 0.012, (x, y, 0.006), tp, 40) for n, (x, y) in {'TP_bench': (0, 0.55), 'TP_entry': (0, -1.6)}.items()]

# ---- lights (baked only; the runtime has no realtime lights on the room) ----
w = bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.3
for x in (-2, 0, 2):
    l = bpy.data.lights.new(f'ceil{x}', 'AREA'); l.energy = 40; l.size = 1.2; l.size_y = 0.3; l.shape = 'RECTANGLE'
    link(bpy.data.objects.new(f'ceil{x}', l)).location = (x, 0, H - 0.1)
l = bpy.data.lights.new('benchLamp', 'AREA'); l.energy = 15; l.size = 1.6; l.size_y = 0.12; l.shape = 'RECTANGLE'
link(bpy.data.objects.new('benchLamp', l)).location = (0, 1.4, 2.1)

# ---- merge, unwrap, bake ----
def big(o):
    d = o.dimensions
    return max(d) > 0.45 and sorted(d)[1] > 0.12
bake_set = [o for o in static if big(o)]
detail = join([o for o in static if not big(o)], 'LAB_detail')
lab = join(bake_set, 'LAB_static')
lightmap_uv(lab, 0.006 if DRAFT else 0.004)
if A.get('preview'):                     # look at the room BEFORE the long bake
    preview_camera((0, 0.4, 1.17), (0, 3, 1.0), 18)
    render_preview(os.path.join(CACHE, 'preview_lab.png'), 960, 540, samples=16)
img = bake_lightmap(lab, 1024 if DRAFT else 2048, 32 if DRAFT else 512)
print(f'[lab] bake done {time.time() - t0:.1f}s')
save_image(img, os.path.join(OUT, 'lab_lightmap.webp'), 'WEBP', 90, scale=0.5)   # 0.5 = headroom: an 8-bit lightmap clips at 1; TUNE.lightMapIntensity scales it back
export_glb(os.path.join(CACHE, 'lab_raw.glb'), [lab, detail] + tps + [o for o in sc.objects if o.type == 'EMPTY'])
print(f'[lab] exported {time.time() - t0:.1f}s')
