#!/usr/bin/env python3
"""Date/time MCP server — exposes `now` and `today` tools over stdio."""

import time
from datetime import datetime, timezone

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("date")


@mcp.tool()
def now() -> dict:
    """Get the current date and time. Returns ISO 8601 timestamp, IANA timezone, and unix epoch seconds."""
    local = datetime.now().astimezone()
    return {
        "iso": local.isoformat(),
        "utc": datetime.now(timezone.utc).isoformat(),
        "timezone": str(local.tzinfo),
        "epoch": int(time.time()),
    }


@mcp.tool()
def today() -> str:
    """Get today's date in ISO format (YYYY-MM-DD), local timezone."""
    return datetime.now().astimezone().date().isoformat()


if __name__ == "__main__":
    mcp.run()
