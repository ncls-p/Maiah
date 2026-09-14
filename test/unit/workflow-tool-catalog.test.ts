import { describe,expect,it,vi } from "vitest";
import {z} from "zod";
const mocks=vi.hoisted(()=>({policies:vi.fn(),servers:vi.fn(),tools:vi.fn(),custom:vi.fn(),available:vi.fn(),connections:vi.fn()}));
vi.mock("@/modules/tool/builtin-tools",()=>({listBuiltInTools:()=>[{id:"one",name:"one",displayName:"One",description:"Simple",requiresApprovalByDefault:false},{id:"disabled",name:"disabled"}],getBuiltInTool:()=>({inputSchema:z.object({message:z.string()})})}));
vi.mock("@/modules/tool/organization-builtin-tool-policies",()=>({getOrganizationBuiltInToolPolicyMap:mocks.policies}));
vi.mock("@/modules/mcp/use-cases",()=>({listMcpServers:mocks.servers,listMcpTools:mocks.tools}));
vi.mock("@/modules/custom-tools/use-cases",()=>({listCustomTools:mocks.custom}));
vi.mock("@/modules/tool/use-cases",()=>({getAvailableCustomToolContext:mocks.available}));
vi.mock("@/modules/tool-connections/use-cases.build-signed-tool-context-headers",()=>({listToolExecutionConnections:mocks.connections}));
import {listWorkflowTools} from "@/modules/workflows/tool-catalog";
describe("workflow tool catalog",()=>{
 it("returns accessible active tools with schemas, connection choices and effective approval",async()=>{
  mocks.policies.mockResolvedValue(new Map([["disabled",{enabled:false}]]));
  mocks.servers.mockResolvedValue([{id:"server",workspaceId:"workspace",name:"ServiceNow",enabled:true,requireApproval:true},{id:"off",enabled:false},{id:"other",enabled:true,workspaceId:"other"}]);
  mocks.tools.mockResolvedValue([{id:"mcp",name:"Order",description:"Place order",enabled:true,requireApproval:false,inputSchemaJson:{type:"object"},outputSchemaJson:{type:"object"}},{id:"off",enabled:false}]);
  mocks.connections.mockResolvedValue([{id:"connection",label:"Test",isDefault:true}]);
  mocks.custom.mockResolvedValue([{id:"custom",name:"Custom",description:null,status:"active"},{id:"hidden",status:"active"},{id:"off",status:"failed"}]);
  mocks.available.mockImplementation(async(id)=>id==="custom" ? {tool:{inputSchemaJson:{type:"object"}}}:null);
  const tools=await listWorkflowTools("workspace","user");
  expect(tools.map(tool=>tool.id)).toEqual(["one","mcp","custom"]);
  expect(tools[1]).toMatchObject({source:"mcp",requireApproval:true,connections:[{id:"connection"}],inputSchema:{type:"object"},outputSchema:{type:"object"}});
  expect(mocks.connections).toHaveBeenCalledWith({workspaceId:"workspace",userId:"user",toolSource:"mcp",toolId:"mcp",mcpServerId:"server"});
 });
});
