"""Secure Google Earth Engine authentication and health check service.

Reads GEE_SERVICE_ACCOUNT_JSON and GEE_PROJECT_ID exclusively from server-side
environment variables. Never logs or returns raw credentials, private keys,
or service account emails.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("sylvasense.gee")

_init_lock = threading.Lock()
_initialized_fingerprint: Optional[str] = None


class GeeAuthConfigError(Exception):
    """Raised when server-side GEE configuration is missing or malformed."""


def _decode_service_account_json(raw_value: str) -> Dict[str, Any]:
    """Parse raw JSON or base64-encoded JSON without exposing content on error."""
    cleaned = raw_value.strip()
    if not cleaned:
        raise GeeAuthConfigError("GEE_SERVICE_ACCOUNT_JSON is empty.")

    candidates = [cleaned]
    if not cleaned.startswith("{"):
        try:
            decoded = base64.b64decode(cleaned, validate=True).decode("utf-8")
            candidates.append(decoded.strip())
        except Exception:
            pass

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            continue

    raise GeeAuthConfigError(
        "GEE_SERVICE_ACCOUNT_JSON is malformed and could not be parsed as valid JSON."
    )


def _load_gee_credentials() -> Tuple[str, str, str]:
    """Load and validate service account fields from server environment.

    Returns (client_email, key_json_string, project_id).
    """
    raw_json = os.environ.get("GEE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw_json:
        raise GeeAuthConfigError("GEE_SERVICE_ACCOUNT_JSON is not configured.")

    parsed = _decode_service_account_json(raw_json)

    client_email = str(parsed.get("client_email", "")).strip()
    private_key = str(parsed.get("private_key", "")).strip()
    if not client_email or not private_key:
        raise GeeAuthConfigError(
            "GEE_SERVICE_ACCOUNT_JSON is missing required service account fields."
        )

    project_id = os.environ.get("GEE_PROJECT_ID", "").strip() or str(
        parsed.get("project_id", "")
    ).strip()
    if not project_id:
        raise GeeAuthConfigError(
            "GEE_PROJECT_ID is not configured and no project_id was found in service account JSON."
        )

    # Re-serialize normalized JSON string for ee.ServiceAccountCredentials
    return client_email, json.dumps(parsed), project_id


def initialize_earth_engine(force_reinit: bool = False) -> Tuple[bool, str]:
    """Safely initialize the Earth Engine Python API with service account credentials.

    Returns (initialized_ok, project_id). Raises GeeAuthConfigError or RuntimeError
    with sanitized messages on failure.
    """
    global _initialized_fingerprint

    client_email, key_data, project_id = _load_gee_credentials()
    fingerprint = f"{project_id}:{len(key_data)}"

    with _init_lock:
        if not force_reinit and _initialized_fingerprint == fingerprint:
            return True, project_id

        try:
            import ee  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "earthengine-api Python package is not installed in this environment."
            ) from exc

        try:
            credentials = ee.ServiceAccountCredentials(
                email=client_email,
                key_data=key_data,
            )
            ee.Initialize(credentials=credentials, project=project_id)
            _initialized_fingerprint = fingerprint
            logger.info(
                "Google Earth Engine Python API initialized (project_configured=True)."
            )
            return True, project_id
        except Exception as exc:
            _initialized_fingerprint = None
            logger.warning(
                "Google Earth Engine initialization failed (%s).",
                type(exc).__name__,
            )
            raise RuntimeError(
                f"Earth Engine initialization failed ({type(exc).__name__}). "
                "Verify service account permissions and project registration."
            ) from None


def check_gee_health() -> Dict[str, Any]:
    """Test Earth Engine authentication and return a sanitized connection status."""
    started = time.monotonic()
    raw_json_set = bool(os.environ.get("GEE_SERVICE_ACCOUNT_JSON", "").strip())
    project_env_set = bool(os.environ.get("GEE_PROJECT_ID", "").strip())

    if not raw_json_set:
        return {
            "ok": False,
            "state": "Disconnected",
            "demoMode": True,
            "fallbackActive": True,
            "configured": False,
            "projectIdConfigured": project_env_set,
            "message": "Google Earth Engine credentials are not configured. Preserving Demo mode with local geospatial fallback pipeline.",
            "latencyMs": int((time.monotonic() - started) * 1000),
        }

    try:
        _, project_id = initialize_earth_engine()
        import ee  # type: ignore

        # Lightweight server-side authenticated computation probe
        probe = ee.Number(1).add(1).getInfo()
        if probe != 2:
            raise RuntimeError("Unexpected Earth Engine health probe result.")

        return {
            "ok": True,
            "state": "Live",
            "demoMode": False,
            "fallbackActive": False,
            "configured": True,
            "projectIdConfigured": True,
            "projectId": project_id,
            "message": "Google Earth Engine Python API authenticated and operational.",
            "latencyMs": int((time.monotonic() - started) * 1000),
        }
    except GeeAuthConfigError as exc:
        logger.warning("GEE configuration check incomplete: %s", str(exc))
        return {
            "ok": False,
            "state": "Disconnected" if not raw_json_set else "Error",
            "demoMode": True,
            "fallbackActive": True,
            "configured": False,
            "projectIdConfigured": project_env_set,
            "message": f"{str(exc)} Fallback geospatial pipeline remains active in Demo mode.",
            "latencyMs": int((time.monotonic() - started) * 1000),
        }
    except Exception as exc:
        logger.warning("GEE health probe failed (%s).", type(exc).__name__)
        return {
            "ok": False,
            "state": "Error",
            "demoMode": True,
            "fallbackActive": True,
            "configured": True,
            "projectIdConfigured": project_env_set,
            "message": f"{str(exc)} Preserving Demo mode via fallback geospatial pipeline.",
            "latencyMs": int((time.monotonic() - started) * 1000),
        }
