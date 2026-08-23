import ast
import pathlib
import unittest


MIGRATION = pathlib.Path("apps/api/migrations/versions/20260801_0001_foundation.py")
FIELD_MIGRATION = pathlib.Path("apps/api/migrations/versions/20260801_0002_farm_field.py")
SATELLITE_MIGRATION = pathlib.Path(
    "apps/api/migrations/versions/20260801_0003_satellite_acquisitions.py"
)
OWNER_MIGRATION = pathlib.Path("apps/api/migrations/versions/20260823_0004_farm_owner_scope.py")


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

    def test_field_migration_enforces_farm_organization_integrity(self):
        text = FIELD_MIGRATION.read_text()
        self.assertIn("uq_farms_id_organization_id", text)
        self.assertIn("fk_fields_farm_organization", text)
        self.assertIn('["farm_id", "organization_id"]', text)
        self.assertIn('["farms.id", "farms.organization_id"]', text)

    def test_satellite_migration_persists_acquisitions_with_field_organization_integrity(self):
        text = SATELLITE_MIGRATION.read_text()
        self.assertIn("field_acquisitions", text)
        self.assertIn("uq_field_acquisition_item", text)
        self.assertIn("uq_fields_id_organization_id", text)
        self.assertIn("fk_field_acquisitions_field_organization", text)
        self.assertIn('["field_id", "organization_id"]', text)
        self.assertIn('["fields.id", "fields.organization_id"]', text)

    def test_owner_migration_has_transactional_single_owner_backfill(self):
        text = OWNER_MIGRATION.read_text()
        module = ast.parse(text)
        functions = {node.name for node in module.body if isinstance(node, ast.FunctionDef)}
        self.assertIn("upgrade", functions)
        self.assertIn("downgrade", functions)
        self.assertIn('"owner_user_id"', text)
        self.assertIn("20260801_0003", text)
        self.assertIn("organization_owner", text)
        self.assertIn("COUNT(DISTINCT m.user_id) <> 1", text)
        self.assertIn("fk_farms_owner_membership", text)
        self.assertIn('["organization_id", "owner_user_id"]', text)
        self.assertIn('["organization_id", "user_id"]', text)
        self.assertIn("ix_farms_owner_user_id", text)
        self.assertIn("raise RuntimeError", text)


if __name__ == "__main__":
    unittest.main()
