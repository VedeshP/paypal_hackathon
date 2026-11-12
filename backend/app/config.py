from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    # App
    public_base_url: str = "http://localhost:8000"
    mandate_signing_secret: str = "dev-only-change-me"
    db_path: str = "data/mandate.db"

    # PayPal (sandbox)
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_base_url: str = "https://api-m.sandbox.paypal.com"
    paypal_login_enabled: bool = True
    paypal_login_mode: str = "verify"  # "verify" = $1 never-captured order approval; "oidc" = Log in with PayPal
    auth_redirect_uri: str = ""  # optional override; must exactly match a registered Return URL  # requires "Log in with PayPal" enabled on the app + return URL registered
    demo_buyer_email: str = ""  # sandbox buyer shown on the login page so judges can approve holds
    demo_buyer_password: str = ""

    # LLMs (OpenAI-compatible endpoints)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-flash-lite"
    gemini_fallbacks: str = "gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3-flash-preview,gemini-3.5-flash"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    groq_judge_model: str = "openai/gpt-oss-20b"
    groq_rerank_model: str = "qwen/qwen3.8-27b"

    # Channel3
    channel3_api_key: str = ""
    channel3_base_url: str = "https://api.trychannel3.com"

    # Elastic
    elastic_url: str = ""
    elastic_api_key: str = ""
    elastic_index: str = "mandate-events"

    # KERNEL
    kernel_api_key: str = ""

    # Render Workflows (optional distributed Attack Lab)
    render_api_key: str = ""
    render_workflow_slug: str = ""

    # Zapier MCP (escalation notifications)
    zapier_mcp_url: str = "https://mcp.zapier.com/api/v1/connect"
    zapier_mcp_token: str = ""
    notify_email: str = ""

    # Standing mandates: how often the watcher re-checks (minutes)
    standing_interval_min: int = 10

    @property
    def paypal_enabled(self) -> bool:
        return bool(self.paypal_client_id and self.paypal_client_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
