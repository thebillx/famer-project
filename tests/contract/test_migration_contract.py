import ast
import pathlib
import unittest


MIGRATION = pathlib.Path("apps/api/migrations/versions/20260801_0001_foundation.py")


class MigrationContractTests(unittest.TestCase):
    def test_migration_has_upgrade_and_downgrade(self):
        module = ast.parse(MIGRATION.read_text())
        functions = {node.name for node in module.body if isinstance(node, ast.FunctionDef)}
        self.assertIn("upgrade", functions)
        self.assertIn("downgrade", functions)

    def test_core_tables_are_created(self):
        text = MIGRATION.read_text()
        for table in ["users", "organizations", "memberships", "refresh_sessions"]:
            self.assertIn(f'"{table}"', text)
        self.assertIn("uq_membership_org_user", text)


if __name__ == "__main__":
    unittest.main()
