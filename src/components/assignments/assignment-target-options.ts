interface OrganizationMember {
  userId: string;
  email: string;
  fullName: string | null;
  organizationRole: string;
}

interface TeamMembership {
  userId: string;
  teamId: string;
}

interface Team {
  id: string;
  name: string;
}

export function buildAthleteTargetOptions(input: {
  members: readonly OrganizationMember[];
  teamMemberships: readonly TeamMembership[];
  teams: readonly Team[];
}) {
  const teamNameById = new Map(input.teams.map((team) => [team.id, team.name]));
  const teamIdsByUserId = new Map<string, string[]>();

  for (const membership of input.teamMemberships) {
    const teamIds = teamIdsByUserId.get(membership.userId) ?? [];
    teamIds.push(membership.teamId);
    teamIdsByUserId.set(membership.userId, teamIds);
  }

  return input.members
    .filter((member) => member.organizationRole === "athlete")
    .map((member) => {
      const teamIds = teamIdsByUserId.get(member.userId) ?? [];

      return {
        id: member.userId,
        label: member.fullName ?? member.email,
        description: member.fullName ? member.email : undefined,
        keywords: teamIds
          .map((teamId) => teamNameById.get(teamId))
          .filter((teamName): teamName is string => Boolean(teamName)),
        teamIds,
      };
    });
}
