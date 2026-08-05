# pyright: reportMissingImports=false
"""HTTP/SSE entry point for the multi-tenant ServiceNow MCP gateway."""
from __future__ import annotations

import logging
import os

import uvicorn
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

from .context import read_gateway_context
from .gateway import create_gateway_mcp


async def health(_request: Request) -> JSONResponse:
    return JSONResponse({"ok": True, "service": "maiah-servicenow-mcp-gateway"})


def create_app() -> Starlette:
    sse = SseServerTransport("/messages/")

    async def handle_sse(request: Request) -> None:
        context = read_gateway_context(request)
        mcp_server = create_gateway_mcp(context)
        async with sse.connect_sse(
            request.scope,
            request.receive,
            request._send,  # noqa: SLF001 - required by mcp SSE transport
        ) as (read_stream, write_stream):
            await mcp_server.run(
                read_stream,
                write_stream,
                mcp_server.create_initialization_options(),
            )

    return Starlette(
        debug=os.getenv("SERVICENOW_GATEWAY_DEBUG", "false").lower() == "true",
        routes=[
            Route("/health", endpoint=health),
            Route("/sse", endpoint=handle_sse),
            Mount("/messages/", app=sse.handle_post_message),
        ],
    )


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(create_app(), host=host, port=port)


if __name__ == "__main__":
    main()

