#!/usr/bin/env python3
"""System-info MCP server — exposes a single `get_info` tool over stdio."""

import os
import platform
import socket
import sys
import time

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("sysinfo")

_BOOT_MONOTONIC = time.monotonic()


@mcp.tool()
def get_info() -> dict:
    """Get host system information: OS, architecture, Python version, CPU count, hostname."""
    return {
        "platform": platform.platform(),
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "python_version": sys.version.split()[0],
        "cpu_count": os.cpu_count(),
        "hostname": socket.gethostname(),
        "server_uptime_seconds": round(time.monotonic() - _BOOT_MONOTONIC, 2),
    }


if __name__ == "__main__":
    mcp.run()
