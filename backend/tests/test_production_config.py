import pytest

from app.core.config import Settings


def test_production_rejects_default_secrets_and_wildcard_cors():
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(app_env="production", jwt_secret="change-me-before-production").validate_for_startup()
    with pytest.raises(ValueError, match="MODEL_CONFIG_SECRET"):
        Settings(app_env="production", jwt_secret="x" * 32, model_config_secret="").validate_for_startup()
    with pytest.raises(ValueError, match="MODEL_CONFIG_SECRET"):
        Settings(app_env="production", jwt_secret="x" * 32, model_config_secret="x" * 32).validate_for_startup()
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        Settings(
            app_env="production",
            jwt_secret="x" * 32,
            model_config_secret="y" * 32,
            cors_origins="*",
        ).validate_for_startup()


def test_production_accepts_explicit_secrets_and_origins():
    Settings(
        app_env="production",
        jwt_secret="x" * 32,
        model_config_secret="y" * 32,
        cors_origins="https://example.com",
    ).validate_for_startup()
