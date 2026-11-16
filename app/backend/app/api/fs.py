"""서버 폴더 탐색 · 썸네일 · 원본 — 분석 화면의 폴더 입력용 (로컬 실행 전제)."""
from __future__ import annotations

import os
import string
import sys
from pathlib import Path

import cv2
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

from particle_core.io_utils import IMAGE_EXTS, imread_unicode, natural_key, to_gray_u8

router = APIRouter(prefix="/api/fs", tags=["fs"])

@router.get("/drives")
async def drives() -> list[str]:
    if sys.platform.startswith("win"):
        out = []
        for letter in string.ascii_uppercase:
            d = f"{letter}:\\"
            if os.path.exists(d):
                out.append(d)
        return out
    if sys.platform == "darwin":
        # 홈 + /Volumes 아래 외장 드라이브. 부팅 디스크("Macintosh HD" → / 심볼릭 링크)는 제외.
        out = [str(Path.home())]
        try:
            with os.scandir("/Volumes") as it:
                for e in sorted(it, key=lambda e: e.name.lower()):
                    if e.name.startswith(".") or e.is_symlink():
                        continue
                    if e.is_dir(follow_symlinks=False):
                        out.append(e.path)
        except OSError:
            pass
        return out
    return ["/"]


@router.get("/list")
async def list_dir(path: str = Query("", description="폴더 절대경로. 비우면 홈"),
                   limit: int = Query(50, description="images 목록 최대 개수 (0 = 전체)")) -> dict:
    p = Path(path).expanduser() if path else Path.home()
    try:
        p = p.resolve()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"경로 해석 실패: {e}")
    if not p.exists():
        raise HTTPException(404, f"경로 없음: {p}")
    if not p.is_dir():
        p = p.parent

    dirs: list[dict] = []
    images: list[str] = []
    try:
        with os.scandir(p) as it:
            for e in it:
                try:
                    if e.is_dir(follow_symlinks=False):
                        if e.name.startswith((".", "$")):
                            continue
                        dirs.append({"name": e.name, "path": str(Path(p, e.name))})
                    elif e.is_file() and Path(e.name).suffix.lower() in IMAGE_EXTS:
                        images.append(e.name)
                except PermissionError:
                    continue
    except PermissionError:
        raise HTTPException(403, f"접근 권한 없음: {p}")

    dirs.sort(key=lambda d: d["name"].lower())
    images.sort(key=natural_key)
    parent = str(p.parent) if p.parent != p else None
    return {
        "path": str(p),
        "parent": parent,
        "dirs": dirs,
        "n_images": len(images),
        "images": images if limit <= 0 else images[:limit],
    }


@router.get("/thumb")
def thumb(path: str = Query(..., description="이미지 절대경로"), size: int = Query(160)) -> Response:
    """서버 이미지 썸네일 (JPEG). 통합 분석 화면의 이미지 목록용."""
    p = Path(path).expanduser()
    if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
        raise HTTPException(404, f"이미지 없음: {p}")
    img = imread_unicode(p)
    if img is None:
        raise HTTPException(400, f"이미지 디코딩 실패: {p.name}")
    g = to_gray_u8(img)
    h, w = g.shape[:2]
    s = max(16, min(int(size), 1024)) / max(h, w)
    if s < 1:
        g = cv2.resize(g, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", g, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if not ok:
        raise HTTPException(500, "썸네일 인코딩 실패")
    return Response(content=buf.tobytes(), media_type="image/jpeg",
                    headers={"Cache-Control": "max-age=300"})


@router.get("/file")
async def raw_file(path: str = Query(..., description="이미지 절대경로")):
    """서버 이미지 원본 (화면 간 이미지 넘기기용)."""
    p = Path(path).expanduser()
    if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
        raise HTTPException(404, f"이미지 없음: {p}")
    return FileResponse(str(p), filename=p.name)
