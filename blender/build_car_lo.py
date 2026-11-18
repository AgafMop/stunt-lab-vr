# The race opponents' light car (the headset always uses it; desktop shows it beyond the LOD distance):
#   - no interior or steering wheel; every mesh decimated (≈ 2.5 K triangles);
#   - 6 draw calls: the paint (M_paint, recoloured per car in three), everything else in ONE material whose colours
#     are baked into vertex colours (M_lo: stripes, chrome, lamps, tyres, the dark opaque glass), 4 wheels that still roll.
#   "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b -P blender/build_car_lo.py
#   node tools/optimize.mjs blender/cache/car_lo_raw.glb assets/car_lo.glb
# Input: blender/cache/car_raw.glb (written by build_car.py).
import bpy, os

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')
RATIO = {'CAR_paint': 0.13, 'CAR_detail': 0.1, 'CAR_glass': 0.3}
WHEEL = 0.1
DROP = {'CAR_interior', 'CAR_steer'}
GLASS = (0.05, 0.06, 0.08, 1.0)          # the far car has no interior: dark, opaque windows

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(CACHE, 'car_raw.glb'))

# one material for everything but the paint: Base Color from the vertex colour attribute 'Col'
lo = bpy.data.materials.new('M_lo')
lo.use_nodes = True
bsdf = lo.node_tree.nodes.get('Principled BSDF')
vc = lo.node_tree.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
lo.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.45
bsdf.inputs['Metallic'].default_value = 0.2


def base_color(mat):
    if mat is None:
        return (0.5, 0.5, 0.5, 1)
    if mat.name.startswith('M_glass'):
        return GLASS
    if mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                c = n.inputs['Base Color'].default_value
                return (c[0], c[1], c[2], 1)
    c = mat.diffuse_color
    return (c[0], c[1], c[2], 1)


def select_only(o):
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


for o in list(bpy.data.objects):
    if o.type != 'MESH':
        continue
    name = o.name.split('.')[0]
    if name in DROP:
        bpy.data.objects.remove(o, do_unlink=True)
        continue
    select_only(o)
    mod = o.modifiers.new('lod', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = WHEEL if name.startswith('CAR_wheel_') else RATIO.get(name, 0.2)
    bpy.ops.object.modifier_apply(modifier=mod.name)

    me = o.data
    col = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    slots = [s.material for s in o.material_slots]
    if 'M_lo' not in [m.name for m in slots if m]:
        o.data.materials.append(lo)
        slots.append(lo)
    lo_i = len(slots) - 1
    for poly in me.polygons:
        m = slots[poly.material_index] if poly.material_index < len(slots) else None
        c = base_color(m)
        for li in poly.loop_indices:
            col.data[li].color = c
        if not (m and m.name.startswith('M_paint')):
            poly.material_index = lo_i
    bpy.ops.object.material_slot_remove_unused()

# the body: paint + detail + glass in one object (2 primitives: M_paint, M_lo), keeps the CAR_paint name (wheel roll hook)
body = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.split('.')[0] in ('CAR_paint', 'CAR_detail', 'CAR_glass')]
paint = next(o for o in body if o.name.startswith('CAR_paint'))
for s in bpy.context.selected_objects:
    s.select_set(False)
for o in body:
    o.select_set(True)
bpy.context.view_layer.objects.active = paint
bpy.ops.object.join()
paint.name = 'CAR_paint'

for o in bpy.data.objects:
    if o.type == 'MESH':
        print(f'{o.name}: {len(o.data.polygons)} faces, materials {[m.name for m in o.data.materials]}')

bpy.ops.export_scene.gltf(filepath=os.path.join(CACHE, 'car_lo_raw.glb'), export_format='GLB',
                          export_extras=True, export_apply=True, export_yup=True)
print('wrote', os.path.join(CACHE, 'car_lo_raw.glb'))
