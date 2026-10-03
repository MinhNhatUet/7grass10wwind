import pytest


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_template_chat_removed(client):
    """Endpoint mẫu của template đã gỡ (D-63); hỏi đáp chỉ qua /conversations có xác thực."""
    assert (await client.post("/api/v1/chat", json={"message": "hi"})).status_code == 404
