# Copyright (c) 2026, Vinayak and contributors
# License: MIT. See license.txt

"""Run the edu update outside the web process.

The web worker only starts this module. The process is its own session, so
`bench restart` can stop the desk without killing the update that asked for it.
"""

import os
import shutil
import subprocess
import traceback
from pathlib import Path

BENCH = Path(__file__).resolve().parents[4]
EDU_APP = BENCH / "apps" / "edu"
LOG_PATH = BENCH / "logs" / "edu-update.log"
EXIT_PATH = BENCH / "logs" / "edu-update.exit"
PID_PATH = BENCH / "logs" / "edu-update.pid"
PENDING = "pending"


def bench_executable() -> str | None:
	extra = [
		str(Path.home() / ".local" / "bin"),
		"/opt/homebrew/bin",
		"/usr/local/bin",
	]
	path = os.pathsep.join(extra + [os.environ.get("PATH", "")])
	return shutil.which("bench", path=path)


def update_steps(bench_bin: str) -> list[tuple[Path, list[str]]]:
	return [
		(EDU_APP, ["git", "pull", "--ff-only"]),
		(BENCH, [bench_bin, "clear-cache"]),
		(BENCH, [bench_bin, "clear-website-cache"]),
		(BENCH, [bench_bin, "setup", "requirements"]),
		(BENCH, [bench_bin, "build"]),
		(BENCH, [bench_bin, "migrate"]),
		(BENCH, [bench_bin, "restart"]),
	]


def read_pid(path: Path = PID_PATH) -> int | None:
	try:
		text = path.read_text(encoding="utf-8").strip()
	except FileNotFoundError:
		return None
	if not text.isdigit():
		return None
	return int(text)


def pid_alive(pid: int | None) -> bool:
	if not pid:
		return False
	try:
		os.kill(pid, 0)
	except OSError:
		return False
	return True


def claim_running(pid: int) -> None:
	PID_PATH.write_text(f"{pid}\n", encoding="utf-8")


def release_running(pid: int) -> None:
	if read_pid() == pid:
		PID_PATH.unlink(missing_ok=True)


def execute_update() -> int:
	EXIT_PATH.unlink(missing_ok=True)
	LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
	PID_PATH.write_text(f"{os.getpid()}\n", encoding="utf-8")
	log = LOG_PATH.open("w", encoding="utf-8")
	os.dup2(log.fileno(), 1)
	os.dup2(log.fileno(), 2)
	code = 1
	try:
		code = _run()
	except Exception:
		traceback.print_exc()
		code = 1
	finally:
		print(f"\n=== finished with status {code} ===", flush=True)
		EXIT_PATH.write_text(f"{code}\n", encoding="utf-8")
		log.flush()
		release_running(os.getpid())
		log.close()
	return code


def _run() -> int:
	bench_bin = bench_executable()
	if not bench_bin:
		print("The bench command was not found.", flush=True)
		return 1
	if not (EDU_APP / ".git").exists():
		print(f"{EDU_APP} is not a git checkout.", flush=True)
		return 1

	env = os.environ.copy()
	env["GIT_TERMINAL_PROMPT"] = "0"
	env["PYTHONUNBUFFERED"] = "1"
	env["PATH"] = os.pathsep.join(
		[
			str(Path.home() / ".local" / "bin"),
			"/opt/homebrew/bin",
			"/usr/local/bin",
			env.get("PATH", ""),
		]
	)

	print("=== Edu update started ===", flush=True)
	for cwd, command in update_steps(bench_bin):
		shown = " ".join(command)
		print(f"\n=== {shown} ===", flush=True)
		completed = subprocess.run(command, cwd=cwd, env=env, check=False)
		if completed.returncode != 0:
			print(f"=== {shown} failed with status {completed.returncode} ===", flush=True)
			return completed.returncode
	return 0


if __name__ == "__main__":
	raise SystemExit(execute_update())
