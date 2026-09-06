import ast,importlib.util,pathlib,unittest
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('supervise',HERE/'supervise.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class SupervisorTests(unittest.TestCase):
 def test_prepared_is_inert(self):
  with self.assertRaisesRegex(AssertionError,'not authorized'):m.admit({'status':'prepared'},None)
 def test_reviewed_child_lifecycle_only_ceiling_changes(self):
  old=ast.parse((HERE.parents[1]/'evidence/lz-campaign/private-retained-acceptance-20260906/supervise.py').read_text());new=ast.parse((HERE/'supervise.py').read_text())
  a=next(n for n in old.body if isinstance(n,ast.FunctionDef) and n.name=='execute');b=next(n for n in new.body if isinstance(n,ast.FunctionDef) and n.name=='execute')
  for n in ast.walk(a):
   if isinstance(n,ast.Constant) and n.value==900:n.value=2400
  self.assertEqual(ast.dump(a),ast.dump(b))
if __name__=='__main__':unittest.main()
