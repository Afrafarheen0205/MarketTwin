import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.grouping import generate_demand_groups


@pytest.mark.anyio
async def test_legacy_admin_generation_endpoint_is_disabled():
    with pytest.raises(HTTPException) as exc_info:
        await generate_demand_groups(current_user={"id": "admin-1"})

    assert exc_info.value.status_code == 503
    assert "generation is disabled" in exc_info.value.detail
