# Copyright (c) 2026, Vinayak and contributors
# License: MIT. See license.txt

import os
import subprocess
import time

import frappe
from frappe import _

from edu.edu.edu_update_runner import (
	BENCH,
	EXIT_PATH,
	LOG_PATH,
	PENDING,
	PID_PATH,
	bench_executable,
	pid_alive,
	read_pid,
)

LOG_TAIL = 80_000
PENDING_STALE_SECONDS = 60


@frappe.whitelist()
def start_edu_update():
	"""Pull the edu app, then clear caches, install requirements, build, migrate, and restart."""
	frappe.only_for("System Manager")
	if not bench_executable():
		frappe.throw(_("The bench command was not found."))
	_claim_update()
	python = BENCH / "env" / "bin" / "python"
	if not python.exists():
		PID_PATH.unlink(missing_ok=True)
		frappe.throw(_("The bench Python was not found."))

	env = os.environ.copy()
	env["GIT_TERMINAL_PROMPT"] = "0"
	env["PYTHONUNBUFFERED"] = "1"
	try:
		process = subprocess.Popen(
			[str(python), "-m", "edu.edu.edu_update_runner"],
			cwd=str(BENCH),
			env=env,
			stdin=subprocess.DEVNULL,
			stdout=subprocess.DEVNULL,
			stderr=subprocess.DEVNULL,
			start_new_session=True,
		)
	except OSError:
		PID_PATH.unlink(missing_ok=True)
		raise
	PID_PATH.write_text(f"{process.pid}\n", encoding="utf-8")
	return {"started": True}


@frappe.whitelist()
def edu_update_status():
	frappe.only_for("System Manager")
	running = _update_is_running()
	exit_code = None
	if not running and EXIT_PATH.exists():
		text = EXIT_PATH.read_text(encoding="utf-8").strip()
		exit_code = int(text) if text.lstrip("-").isdigit() else 1
	return {"running": running, "exit_code": exit_code, "log": _tail(LOG_PATH)}


def _claim_update() -> None:
	PID_PATH.parent.mkdir(parents=True, exist_ok=True)
	while True:
		try:
			fd = os.open(PID_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
		except FileExistsError:
			if _update_is_running():
				frappe.throw(_("An update is already running."))
			PID_PATH.unlink(missing_ok=True)
			continue
		os.write(fd, b"pending\n")
		os.close(fd)
		return


def _update_is_running() -> bool:
	try:
		text = PID_PATH.read_text(encoding="utf-8").strip()
	except FileNotFoundError:
		return False
	if text == PENDING:
		age = time.time() - PID_PATH.stat().st_mtime
		return age < PENDING_STALE_SECONDS
	return pid_alive(read_pid())


def _tail(path, max_bytes: int = LOG_TAIL) -> str:
	try:
		size = path.stat().st_size
	except FileNotFoundError:
		return ""
	with path.open("rb") as handle:
		if size > max_bytes:
			handle.seek(size - max_bytes)
		data = handle.read()
	text = data.decode("utf-8", errors="replace")
	if size > max_bytes:
		text = text.split("\n", 1)[-1]
		text = f"...\n{text}"
	return text
