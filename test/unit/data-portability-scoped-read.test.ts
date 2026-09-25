import { describe, expect, it } from "vitest";
import { digest } from "@/modules/data-portability/archive";
import {
  exportObjects,
  exportOrganizationObjects,
  type ObjectStore,
} from "@/modules/data-portability/objects";
import {
  emptyDataset,
  tableNames,
  type Dataset,
} from "@/modules/data-portability/registry";
import { selectOrganization } from "@/modules/data-portability/scope";
import {
  memoryRowSource,
  readOrganization,
  readOrganizationSource,
} from "@/modules/data-portability/scoped-read";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1),
  otherOrg = id(2),
  ws = id(11),
  ws2 = id(12),
  otherWs = id(13),
  member = id(21),
  outsider = id(22),
  foreignUser = id(23),
  agent = id(31),
  version = id(32),
  provider = id(33),
  model = id(34),
  conversation = id(41),
  message = id(42),
  item = id(51),
  server = id(61),
  limit = id(71),
  role = id(81);

/** Two organizations sharing users, marketplace, IAM, settings and history. */
function instance(): Dataset {
  const data = emptyDataset();
  data.organizations = [{ id: org }, { id: otherOrg }];
  data.workspaces = [
    { id: ws, organization_id: org },
    { id: ws2, organization_id: org },
    { id: otherWs, organization_id: otherOrg },
  ];
  data.user = [{ id: member }, { id: outsider }, { id: foreignUser }];
  data.organization_members = [
    { id: id(101), organization_id: org, user_id: member },
    { id: id(102), organization_id: otherOrg, user_id: outsider },
    { id: id(103), organization_id: otherOrg, user_id: foreignUser },
  ];
  data.workspace_members = [
    { id: id(104), workspace_id: ws2, user_id: member },
    { id: id(105), workspace_id: otherWs, user_id: foreignUser },
  ];
  data.account = [
    { id: id(111), user_id: member, password: "member" },
    { id: id(112), user_id: outsider, password: "outsider" },
    { id: id(113), user_id: foreignUser, password: "foreign" },
  ];
  data.session = [
    { id: id(114), user_id: member },
    { id: id(115), user_id: outsider },
  ];
  data.ai_providers = [{ id: provider, workspace_id: ws }];
  data.ai_models = [
    { id: model, provider_id: provider, model_id: "gpt-portable" },
  ];
  data.agents = [
    { id: agent, workspace_id: ws, created_by_user_id: member },
    { id: id(35), workspace_id: otherWs, created_by_user_id: foreignUser },
  ];
  data.agent_versions = [
    {
      id: version,
      agent_id: agent,
      provider_id: provider,
      model_id: model,
      generation_settings_json: { providerId: provider },
    },
    { id: id(36), agent_id: id(35) },
  ];
  data.conversations = [
    {
      id: conversation,
      workspace_id: ws,
      user_id: member,
      agent_id: agent,
      agent_version_id: version,
    },
    { id: id(43), workspace_id: otherWs, user_id: foreignUser },
  ];
  data.messages = [
    { id: message, conversation_id: conversation, model_id: "gpt-portable" },
    { id: id(44), conversation_id: id(43) },
  ];
  data.message_parts = [{ id: id(45), message_id: message }];
  data.conversation_shares = [
    {
      id: id(46),
      conversation_id: conversation,
      shared_by_user_id: member,
      shared_with_user_id: outsider,
    },
  ];
  data.marketplace_items = [
    { id: item, publisher_workspace_id: ws, publisher_user_id: member },
    { id: id(52), publisher_workspace_id: otherWs },
  ];
  data.marketplace_ratings = [
    { id: id(53), item_id: item, user_id: outsider },
    { id: id(54), item_id: id(52), user_id: foreignUser },
  ];
  data.mcp_servers = [{ id: server, workspace_id: ws2 }];
  data.mcp_tools = [{ id: id(62), mcp_server_id: server }];
  data.mcp_oauth_configs = [{ server_id: server }];
  data.mcp_oauth_credentials = [{ server_id: server, user_id: member }];
  data.usage_events = [
    { id: id(72), workspace_id: ws, user_id: member, model_id: "gpt-portable" },
    { id: id(73), workspace_id: otherWs, user_id: foreignUser },
  ];
  data.usage_limits = [
    { id: limit, subject_type: "user", subject_id: member },
    { id: id(74), subject_type: "user", subject_id: foreignUser },
    { id: id(75), subject_type: "organization", subject_id: org },
  ];
  data.usage_limit_charges = [{ id: id(76), limit_id: limit }];
  data.roles = [
    { id: role, owner_resource_id: org, is_system: false },
    { id: id(82), owner_resource_id: otherOrg, is_system: false },
  ];
  data.role_bindings = [
    {
      id: id(83),
      role_id: role,
      resource_type: "organization",
      resource_id: org,
      principal_type: "user",
      principal_id: outsider,
    },
    {
      id: id(84),
      role_id: id(82),
      resource_type: "organization",
      resource_id: otherOrg,
      principal_type: "user",
      principal_id: foreignUser,
    },
  ];
  data.app_settings = [
    { key: `companion:organization:${org}` },
    { key: `microsoft-sso:${org}`, value_json: {} },
    { key: `companion:organization:${otherOrg}` },
    { key: `generation:${version}` },
    { key: `generation:${version}:draft` },
    { key: `onboarding.complete:${outsider}` },
    { key: `onboarding.complete:${foreignUser}` },
    { key: "registration" },
  ];
  data.audit_events = [
    {
      id: id(91),
      organization_id: org,
      actor_principal_type: "user",
      actor_principal_id: foreignUser,
    },
  ];
  return data;
}
function sorted(data: Dataset) {
  return Object.fromEntries(
    tableNames.map((name) => [
      name,
      data[name].map((row) => JSON.stringify(row)).sort(),
    ]),
  );
}
describe("scoped organization read", () => {
  it("selects exactly what the full read + filter selected", async () => {
    const data = instance();
    const scoped = await readOrganization(memoryRowSource(data), org);
    expect(sorted(scoped)).toEqual(sorted(selectOrganization(data, org)));
    expect(scoped.user.map((row) => row.id).sort()).toEqual(
      [member, outsider, foreignUser].sort(),
    );
    expect(scoped.account.map((row) => row.id)).toEqual([id(111)]);
  });
  it("never loads the unrelated rows of another organization", async () => {
    const data = instance();
    for (let n = 0; n < 500; n++)
      data.usage_events.push({
        id: id(10_000 + n),
        workspace_id: otherWs,
        user_id: foreignUser,
      });
    const source = await readOrganizationSource(memoryRowSource(data), org);
    expect(source.usage_events.map((row) => row.id)).toEqual([id(72)]);
    expect(source.conversations.map((row) => row.id)).toEqual([conversation]);
  });
  it("applies the row limit to the organization, not to the whole instance", async () => {
    const data = instance();
    for (let n = 0; n <= 100_000; n++)
      data.usage_events.push({ id: `other-${n}`, workspace_id: otherWs });
    const scoped = await readOrganization(memoryRowSource(data), org);
    expect(scoped.usage_events).toHaveLength(1);
  });
  it("keeps the same refusals for non-isolable dependencies", async () => {
    const data = instance();
    data.conversations[0].agent_id = id(35);
    const expected = (() => {
      try {
        selectOrganization(data, org);
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(expected).toMatch(/Cross-organization/);
    await expect(readOrganization(memoryRowSource(data), org)).rejects.toThrow(
      expected!,
    );
  });
});

function memoryStore(files: Record<string, string>): ObjectStore {
  const inventory = Object.entries(files)
    .map(([key, content]) => ({
      key,
      etag: digest(content),
      size: Buffer.byteLength(content),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    list: async (prefix = "") =>
      inventory.filter((object) => object.key.startsWith(prefix)),
    read: async (key) => {
      if (!(key in files))
        throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
      return {
        bytes: Buffer.from(files[key]),
        contentType: "application/octet-stream",
      };
    },
    exists: async (key) => key in files,
    create: async () => "etag",
    removeCreated: async () => undefined,
  };
}
const prefixes = { attachments: "chat-attachments", code: "code-workspaces" };
const metadata = (workspaceId: string, extra: object = {}) =>
  JSON.stringify({ workspaceId, ...extra });
function bucket() {
  return {
    [`knowledge/${ws}/doc/source`]: "document",
    [`knowledge/${otherWs}/doc/source`]: "foreign document",
    [`document-uploads/${ws2}/u/upload/parts/0000000000.part`]: "part",
    [`document-uploads/${otherWs}/u/upload/parts/0000000000.part`]: "foreign",
    "chat-attachments/a1/metadata.json": metadata(ws, {
      objectKey: "chat-attachments/a1/data.bin",
    }),
    "chat-attachments/a1/data.bin": "attachment",
    "chat-attachments/a2/metadata.json": metadata(otherWs),
    "chat-attachments/a2/data.bin": "foreign attachment",
    "code-workspaces/p1/metadata.json": metadata(ws2, {
      files: [{ path: "metadata.json" }],
    }),
    "code-workspaces/p1/files/metadata.json": "user file, not metadata",
    "code-workspaces/p2/metadata.json": metadata(otherWs),
    "code-workspaces/p2/files/main.txt": "foreign code",
  };
}
function organizationRows() {
  const data = emptyDataset();
  data.workspaces = [
    { id: ws, organization_id: org },
    { id: ws2, organization_id: org },
  ];
  data.documents = [
    {
      id: id(200),
      workspace_id: ws,
      object_storage_key: `knowledge/${ws}/doc/source`,
    },
  ];
  return data;
}
async function outcome(run: () => Promise<unknown>) {
  try {
    return { value: await run() };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

describe("scoped organization objects", () => {
  it("exports exactly the objects of the full bucket scan", async () => {
    const store = memoryStore(bucket());
    const scoped = await exportOrganizationObjects(
      store,
      organizationRows(),
      prefixes,
    );
    expect(scoped).toEqual(
      await exportObjects(
        store,
        organizationRows(),
        { type: "organization", organizationId: org },
        prefixes,
      ),
    );
    expect(scoped.map((object) => object.key)).toEqual([
      "chat-attachments/a1/data.bin",
      "chat-attachments/a1/metadata.json",
      "code-workspaces/p1/files/metadata.json",
      "code-workspaces/p1/metadata.json",
      `document-uploads/${ws2}/u/upload/parts/0000000000.part`,
      `knowledge/${ws}/doc/source`,
    ]);
  });
  it("lists only owned folders instead of the whole bucket", async () => {
    const store = memoryStore(bucket());
    const listed: string[] = [];
    const list = store.list;
    store.list = async (prefix) => {
      listed.push(prefix ?? "");
      return list(prefix);
    };
    await exportOrganizationObjects(store, organizationRows(), prefixes);
    expect(listed).not.toContain(`knowledge/${otherWs}/`);
    expect(listed).not.toContain("code-workspaces/p2/");
    expect(listed).toContain("code-workspaces/p1/");
  });
  it.each([
    ["an unknown namespace", { "backups/dump.sql": "x" }],
    ["a root object", { "stray.txt": "x" }],
    ["an attachment without owner metadata", { "chat-attachments/a9/x": "x" }],
    ["a file directly under a prefix", { "code-workspaces/loose.txt": "x" }],
    [
      "invalid owner metadata",
      { "chat-attachments/a9/metadata.json": "not json" },
    ],
    [
      "a missing referenced file",
      {
        "chat-attachments/a9/metadata.json": metadata(ws, {
          objectKey: "chat-attachments/a9/gone.bin",
        }),
      },
    ],
  ])("refuses %s exactly like the full scan", async (_, extra) => {
    const store = memoryStore({ ...bucket(), ...extra });
    const expected = await outcome(() =>
      exportObjects(
        store,
        organizationRows(),
        { type: "organization", organizationId: org },
        prefixes,
      ),
    );
    expect(expected).toHaveProperty("error");
    expect(
      await outcome(() =>
        exportOrganizationObjects(store, organizationRows(), prefixes),
      ),
    ).toEqual(expected);
  });
});
