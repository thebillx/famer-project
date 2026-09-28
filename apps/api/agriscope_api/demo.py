"""Idempotent local demo data seeding.

This module is deliberately unavailable in production. Seeded satellite evidence is
synthetic, tagged with provider agriscope-demo, and never exposes a true-colour
preview as though it came from a real provider.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import select

from apps.api.agriscope_api.core.config import AppEnvironment, SettingsSnapshot
from apps.api.agriscope_api.core.security import PasswordHasher, Role
from apps.api.agriscope_api.db.models import Farm, Field, Membership, Organization, User
from apps.api.agriscope_api.repositories.base import TenantScope
from apps.api.agriscope_api.repositories.satellite import SatelliteRepository
from apps.api.agriscope_api.services.farms import FarmService
from apps.api.agriscope_api.services.satellite import OBSERVATION_ANALYSIS_VERSION
from packages.geospatial.agriscope_geospatial.field_geometry import geometry_fingerprint


DEMO_EMAIL = "demo@agriscope.local"
DEMO_PASSWORD = "DemoPass12345"
DEMO_DISPLAY_NAME = "ผู้ใช้สาธิต"
DEMO_ORGANIZATION_NAME = "AgriScope Demo"
DEMO_ORGANIZATION_SLUG = "agriscope-demo"
DEMO_FARM_NAME = "สวนสาธิตเชียงใหม่ · ข้อมูลจำลอง"
DEMO_PROVINCE = "เชียงใหม่"
DEMO_PROVIDER = "agriscope-demo"
DEMO_COLLECTION = "synthetic-demo-v1"
DEMO_SOURCE_LABEL = "ข้อมูลสาธิต"

REAL_DEMO_FARM_NAME = "พื้นที่สาธิตแม่เหียะ · Sentinel-2 จริง"
REAL_DEMO_FIELD_NAME = "หน้าต่างวิเคราะห์แม่เหียะ A · ไม่ใช่ขอบเขตกรรมสิทธิ์"
REAL_DEMO_REFERENCE_LABEL = "พื้นที่วิจัย/สาธิตการเกษตรแม่เหียะ มหาวิทยาลัยเชียงใหม่"
REAL_DEMO_REFERENCE_URL = "https://www.cmu.ac.th/th/faculty/agriculture/service"
REAL_DEMO_COORDINATE_REFERENCE = "18°45′56.66″N 98°55′40.13″E (published research-site coordinate)"
REAL_DEMO_PRIVACY_NOTE = "analysis window only; not a cadastral boundary or ownership claim"


MaskKind = Literal["all", "left", "right"]


@dataclass(frozen=True)
class DemoObservationSpec:
    acquired_at: datetime
    value: float
    mask: MaskKind = "all"


@dataclass(frozen=True)
class DemoFieldSpec:
    key: str
    name: str
    geometry: dict
    observations: tuple[DemoObservationSpec, ...]


@dataclass(frozen=True)
class DemoSeedResult:
    user_id: str
    organization_id: str
    farm_id: str
    field_ids: tuple[str, ...]


@dataclass(frozen=True)
class RealDemoTarget:
    user_id: UUID
    organization_id: UUID
    farm_id: UUID
    field_id: UUID


def _rectangle(west: float, south: float, east: float, north: float) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
            ]
        ],
    }


# Approx. 170 x 155 m analysis window around a published research-site coordinate.
# This is deliberately not copied from a title deed, parcel map, or ownership dataset.
REAL_DEMO_GEOMETRY = _rectangle(98.9270, 18.7650, 98.9286, 18.7664)


DEMO_FIELDS = (
    DemoFieldSpec(
        key="inspect",
        name="แปลงเหนือ · ควรตรวจ (สาธิต)",
        geometry=_rectangle(98.9801, 18.7901, 98.9811, 18.7911),
        observations=(
            DemoObservationSpec(datetime(2026, 9, 10, 3, tzinfo=UTC), 0.68),
            DemoObservationSpec(datetime(2026, 9, 20, 3, tzinfo=UTC), 0.42),
        ),
    ),
    DemoFieldSpec(
        key="measured",
        name="แปลงกลาง · มีผลเปรียบเทียบ (สาธิต)",
        geometry=_rectangle(98.9812, 18.7887, 98.9822, 18.7897),
        observations=(
            DemoObservationSpec(datetime(2026, 9, 10, 3, tzinfo=UTC), 0.47),
            DemoObservationSpec(datetime(2026, 9, 20, 3, tzinfo=UTC), 0.56),
        ),
    ),
    DemoFieldSpec(
        key="insufficient",
        name="แปลงใต้ · ข้อมูลยังไม่พอ (สาธิต)",
        geometry=_rectangle(98.9796, 18.7873, 98.9806, 18.7883),
        observations=(
            DemoObservationSpec(datetime(2026, 9, 10, 3, tzinfo=UTC), 0.52, "left"),
            DemoObservationSpec(datetime(2026, 9, 20, 3, tzinfo=UTC), 0.48, "right"),
        ),
    ),
    DemoFieldSpec(
        key="first",
        name="แปลงใหม่ · รอข้อมูล (สาธิต)",
        geometry=_rectangle(98.9820, 18.7914, 98.9830, 18.7924),
        observations=(
            DemoObservationSpec(datetime(2026, 9, 20, 3, tzinfo=UTC), 0.60),
        ),
    ),
)

REAL_DEMO_FIELD_SPEC = DemoFieldSpec(
    key="real-mae-hia",
    name=REAL_DEMO_FIELD_NAME,
    geometry=REAL_DEMO_GEOMETRY,
    observations=(),
)


def _demo_raster(
    geometry: dict,
    *,
    value: float,
    mask_kind: MaskKind,
) -> tuple[bytes, list[float], int, int, int, float]:
    import numpy as np
    from rasterio.io import MemoryFile
    from rasterio.transform import from_bounds

    width = 8
    height = 8
    ring = geometry["coordinates"][0]
    west = min(point[0] for point in ring)
    south = min(point[1] for point in ring)
    east = max(point[0] for point in ring)
    north = max(point[1] for point in ring)
    transform = from_bounds(west, south, east, north, width, height)

    values = np.full((height, width), value, dtype="float32")
    valid = np.ones((height, width), dtype="float32")
    if mask_kind == "left":
        valid[:, width // 2 :] = 0
    elif mask_kind == "right":
        valid[:, : width // 2] = 0

    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": 2,
        "dtype": "float32",
        "crs": "EPSG:4326",
        "transform": transform,
        "nodata": -9999.0,
    }
    with MemoryFile() as memory:
        with memory.open(**profile) as dataset:
            dataset.write(values, 1)
            dataset.write(valid, 2)
        raster_tiff = memory.read()

    valid_count = int((valid > 0.5).sum())
    sample_count = width * height
    return (
        raster_tiff,
        [west, south, east, north],
        width,
        height,
        valid_count,
        valid_count / sample_count,
    )


async def _ensure_identity(session) -> tuple[User, Organization]:
    hasher = PasswordHasher()

    user = (
        await session.execute(select(User).where(User.email == DEMO_EMAIL))
    ).scalar_one_or_none()
    if user is None:
        user = User(
            email=DEMO_EMAIL,
            password_hash=hasher.hash(DEMO_PASSWORD),
            display_name=DEMO_DISPLAY_NAME,
            status="active",
        )
        session.add(user)
        await session.flush()
    else:
        user.password_hash = hasher.hash(DEMO_PASSWORD)
        user.display_name = DEMO_DISPLAY_NAME
        user.status = "active"

    organization = (
        await session.execute(
            select(Organization).where(Organization.slug == DEMO_ORGANIZATION_SLUG)
        )
    ).scalar_one_or_none()
    if organization is None:
        organization = Organization(
            name=DEMO_ORGANIZATION_NAME,
            slug=DEMO_ORGANIZATION_SLUG,
            status="active",
            default_locale="th",
            default_timezone="Asia/Bangkok",
        )
        session.add(organization)
        await session.flush()
    else:
        organization.name = DEMO_ORGANIZATION_NAME
        organization.status = "active"

    membership = (
        await session.execute(
            select(Membership).where(
                Membership.organization_id == organization.id,
                Membership.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        membership = Membership(
            organization_id=organization.id,
            user_id=user.id,
            role=Role.ORGANIZATION_OWNER.value,
            status="active",
            joined_at=datetime.now(UTC),
        )
        session.add(membership)
    else:
        membership.role = Role.ORGANIZATION_OWNER.value
        membership.status = "active"
        if membership.joined_at is None:
            membership.joined_at = datetime.now(UTC)
    await session.flush()
    return user, organization


async def _ensure_farm(session, *, user: User, organization: Organization) -> Farm:
    farm = (
        await session.execute(
            select(Farm).where(
                Farm.organization_id == organization.id,
                Farm.name == DEMO_FARM_NAME,
            )
        )
    ).scalars().first()
    if farm is None:
        farm = Farm(
            organization_id=organization.id,
            owner_user_id=user.id,
            name=DEMO_FARM_NAME,
            province=DEMO_PROVINCE,
            status="active",
        )
        session.add(farm)
        await session.flush()
    else:
        farm.owner_user_id = user.id
        farm.province = DEMO_PROVINCE
        farm.status = "active"
    return farm


async def _ensure_field(session, *, user: User, farm: Farm, spec: DemoFieldSpec):
    service = FarmService(session)
    existing = (
        await session.execute(
            select(Field).where(
                Field.farm_id == farm.id,
                Field.name == spec.name,
                Field.status == "active",
            )
        )
    ).scalars().first()
    if existing is None:
        field = await service.create_field(
            user_id=user.id,
            farm_id=farm.id,
            name=spec.name,
            geometry=spec.geometry,
        )
    else:
        field = await service.update_field(
            user_id=user.id,
            field_id=existing.id,
            name=spec.name,
            geometry=spec.geometry,
        )
    if field is None:
        raise RuntimeError(f"demo field could not be created: {spec.key}")
    return field


async def ensure_real_demo_target(session, settings: SettingsSnapshot) -> RealDemoTarget:
    """Create or refresh the privacy-safe real-Sentinel demo analysis window."""

    if settings.app_env == AppEnvironment.PRODUCTION.value:
        raise RuntimeError("Real demo prefetch is forbidden when APP_ENV=production")

    user, organization = await _ensure_identity(session)
    farm = (
        await session.execute(
            select(Farm).where(
                Farm.organization_id == organization.id,
                Farm.name == REAL_DEMO_FARM_NAME,
            )
        )
    ).scalars().first()
    if farm is None:
        farm = Farm(
            organization_id=organization.id,
            owner_user_id=user.id,
            name=REAL_DEMO_FARM_NAME,
            province=DEMO_PROVINCE,
            status="active",
        )
        session.add(farm)
        await session.flush()
    else:
        farm.owner_user_id = user.id
        farm.province = DEMO_PROVINCE
        farm.status = "active"

    field = await _ensure_field(
        session,
        user=user,
        farm=farm,
        spec=REAL_DEMO_FIELD_SPEC,
    )
    await session.flush()
    return RealDemoTarget(
        user_id=user.id,
        organization_id=organization.id,
        farm_id=farm.id,
        field_id=field.id,
    )


async def seed_demo(session, settings: SettingsSnapshot) -> DemoSeedResult:
    """Seed or refresh the deterministic local demo dataset."""

    if settings.app_env == AppEnvironment.PRODUCTION.value:
        raise RuntimeError("Demo seeding is forbidden when APP_ENV=production")

    user, organization = await _ensure_identity(session)
    farm = await _ensure_farm(session, user=user, organization=organization)

    satellite = SatelliteRepository(
        session,
        TenantScope(
            organization_id=organization.id,
            user_id=user.id,
            role=Role.ORGANIZATION_OWNER.value,
        ),
    )

    field_ids: list[str] = []
    for spec in DEMO_FIELDS:
        field = await _ensure_field(session, user=user, farm=farm, spec=spec)
        field_ids.append(str(field.id))
        geometry_hash = geometry_fingerprint(field.geometry)

        for index, observation_spec in enumerate(spec.observations, start=1):
            item_id = (
                f"demo-{spec.key}-"
                f"{observation_spec.acquired_at.date().isoformat()}-{index}"
            )
            observation, _ = await satellite.insert_historical_observation(
                field_id=field.id,
                provider=DEMO_PROVIDER,
                collection=DEMO_COLLECTION,
                provider_item_id=item_id,
                acquired_at=observation_spec.acquired_at,
                cloud_cover_percent=10.0,
                discovered_at=datetime.now(UTC),
                geometry_hash=geometry_hash,
                provider_metadata={
                    "geometry_hash": geometry_hash,
                    "demo": True,
                    "demo_label": "ข้อมูลสาธิต ไม่ใช่ภาพดาวเทียมจริง",
                },
            )
            (
                raster_tiff,
                bounds,
                width,
                height,
                valid_count,
                valid_ratio,
            ) = _demo_raster(
                field.geometry,
                value=observation_spec.value,
                mask_kind=observation_spec.mask,
            )
            await satellite.upsert_analysis(
                observation=observation,
                algorithm_version=OBSERVATION_ANALYSIS_VERSION,
                geometry_hash=geometry_hash,
                ndvi_mean=observation_spec.value,
                ndvi_min=observation_spec.value,
                ndvi_max=observation_spec.value,
                ndvi_stddev=0.0,
                sample_count=width * height,
                valid_sample_count=valid_count,
                valid_pixel_ratio=valid_ratio,
                raster_tiff=raster_tiff,
                raster_crs="EPSG:4326",
                raster_bounds=bounds,
                raster_width=width,
                raster_height=height,
            )

    await session.flush()
    return DemoSeedResult(
        user_id=str(user.id),
        organization_id=str(organization.id),
        farm_id=str(farm.id),
        field_ids=tuple(field_ids),
    )
