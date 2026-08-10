export type AccessViewMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: "active" | "suspended" | "removed";
};

export type AccessViewAccount = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
};

export type AccessViewAssignment = {
  id: string;
  principalType: "user" | "team" | "service_account" | "api_key";
  principalId: string;
};

export type AccessViewTeam = {
  id: string;
  name: string;
  members: Array<{ userId: string }>;
};

export type AccessViewPerson<
  TAssignment extends AccessViewAssignment,
  TTeam extends AccessViewTeam,
> = {
  userId: string;
  memberId?: string;
  name: string;
  email: string;
  memberStatus: AccessViewMember["status"] | "not-member";
  platformRole?: string;
  banned?: boolean;
  assignments: TAssignment[];
  teams: TTeam[];
};

export function buildAccessPeople<
  TAssignment extends AccessViewAssignment,
  TTeam extends AccessViewTeam,
>(input: {
  members: AccessViewMember[];
  accounts: AccessViewAccount[];
  assignments: TAssignment[];
  teams: TTeam[];
}) {
  const accountById = new Map(
    input.accounts.map((account) => [account.id, account]),
  );
  const peopleById = new Map<string, AccessViewPerson<TAssignment, TTeam>>();

  for (const member of input.members.filter(
    ({ status }) => status === "active",
  )) {
    const account = accountById.get(member.userId);
    peopleById.set(member.userId, {
      userId: member.userId,
      memberId: member.id,
      name: member.name,
      email: member.email,
      memberStatus: member.status,
      platformRole: account?.role,
      banned: account?.banned,
      assignments: [],
      teams: [],
    });
  }

  for (const account of input.accounts) {
    if (peopleById.has(account.id)) continue;
    peopleById.set(account.id, {
      userId: account.id,
      name: account.name,
      email: account.email,
      memberStatus: "not-member",
      platformRole: account.role,
      banned: account.banned,
      assignments: [],
      teams: [],
    });
  }

  for (const assignment of input.assignments) {
    if (assignment.principalType !== "user") continue;
    peopleById.get(assignment.principalId)?.assignments.push(assignment);
  }

  for (const team of input.teams) {
    for (const member of team.members) {
      peopleById.get(member.userId)?.teams.push(team);
    }
  }

  return [...peopleById.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
