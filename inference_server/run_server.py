"""Convenience launcher for the inference server.

On Windows, Uvicorn multi-worker mode is not reliable for this project,
so we fall back to a single worker automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn


if __name__ == "__main__":
    host = os.getenv("INFERENCE_SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("INFERENCE_SERVER_PORT", "8091"))
    reload_enabled = os.getenv("INFERENCE_SERVER_RELOAD", "0") == "1"

    # Windows uses a single worker; Linux/macOS can opt into more via env var.
    if os.name == "nt":
        workers = 1
    else:
        workers = int(os.getenv("INFERENCE_SERVER_WORKERS", "2"))

    uvicorn.run(
        "inference_server.app:app",
        host=host,
        port=port,
        reload=reload_enabled,
        workers=workers if not reload_enabled else 1,
    )
