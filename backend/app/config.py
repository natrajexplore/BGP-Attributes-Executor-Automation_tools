from __future__ import annotations

import os
from pathlib import Path

import yaml

BASE_DIR = Path(__file__).resolve().parent.parent          # /app
FRONTEND_DIR = Path(os.getenv("BGP_FRONTEND", BASE_DIR / "frontend"))
INVENTORY_PATH = Path(os.getenv("BGP_INVENTORY", BASE_DIR / "inventory.yaml"))
TEMPLATE_DIR = Path(os.getenv("BGP_TEMPLATES", BASE_DIR / "templates"))
SCENARIO_DIR = Path(os.getenv("BGP_SCENARIOS", BASE_DIR / "scenarios"))
BASELINE_DIR = Path(os.getenv("BGP_BASELINE", BASE_DIR / "baseline"))
RUNS_DIR = Path(os.getenv("BGP_RUNS", BASE_DIR / "runs"))
RUNS_DIR.mkdir(parents=True, exist_ok=True)


class Settings:
    eveng_url = os.getenv("BGP_EVENG_URL", "http://127.0.0.1")
    eveng_user = os.getenv("BGP_EVENG_USER", "admin")
    eveng_pass = os.getenv("BGP_EVENG_PASS", "eve")
    lab_path = os.getenv("BGP_LAB_PATH", "/bgp-attributes.unl")

    device_user = os.getenv("BGP_DEVICE_USER", "lab")
    device_pass = os.getenv("BGP_DEVICE_PASS", "lab123")
    device_secret = os.getenv("BGP_DEVICE_SECRET", os.getenv("BGP_DEVICE_PASS", "lab123"))
    console_fallback = os.getenv("BGP_CONSOLE_FALLBACK", "true").lower() == "true"

    # Kafka runs on Docker Desktop (Windows host); empty bootstrap disables publishing.
    kafka_bootstrap = os.getenv("BGP_KAFKA_BOOTSTRAP", "")
    topic_events = os.getenv("BGP_TOPIC_EVENTS", "bgp.neighbor.events")
    topic_snapshots = os.getenv("BGP_TOPIC_SNAPSHOTS", "bgp.neighbor.snapshots")
    topic_config = os.getenv("BGP_TOPIC_CONFIG", "bgp.config.changes")
    poll_interval = float(os.getenv("BGP_POLL_INTERVAL", "20"))
    monitor_enabled = os.getenv("BGP_MONITOR", "true").lower() == "true"
    grafana_url = os.getenv("BGP_GRAFANA_URL", "")

    conn_timeout = int(os.getenv("BGP_CONN_TIMEOUT", "15"))
    read_timeout = int(os.getenv("BGP_READ_TIMEOUT", "30"))


settings = Settings()


def load_inventory() -> dict:
    with open(INVENTORY_PATH) as fh:
        return yaml.safe_load(fh)
