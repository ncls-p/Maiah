# OpenAI-compatible model proxy

Maiah exposes the text-generation models enabled in a workspace through an OpenAI-compatible API. The workspace is selected by the API token; callers never send a workspace identifier in an OpenAI request.

## Base URL and authentication

Production:

```text
https://maiah.shiftify.eco/v1
```

Send a Maiah workspace token as a standard Bearer token:

```http
Authorization: Bearer ahub_...
```

Create the token from **API keys** with these precise scopes:

- `models.view` for `GET /v1/models` and `GET /v1/models/{model}`;
- `models.invoke` for `POST /v1/chat/completions` and `POST /v1/responses`.

The token remains limited by its owner's current workspace role. Revoking the role permission, expiring the token or revoking the token takes effect immediately.

## Official OpenAI JavaScript SDK

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.MAIAH_API_KEY,
  baseURL: "https://maiah.shiftify.eco/v1",
});

const models = await client.models.list();
const model = models.data[0].id;

const response = await client.responses.create({
  model,
  input: "Résume les trois risques principaux de ce projet.",
});

console.log(response.output_text);
```

Chat Completions works with the same client:

```ts
const stream = await client.chat.completions.create({
  model,
  messages: [{ role: "user", content: "Explique ce changement." }],
  stream: true,
  stream_options: { include_usage: true },
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta.content ?? "");
}
```

## Official OpenAI Python SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="ahub_...",
    base_url="https://maiah.shiftify.eco/v1",
)

models = client.models.list()
result = client.responses.create(
    model=models.data[0].id,
    input="Bonjour depuis le proxy Maiah",
)
print(result.output_text)
```

## cURL

```bash
curl https://maiah.shiftify.eco/v1/chat/completions \
  -H "Authorization: Bearer $MAIAH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "MODEL_ID_FROM_V1_MODELS",
    "messages": [{"role": "user", "content": "Bonjour"}]
  }'
```

## Model identifiers

`GET /v1/models` returns only enabled text-generation models from enabled, non-archived providers in the token workspace.

The upstream model identifier is used directly when it is unique in the workspace. If two providers expose the same identifier, Maiah returns a qualified identifier in the form `<provider-id>/<upstream-model-id>`. Always use the `id` returned by `/v1/models`; it is accepted by both generation endpoints and by `GET /v1/models/{model}`.

The Model object retains standard OpenAI fields and adds non-breaking Maiah metadata such as `display_name`, capabilities, context limits and internal provider/model IDs.

## Compatibility

| Capability                                   | Chat Completions                                      | Responses                             |
| -------------------------------------------- | ----------------------------------------------------- | ------------------------------------- |
| Non-streaming text                           | Yes                                                   | Yes                                   |
| SSE streaming                                | Data chunks plus `[DONE]`                             | Named Responses events                |
| Usage accounting                             | Yes, including `stream_options.include_usage`         | Yes                                   |
| System/developer/user/assistant messages     | Yes                                                   | Yes                                   |
| Image URL or data URL input                  | Yes                                                   | Yes                                   |
| Function definitions and tool choice         | Yes                                                   | Yes                                   |
| Returning function calls to the caller       | Yes                                                   | Yes                                   |
| Function/tool results in a following request | Yes                                                   | Yes                                   |
| JSON object output                           | Yes                                                   | Yes                                   |
| JSON Schema structured output                | Yes                                                   | Yes                                   |
| Provider parameters                          | Temperature, top-p, penalties, seed, stop, max tokens | Temperature, top-p, max output tokens |

The proxy is deliberately stateless and does not pretend to implement features it cannot honor. It returns an OpenAI-shaped `invalid_request_error` for:

- stored outputs, `previous_response_id` and background Responses;
- hosted OpenAI-only tools and include expansions;
- audio output and log probabilities;
- Chat Completions with `n` other than `1`;
- embeddings, image generation, audio, realtime, batches and fine-tuning endpoints.

Caller-defined functions are **not executed by the proxy**. The model returns a function/tool call in the normal OpenAI shape; the caller executes it and sends the result in a subsequent request. Maiah agents that execute their configured tools use the separate agent-run API.

## Errors, quotas and observability

All HTTP errors use the OpenAI envelope:

```json
{
  "error": {
    "message": "...",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_not_found"
  }
}
```

Requests are rate-limited per API token (`OPENAI_PROXY_RPM`, default 120 requests/minute), checked against the workspace monthly token quota, and recorded in usage events with the real provider, model, token counts, latency and outcome.

The complete interactive contract is available at [`/api/docs`](https://maiah.shiftify.eco/api/docs#/), under the **OpenAI compatible** tag.
