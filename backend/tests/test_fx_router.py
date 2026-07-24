from unittest.mock import patch


def test_get_usd_thb_rate_returns_fetched_rate(client):
    with patch("app.routers.fx.get_usd_to_thb_rate", return_value=36.5) as mock_get_rate:
        response = client.get("/fx/usd-thb")

    assert response.status_code == 200
    assert response.json() == {"usd_thb_rate": 36.5}
    mock_get_rate.assert_called_once_with()


def test_get_usd_thb_rate_returns_null_when_unavailable(client):
    with patch("app.routers.fx.get_usd_to_thb_rate", return_value=None):
        response = client.get("/fx/usd-thb")

    assert response.status_code == 200
    assert response.json() == {"usd_thb_rate": None}
