"""SylvaSense FastAPI backend service exposing secure GEE health diagnostics."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.services.gee_auth import (
    GeeAuthConfigError,
    check_gee_health,
    initialize_earth_engine,
)

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("sylvasense.fastapi")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Attempt optional startup initialization without failing boot in Demo mode
    if os.environ.get("GEE_SERVICE_ACCOUNT_JSON", "").strip():
        try:
            initialize_earth_engine()
        except (GeeAuthConfigError, RuntimeError) as exc:
            logger.warning("GEE startup skipped; Demo fallback active (%s).", str(exc))
    else:
        logger.info("GEE_SERVICE_ACCOUNT_JSON unset; starting in Demo fallback mode.")
    yield


app = FastAPI(
    title="SylvaSense Geospatial Backend",
    version="1.0.0",
    lifespan=lifespan,
)

allowed_origin = os.environ.get("APP_URL", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origin] if allowed_origin != "*" else ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def root_health():
    return {"ok": True, "service": "sylvasense-fastapi"}


@app.get("/api/gee/health")
def gee_health():
    """Tests Earth Engine authentication and returns sanitized status without credentials."""
    return check_gee_health()
