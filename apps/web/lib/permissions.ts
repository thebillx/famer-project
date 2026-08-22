import { useQueries, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { Member, Organization, User } from "./types";

const ROLE_RANK: Record<Member["role"], number> = {
  organization_owner: 50,
  organization_admin: 40,
  agronomist: 30,
  field_manager: 20,
  viewer: 10
};

export function canManageFields(role: Member["role"]): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.field_manager;
}

export function useManageableOrganizations() {
  const organizations = useQuery({
    queryKey: ["organizations"],
    queryFn: () => apiFetch<Organization[]>("/api/v1/organizations")
  });
  const currentUser = useQuery({
    queryKey: ["current-user"],
    queryFn: () => apiFetch<User>("/api/v1/auth/me")
  });
  const memberships = useQueries({
    queries: (organizations.data ?? []).map((organization) => ({
      queryKey: ["organization-members", organization.id],
      queryFn: () => apiFetch<Member[]>(`/api/v1/organizations/${organization.id}/members`),
      enabled: Boolean(currentUser.data)
    }))
  });

  const membershipError = memberships.find((query) => query.isError)?.error;
  const isError = organizations.isError || currentUser.isError || Boolean(membershipError);
  const isFetching = organizations.isFetching || currentUser.isFetching || memberships.some((query) => query.isFetching);
  const manageableOrganizations = isError || isFetching ? [] : (organizations.data ?? []).filter((organization, index) => {
    const membershipQuery = memberships[index];
    if (!membershipQuery?.isSuccess || membershipQuery.isError) return false;
    const membership = membershipQuery.data.find((member) => member.user_id === currentUser.data?.id);
    return membership ? canManageFields(membership.role) : false;
  });
  const membershipLoading = Boolean(organizations.data?.length && currentUser.data) && memberships.some((query) => query.isLoading);

  return {
    organizations: organizations.data ?? [],
    manageableOrganizations,
    isLoading: organizations.isLoading || currentUser.isLoading || membershipLoading || isFetching,
    isError,
    error: organizations.error ?? currentUser.error ?? membershipError ?? null
  };
}

export function useOrganizationPermission(organizationId?: string) {
  const currentUser = useQuery({
    queryKey: ["current-user"],
    queryFn: () => apiFetch<User>("/api/v1/auth/me"),
    enabled: Boolean(organizationId)
  });
  const members = useQuery({
    queryKey: ["organization-members", organizationId],
    queryFn: () => apiFetch<Member[]>(`/api/v1/organizations/${organizationId}/members`),
    enabled: Boolean(organizationId && currentUser.data)
  });
  const membership = members.data?.find((member) => member.user_id === currentUser.data?.id);
  const isError = currentUser.isError || members.isError;
  const isFetching = currentUser.isFetching || members.isFetching;

  return {
    canManage: !isError && !isFetching && membership ? canManageFields(membership.role) : false,
    isLoading: Boolean(organizationId) && (currentUser.isLoading || (Boolean(currentUser.data) && members.isLoading) || isFetching),
    isError,
    error: currentUser.error ?? members.error ?? null
  };
}
