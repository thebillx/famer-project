import unittest
from uuid import uuid4

from apps.api.agriscope_api.core.security import Role
from apps.api.agriscope_api.dependencies.auth import CurrentMembership
from apps.api.agriscope_api.repositories.base import TenantScope, TenantScopedRepository


class TenantScopeFoundationTests(unittest.TestCase):
    def test_active_owner_can_require_owner(self):
        membership = CurrentMembership(uuid4(), uuid4(), Role.ORGANIZATION_OWNER)
        membership.require(Role.ORGANIZATION_OWNER)

    def test_viewer_cannot_mutate_admin_resource(self):
        membership = CurrentMembership(uuid4(), uuid4(), Role.VIEWER)
        with self.assertRaises(PermissionError):
            membership.require(Role.ORGANIZATION_ADMIN)

    def test_disabled_membership_cannot_access(self):
        membership = CurrentMembership(uuid4(), uuid4(), Role.ORGANIZATION_OWNER, status="disabled")
        with self.assertRaises(PermissionError):
            membership.require(Role.VIEWER)

    def test_repository_requires_organization_scope(self):
        scope = TenantScope(organization_id=uuid4(), user_id=uuid4(), role=Role.VIEWER.value)
        repository = TenantScopedRepository(session=None, scope=scope)
        self.assertEqual(repository.require_scope(), scope.organization_id)


if __name__ == "__main__":
    unittest.main()
