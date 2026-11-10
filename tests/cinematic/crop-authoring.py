"""Focused, dependency-free checks of the same authoring function used by MCP."""
import ast
import math
from pathlib import Path
from types import SimpleNamespace
import unittest
import tempfile

SOURCE = Path(__file__).resolve().parents[2] / "tools/cinematic/blender/build_assets.py"
MODULE = ast.parse(SOURCE.read_text())


class CropAuthoring(unittest.TestCase):
    def make(self):
        result = {}
        def mesh_obj(name, vertices, faces, material, parent, smooth):
            result.update(name=name, vertices=vertices, faces=faces, smooth=smooth)
            return result
        names = {"height", "parcel_point", "parcel_relief", "upward_triangles", "author_sample_crops"}
        functions = ast.Module(body=[n for n in MODULE.body if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[])
        namespace = dict(math=math, mesh_obj=mesh_obj, crop_rows=None, land=None, TERRAIN_CURVE_DIVISOR=1800)
        exec(compile(functions, str(SOURCE), "exec"), namespace)
        namespace["author_sample_crops"]([(-2.50,-2.30),(2.45,-2.30),(2.45,2.27),(-2.50,2.27)],1)
        return result, namespace

    def test_rebuild_and_bounds(self):
        first, namespace = self.make()
        self.assertEqual(first, self.make()[0])
        self.assertTrue(first["smooth"])
        self.assertLessEqual(len(first["faces"]), 7000)
        for x,y,z in first["vertices"]:
            self.assertTrue(-2.40 < x < 2.36 and -2.20 < z < 2.17)
            self.assertGreater(y - namespace["height"](x,z), .006)
        for ia,ib,ic in first["faces"]:
            a,b,c = (first["vertices"][i] for i in (ia,ib,ic))
            ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])
            self.assertGreater(ny, 1e-9)

    def test_canopy_is_connected_per_pass(self):
        result,_ = self.make()
        # Every adjacent cross section shares its edge; no isolated plant cards.
        adjacency = {}
        for triangle in result["faces"]:
            for vertex in triangle:
                adjacency.setdefault(vertex,set()).update(triangle)
        remaining=set(adjacency)
        components=[]
        while remaining:
            pending=[next(iter(remaining))]
            seen=set()
            while pending:
                vertex=pending.pop()
                if vertex in seen:
                    continue
                seen.add(vertex)
                pending.extend(adjacency[vertex]-seen)
            remaining-=seen
            components.append(len(seen))
        self.assertEqual(len(components),36)
        self.assertEqual(set(components),{49*3})

    def test_live_scene_guard_precedes_destructive_build(self):
        guard=next(n for n in MODULE.body if isinstance(n,ast.If) and 'bpy.data.filepath' in ast.unparse(n.test))
        deletion=next(n for n in MODULE.body if isinstance(n,ast.Expr) and 'bpy.ops.object.delete' in ast.unparse(n))
        self.assertLess(guard.lineno,deletion.lineno)
        program=compile(ast.Module(body=[guard],type_ignores=[]),str(SOURCE),'exec')
        for filepath,background,blocked in [('owner.blend',True,True),('',False,True),('',True,False)]:
            context={'bpy':SimpleNamespace(data=SimpleNamespace(filepath=filepath),app=SimpleNamespace(background=background))}
            if blocked:
                with self.assertRaises(RuntimeError):
                    exec(program,context)
            else:
                exec(program,context)

    def test_existing_editable_output_is_never_overwritten(self):
        guard=next(n for n in MODULE.body if isinstance(n,ast.If) and 'AgriScope-Cinematic-Assets.blend' in ast.unparse(n.test))
        program=compile(ast.Module(body=[guard],type_ignores=[]),str(SOURCE),'exec')
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            exec(program,{'EVIDENCE':folder})
            source=folder/'AgriScope-Cinematic-Assets.blend'
            source.write_bytes(b'owner source sentinel')
            with self.assertRaises(FileExistsError):
                exec(program,{'EVIDENCE':folder})
            self.assertEqual(source.read_bytes(),b'owner source sentinel')


if __name__ == '__main__':
    unittest.main()
