"""汇总各业务路由，并统一挂上 /api/v1。"""

from fastapi import APIRouter

from src.main.python.api.admin.admin_get import router as admin_router
from src.main.python.api.auth.auth_get import router as auth_get_router
from src.main.python.api.auth.auth_post import router as auth_post_router
from src.main.python.api.guest.guest_post import router as guest_router
from src.main.python.api.health.health_get import router as health_router
from src.main.python.api.poll.poll_get import router as poll_get_router
from src.main.python.api.poll.poll_patch import router as poll_patch_router
from src.main.python.api.poll.poll_post import router as poll_post_router
from src.main.python.api.poll_access.poll_access_post import router as poll_access_router
from src.main.python.api.result.result_get import router as result_router
from src.main.python.api.share.share_get import router as share_router
from src.main.python.api.vote.vote_get import router as vote_get_router
from src.main.python.api.vote.vote_post import router as vote_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health_router)
api_router.include_router(auth_get_router)
api_router.include_router(auth_post_router)
api_router.include_router(guest_router)
api_router.include_router(poll_get_router)
api_router.include_router(poll_post_router)
api_router.include_router(poll_patch_router)
api_router.include_router(poll_access_router)
api_router.include_router(vote_router)
api_router.include_router(vote_get_router)
api_router.include_router(result_router)
api_router.include_router(share_router)
api_router.include_router(admin_router)
