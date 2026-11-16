"""배치 분석 job API — 폴더(서버 경로 또는 업로드) → particle_core.pipeline.run_batch."""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from particle_core.params import AnalysisParams  # noqa: E402
from particle_core.io_utils import IMAGE_EXTS, list_images  # noqa: E402
from particle_core.pipeline import BatchInput, run_batch  # noqa: E402

from ..jobs import Job, registry  # noqa: E402
from ..engines_ai import build_engine  # noqa: E402
from .tuner import parse_params  # noqa: E402

router = APIRouter(prefix="/api/batch", tags=["batch"])

# 결과 폴더. 앱 번들(.app)로 실행할 때는 번들 안에 쓸 수 없으므로 런처가 PLAB_DATA_DIR 로 바깥 폴더를 정해 준다.
RUNS_DIR = (Path(os.environ["PLAB_DATA_DIR"]).expanduser() if os.environ.get("PLAB_DATA_DIR") else PROJECT_ROOT) / "runs"


def _safe_name(s: str) -> str:
    s = re.sub(r"[^\w\-가-힣. ]+", "_", s).strip().strip(".")
    return s[:60] or "job"


def _make_job_fn(images: list[Path], output_dir: Path, params: AnalysisParams):
    def fn(job: Job):
        engine = build_engine(params)
        job.set_progress(1, f"엔진 준비: {params.engine}")
        engine.prepare()
        inp = BatchInput(images=images, output_dir=output_dir)
        result = run_batch(
            inp, params, engine,
            progress_cb=lambda pct, msg: job.set_progress(pct, msg),
            cancel_check=job.cancel_requested,
        )
        return result
    return fn


@router.post("/jobs")
async def create_job(
    params: str = Form("{}"),
    input_mode: str = Form("server_path"),
    input_path: Optional[str] = Form(None),
    output_dir: Optional[str] = Form(None),
    job_name: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    include: Optional[str] = Form(None),
):
    p = parse_params(params)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    name = _safe_name(job_name) if job_name else f"{stamp}_{p.engine}"

    if output_dir and output_dir.strip():
        out = Path(output_dir).expanduser()
    else:
        out = RUNS_DIR / (f"{stamp}_{name}" if job_name else name)
    try:
        out.mkdir(parents=True, exist_ok=True)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"출력 폴더 생성 실패: {out} ({e})")

    images: list[Path]
    if input_mode == "upload":
        if not files:
            raise HTTPException(400, "업로드 모드인데 파일이 없습니다.")
        in_dir = out / "input"
        in_dir.mkdir(parents=True, exist_ok=True)
        # 같은 출력 폴더를 다시 쓸 때 이전 업로드가 섞이지 않게 비우고 시작
        for old in in_dir.iterdir():
            if old.is_file() and old.suffix.lower() in IMAGE_EXTS:
                old.unlink()
        # 결과 파일은 이름(확장자 제외)으로 구분되므로, 이름이 겹치면 _2, _3 … 을 붙여 덮어쓰기를 막는다
        used: set[str] = set()
        for f in files:
            src = Path(Path(f.filename or "image.png").name)
            if src.suffix.lower() not in IMAGE_EXTS:
                continue
            stem, n = src.stem, 1
            while stem.lower() in used:
                n += 1
                stem = f"{src.stem}_{n}"
            used.add(stem.lower())
            with open(in_dir / f"{stem}{src.suffix}", "wb") as w:
                shutil.copyfileobj(f.file, w)
        images = list_images(in_dir)
    else:
        if not input_path:
            raise HTTPException(400, "input_path 가 필요합니다.")
        src = Path(input_path).expanduser()
        if not src.is_dir():
            raise HTTPException(400, f"입력 폴더가 없습니다: {src}")
        images = list_images(src)

    if include and include.strip():
        try:
            keep = set(json.loads(include))
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"include JSON 파싱 실패: {e}")
        images = [im for im in images if im.name in keep]

    if not images:
        raise HTTPException(400, "분석할 이미지가 없습니다 (jpg/png/tif/bmp).")

    (out / "params.json").write_text(json.dumps(p.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")

    job = registry.submit(
        name=name, output_dir=str(out), n_images=len(images), params=p.to_dict(),
        fn=_make_job_fn(images, out, p),
    )
    return {"job_id": job.job_id, "output_dir": str(out), "n_images": len(images)}


@router.get("/jobs")
async def list_jobs():
    return [j.to_summary() for j in registry.list()]


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = registry.get(job_id)
    if job is None:
        raise HTTPException(404, "job 없음")
    return job.to_detail()


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    ok = registry.cancel(job_id)
    return {"ok": ok}


def _resolve_in_output(job: Job, relpath: str) -> Path:
    base = Path(job.output_dir).resolve()
    target = (base / relpath).resolve()
    if base != target and base not in target.parents:
        raise HTTPException(403, "출력 폴더 밖 접근 불가")
    if not target.is_file():
        raise HTTPException(404, f"파일 없음: {relpath}")
    return target


@router.get("/jobs/{job_id}/files/{relpath:path}")
async def get_job_file(job_id: str, relpath: str):
    job = registry.get(job_id)
    if job is None:
        raise HTTPException(404, "job 없음")
    target = _resolve_in_output(job, relpath)
    media = None
    ext = target.suffix.lower()
    if ext == ".xlsx":
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif ext == ".pptx":
        media = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    return FileResponse(str(target), media_type=media, filename=target.name if media else None)


@router.get("/jobs/{job_id}/zip")
def get_job_zip(job_id: str):
    job = registry.get(job_id)
    if job is None:
        raise HTTPException(404, "job 없음")
    base = Path(job.output_dir)
    if not base.is_dir():
        raise HTTPException(404, "출력 폴더 없음")

    # 임시 파일에 zip 을 완성한 뒤 보낸다. (쓰는 도중 버퍼를 비우며 흘려보내면 zip 이 깨진다 —
    # ZipFile 은 파일 안의 위치를 기억하므로 버퍼를 자르면 안 된다.) 이미지는 이미 JPEG 라 재압축하지 않는다.
    fd, tmp = tempfile.mkstemp(prefix="plab_zip_", suffix=".zip")
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(base):
                for fn in sorted(files):
                    fp = Path(root) / fn
                    rel = fp.relative_to(base)
                    if rel.parts and rel.parts[0] == "input":
                        continue
                    stored = fp.suffix.lower() in (".jpg", ".jpeg", ".png", ".xlsx", ".pptx", ".zip")
                    zf.write(fp, str(rel), compress_type=zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED)
    except Exception:
        os.unlink(tmp)
        raise

    fname = f"{_safe_name(job.name)}.zip"
    return FileResponse(tmp, media_type="application/zip", filename=fname,
                        background=BackgroundTask(os.unlink, tmp))
