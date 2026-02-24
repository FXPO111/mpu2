from fastapi import APIRouter

from app.services.files import presign_upload

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/presign")
def presign(payload: dict):
    return {"data": presign_upload(payload.get("filename", "document.pdf"))}