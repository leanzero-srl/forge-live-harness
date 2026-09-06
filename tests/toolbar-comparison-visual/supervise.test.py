import ast,importlib.util,json,pathlib,unittest
folder=pathlib.Path(__file__).parent
spec=importlib.util.spec_from_file_location('sv',folder/'supervise.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Controls(unittest.TestCase):
 def test_prepared_is_inert(self):
  with self.assertRaisesRegex(AssertionError,'not authorized'):m.admit(json.loads((folder/'command-prepared.json').read_text()),None)
 def test_existing_once_lock_stop_and_bounded_execute_unchanged(self):
  def body(path):return next(n for n in ast.parse(path.read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='execute')
  self.assertEqual(ast.dump(body(folder/'supervise.py')),ast.dump(body(folder.parent/'uat-comparison-visual/supervise.py')))
if __name__=='__main__':unittest.main()
