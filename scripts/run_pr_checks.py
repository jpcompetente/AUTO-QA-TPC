from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
NPM = "npm.cmd" if os.name == "nt" else "npm"


@dataclass(frozen=True)
class CommandResult:
    label: str
    command: str
    returncode: int


def run_command(label: str, command: list[str], cwd: Path) -> CommandResult:
    print(f"\n=== {label} ===")
    print(f"$ {' '.join(command)}")

    completed = subprocess.run(
        command,
        cwd=str(cwd),
        env={**os.environ},
        text=True,
        capture_output=True,
    )

    if completed.stdout:
                print(completed.stdout, end="")
    if completed.stderr:
        print(completed.stderr, end="", file=sys.stderr)

    print(f"--- exit code: {completed.returncode} ---")
    return CommandResult(label=label, command=" ".join(command), returncode=completed.returncode)


def main() -> int:
    if not PYTHON.exists():
        print(f"Python executable not found: {PYTHON}", file=sys.stderr)
        return 1

    frontend_dir = ROOT / "frontend-vite"
    results: list[CommandResult] = []

    results.append(
        run_command(
            "Backend tests",
            [str(PYTHON), "manage.py", "test", "core.tests", "-v", "2"],
            ROOT,
        )
    )

    results.append(
        run_command(
            "Inference server tests",
            [str(PYTHON), "-m", "unittest", "inference_server.tests", "-v"],
            ROOT,
        )
    )

    results.append(
        run_command(
            "Frontend lint",
            [NPM, "run", "lint"],
            frontend_dir,
        )
    )

    results.append(
        run_command(
            "Frontend build",
            [NPM, "run", "build"],
            frontend_dir,
        )
    )

    print("\n=== Summary ===")
    all_passed = True
    for result in results:
        status = "PASS" if result.returncode == 0 else "FAIL"
        print(f"{status}: {result.label}")
        all_passed &= result.returncode == 0

    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())