from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
from pathlib import Path


DEFAULT_IMAGE = "dfhis-ui-sandbox:browserless-chrome121"
BASE_IMAGE = "browserless/chrome@sha256:57d19e414d9fe4ae9d2ab12ba768c97f38d51246c5b31af55a009205c136012f"
DEFAULT_REMOTE = "root@192.168.1.10"
DEFAULT_BASE_URL = "http://192.168.1.151:8015/"
PASSTHROUGH_ENV = (
    "DFHIS_USERNAME",
    "DFHIS_PASSWORD",
    "DFHIS_SYSTEM_CODE",
    "DFHIS_DEPARTMENT",
    "DFHIS_WARD",
    "DFHIS_TEST_SUBJECT",
)


class CommandFailed(RuntimeError):
    pass


def run_process(argv: list[str], *, data: bytes | None = None, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[bytes]:
    result = subprocess.run(argv, input=data, capture_output=True, env=env)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).decode(errors="replace").strip()
        raise CommandFailed(f"command failed ({argv[0]}): {detail}")
    return result


def ssh_transport(remote: str, executable: str) -> tuple[list[str], dict[str, str]]:
    password = os.getenv("DFHIS_UI_SANDBOX_SSH_PASSWORD") or os.getenv("ORCA_RELEASE_SSH_PASSWORD")
    environment = dict(os.environ)
    base = [executable]
    if password:
        if not shutil.which("sshpass"):
            raise CommandFailed("password authentication requires sshpass; install it or configure an SSH key")
        environment["SSHPASS"] = password
        base = ["sshpass", "-e", executable]
    options = ["-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=accept-new"]
    if not password:
        options.extend(["-o", "BatchMode=yes"])
    return [*base, *options, remote], environment


def remote_exec(remote: str, argv: list[str]) -> subprocess.CompletedProcess[bytes]:
    command, environment = ssh_transport(remote, "ssh")
    return run_process([*command, shlex.join(argv)], env=environment)


def remote_copy(remote: str, source: Path, target: str, *, download: bool = False) -> None:
    command, environment = ssh_transport(remote, "scp")
    remote_path = f"{remote}:{target}"
    argv = [*command[:-1], remote_path if download else str(source), str(source) if download else remote_path]
    run_process(argv, env=environment)


def docker(args: argparse.Namespace, argv: list[str]) -> subprocess.CompletedProcess[bytes]:
    if args.backend == "remote":
        return remote_exec(args.remote, ["docker", *argv])
    return run_process(["docker", *argv])


def ensure_image(args: argparse.Namespace) -> bool:
    target_id = None
    try:
        target = docker(args, ["image", "inspect", "--format", "{{.Id}}", args.image])
        target_id = target.stdout.decode().strip()
    except CommandFailed:
        pass
    try:
        base = docker(args, ["image", "inspect", "--format", "{{.Id}}", BASE_IMAGE])
    except CommandFailed:
        docker(args, ["pull", BASE_IMAGE])
        base = docker(args, ["image", "inspect", "--format", "{{.Id}}", BASE_IMAGE])
    if target_id == base.stdout.decode().strip():
        return False
    docker(args, ["tag", BASE_IMAGE, args.image])
    return True


def probe(args: argparse.Namespace) -> dict[str, object]:
    script = """const {chromium}=require('playwright-core'); (async()=>{const b=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});const p=await b.newPage();const r=await p.goto(process.argv[1],{waitUntil:'domcontentloaded',timeout:15000});console.log(JSON.stringify({status:r.status(),title:await p.title()}));await b.close()})().catch(e=>{console.error(e);process.exit(1)})"""
    result = docker(
        args,
        [
            "run", "--rm", "--network", "bridge", "--cpus", "1", "--memory", "1g", "--shm-size", "256m",
            "--pids-limit", "128", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
            "--read-only", "--tmpfs", "/tmp:rw,nosuid,nodev,size=512m", "--env", "NODE_PATH=/usr/src/app/node_modules",
            "--entrypoint", "node", args.image, "-e", script, args.base_url,
        ],
    )
    browser = json.loads(result.stdout.decode())
    return {"baseUrl": args.base_url, "httpStatus": browser["status"], "title": browser["title"]}


def doctor(args: argparse.Namespace) -> dict[str, object]:
    version = docker(args, ["version", "--format", "{{.Server.Version}}/{{.Server.Os}}/{{.Server.Arch}}"])
    image_ready = True
    image_id = None
    try:
        inspected = docker(args, ["image", "inspect", "--format", "{{.Id}}", args.image])
        image_id = inspected.stdout.decode().strip()
    except CommandFailed:
        image_ready = False
    return {
        "ok": True,
        "backend": args.backend,
        "remote": args.remote if args.backend == "remote" else None,
        "docker": version.stdout.decode().strip(),
        "image": args.image,
        "imageId": image_id,
        "imageReady": image_ready,
    }


def write_env_file(path: Path, args: argparse.Namespace, work_item: str) -> list[str]:
    values = {
        "DFHIS_UI_SANDBOX": "1",
        "DFHIS_BASE_URL": args.base_url,
        "TEST_ARTIFACT_ROOT": "/artifacts",
        "TEST_WORK_ITEM_ID": work_item,
        "UI_HEADLESS": "true",
    }
    values.update({name: os.environ[name] for name in PASSTHROUGH_ENV if os.getenv(name)})
    if args.allow_mutations:
        values["DFHIS_ALLOW_MUTATIONS"] = "1"
    for name, value in values.items():
        if "\n" in value or "\r" in value:
            raise CommandFailed(f"environment variable {name} contains a newline")
    path.write_text("".join(f"{name}={value}\n" for name, value in values.items()), encoding="utf-8")
    path.chmod(0o600)
    return sorted(values)


def container_argv(args: argparse.Namespace, container: str, mount: str, env_file: str, script: str) -> list[str]:
    mount_arguments = (
        ["--volume", f"{mount}:/artifacts:Z"]
        if args.backend == "remote"
        else ["--mount", f"type=bind,src={mount},dst=/artifacts"]
    )
    return [
        "run", "--name", container, "--rm", "--init", "--network", "bridge", "--cpus", str(args.cpus),
        "--memory", args.memory, "--pids-limit", "512", "--shm-size", "1g", "--user", "0:0", "--read-only",
        "--tmpfs", "/tmp:rw,nosuid,nodev,size=1g", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges", "--env-file", env_file,
        "--env", "NODE_PATH=/usr/src/app/node_modules", *mount_arguments,
        "--entrypoint", "node", args.image, script,
    ]


def safe_extract(archive: Path, destination: Path) -> None:
    with tarfile.open(archive, "r:gz") as bundle:
        destination_root = destination.resolve()
        for member in bundle.getmembers():
            target = (destination / member.name).resolve()
            if destination_root not in target.parents and target != destination_root:
                raise CommandFailed(f"unsafe archive member: {member.name}")
        bundle.extractall(destination, filter="data")


def redact(output: bytes) -> bytes:
    text = output.decode(errors="replace")
    for name in ("DFHIS_PASSWORD", "DFHIS_USERNAME"):
        value = os.getenv(name, "")
        if value:
            text = text.replace(value, f"<{name.lower()}-redacted>")
    return text.encode()


def run_local(args: argparse.Namespace, root: Path, script_relative: Path, env_file: Path, container: str) -> tuple[bytes, int]:
    argv = container_argv(args, container, str(root), str(env_file), f"/artifacts/{args.work_item}/{script_relative.as_posix()}")
    result = subprocess.run(["docker", *argv], capture_output=True)
    return redact(result.stdout + result.stderr), result.returncode


def make_archive(work_root: Path, archive: Path) -> None:
    with tarfile.open(archive, "w:gz") as bundle:
        bundle.add(work_root, arcname=work_root.name)


def run_remote(args: argparse.Namespace, root: Path, work_root: Path, script_relative: Path, env_file: Path, container: str) -> tuple[bytes, int]:
    run_directory = f"/tmp/dfhis-ui-sandbox-{uuid.uuid4().hex}"
    with tempfile.TemporaryDirectory(prefix="dfhis-ui-transfer-") as directory:
        upload = Path(directory) / "input.tar.gz"
        download = Path(directory) / "result.tar.gz"
        make_archive(work_root, upload)
        try:
            remote_exec(args.remote, ["mkdir", "-m", "700", run_directory])
            remote_copy(args.remote, upload, f"{run_directory}/input.tar.gz")
            remote_copy(args.remote, env_file, f"{run_directory}/test.env")
            remote_exec(args.remote, ["chmod", "600", f"{run_directory}/test.env"])
            remote_exec(args.remote, ["mkdir", f"{run_directory}/artifacts"])
            remote_exec(args.remote, ["tar", "-xzf", f"{run_directory}/input.tar.gz", "-C", f"{run_directory}/artifacts"])
            remote_exec(args.remote, ["chown", "-R", "0:0", f"{run_directory}/artifacts"])
            argv = container_argv(
                args,
                container,
                f"{run_directory}/artifacts",
                f"{run_directory}/test.env",
                f"/artifacts/{args.work_item}/{script_relative.as_posix()}",
            )
            result = remote_exec_unchecked(args.remote, ["docker", *argv])
            remote_exec(args.remote, ["tar", "-czf", f"{run_directory}/result.tar.gz", "-C", f"{run_directory}/artifacts", args.work_item])
            remote_copy(args.remote, download, f"{run_directory}/result.tar.gz", download=True)
            safe_extract(download, root)
            return redact(result.stdout + result.stderr), result.returncode
        finally:
            remote_exec_unchecked(args.remote, ["docker", "rm", "-f", container])
            remote_exec(args.remote, ["rm", "-rf", run_directory])


def remote_exec_unchecked(remote: str, argv: list[str]) -> subprocess.CompletedProcess[bytes]:
    command, environment = ssh_transport(remote, "ssh")
    return subprocess.run([*command, shlex.join(argv)], capture_output=True, env=environment)


def run_test(args: argparse.Namespace) -> int:
    work_item = args.work_item.strip().upper()
    if not re.fullmatch(r"DFHIS-\d+", work_item):
        raise CommandFailed("work item must look like DFHIS-31774")
    args.work_item = work_item
    root = args.root.expanduser().resolve()
    work_root = root / work_item
    script = args.script.expanduser().resolve()
    if not script.is_file() or work_root.resolve() not in script.parents:
        raise CommandFailed(f"test script must exist under {work_root}")
    script_relative = script.relative_to(work_root)
    (work_root / "reports").mkdir(parents=True, exist_ok=True)
    (work_root / "logs").mkdir(parents=True, exist_ok=True)
    ensure_image(args)
    image_id = docker(args, ["image", "inspect", "--format", "{{.Id}}", args.image]).stdout.decode().strip()

    container = f"dfhis-ui-{work_item.lower()}-{uuid.uuid4().hex[:8]}"
    started = int(time.time() * 1000)
    with tempfile.TemporaryDirectory(prefix="dfhis-ui-env-") as directory:
        env_file = Path(directory) / "test.env"
        exported = write_env_file(env_file, args, work_item)
        if args.backend == "remote":
            output, exit_code = run_remote(args, root, work_root, script_relative, env_file, container)
        else:
            output, exit_code = run_local(args, root, script_relative, env_file, container)
    (work_root / "logs" / "browser-test.log").write_bytes(output)
    sys.stdout.buffer.write(output)
    manifest = {
        "schemaVersion": 1,
        "workItemId": work_item,
        "backend": args.backend,
        "remote": args.remote if args.backend == "remote" else None,
        "image": args.image,
        "imageId": image_id,
        "baseUrl": args.base_url,
        "script": str(script_relative),
        "container": container,
        "exportedEnvironmentNames": exported,
        "allowMutations": args.allow_mutations,
        "startedAt": started,
        "completedAt": int(time.time() * 1000),
        "exitCode": exit_code,
        "result": "passed" if exit_code == 0 else "failed",
    }
    (work_root / "reports" / "sandbox-run.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return exit_code


def common_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--backend", choices=("remote", "local"), default=os.getenv("DFHIS_UI_SANDBOX_BACKEND", "remote"))
    parser.add_argument("--remote", default=os.getenv("DFHIS_UI_SANDBOX_REMOTE", DEFAULT_REMOTE))
    parser.add_argument("--image", default=os.getenv("DFHIS_UI_SANDBOX_IMAGE", DEFAULT_IMAGE))
    parser.add_argument("--base-url", default=os.getenv("DFHIS_BASE_URL", DEFAULT_BASE_URL))
    return parser


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run DFHIS Playwright tests inside an isolated Docker container")
    subparsers = parser.add_subparsers(dest="action", required=True)
    common = common_parser()
    subparsers.add_parser("doctor", parents=[common])
    subparsers.add_parser("setup", parents=[common])
    run = subparsers.add_parser("run", parents=[common])
    run.add_argument("work_item")
    run.add_argument("script", type=Path)
    run.add_argument("--root", type=Path, required=True)
    run.add_argument("--cpus", type=float, default=4)
    run.add_argument("--memory", default="6g")
    run.add_argument("--allow-mutations", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.action == "doctor":
        print(json.dumps(doctor(args), indent=2))
        return 0
    if args.action == "setup":
        built = ensure_image(args)
        print(json.dumps({**doctor(args), "built": built, "probe": probe(args)}, indent=2))
        return 0
    return run_test(args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CommandFailed as error:
        print(f"sandbox error: {error}", file=sys.stderr)
        raise SystemExit(2)
