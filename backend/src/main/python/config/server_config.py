"""进程配置。值来自环境变量或仓库根目录 .env，不读取个人绝对路径。"""

from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# 本文件位于 backend/src/main/python/config/，上溯六级是仓库根目录。
_REPO_ROOT = Path(__file__).resolve().parents[5]


class Settings(BaseSettings):
    """应用运行配置。

    Attributes:
        database_url: 开发或当前进程使用的数据库连接串。
        test_database_url: 测试库连接串，必须与 database_url 不同。
        allowed_origins: 浏览器来源白名单。
        public_base_url: 对外访问本系统的基址。
        session_ttl_hours: 账户会话有效小时数。
        guest_ttl_days: 访客凭据有效天数。
        poll_access_ttl_minutes: 私密授权有效分钟数。
        cookie_secure: 是否为 Cookie 加上 Secure。
        anon_voter_hmac_key: 匿名防重复密钥。示例可留空；一旦填写至少 32 字节。
        poll_text_parse_enabled: 是否允许调用模型识别投票文字。默认关闭。
        openai_api_key: 模型服务密钥。只从环境读取，空则识别功能不可用。
        openai_base_url: 可选的模型服务地址。空则使用 SDK 默认地址。
        poll_text_parse_model: 支持 strict JSON Schema 的模型名。空则识别功能不可用。
        poll_text_parse_timeout_seconds: 一次识别的总时限，1 到 60 秒。
        poll_text_parse_thinking: 思考开关。空则不传；enabled 或 disabled。
        poll_text_parse_reasoning_effort: 思考强度。空则不传。
        poll_text_parse_stream: 是否要求模型流式返回。识别只消费一次完整 JSON。
        poll_text_parse_response_format: 模型输出格式，json_schema 或 json_object。
        demo_polls_enabled: 是否在启动时补齐固定示例，并向登录用户开放目录接口。
    """

    model_config = SettingsConfigDict(
        env_file=_REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
    )

    database_url: str = Field(alias="DATABASE_URL")
    test_database_url: str = Field(alias="TEST_DATABASE_URL")
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    public_base_url: str = "http://localhost:5173"
    session_ttl_hours: int = 8
    guest_ttl_days: int = 30
    poll_access_ttl_minutes: int = 60
    cookie_secure: bool = False
    anon_voter_hmac_key: str = ""
    identity_fingerprint_hmac_key: str = Field(default="", alias="IDENTITY_FINGERPRINT_HMAC_KEY")
    poll_text_parse_enabled: bool = False
    openai_api_key: str = ""
    openai_base_url: str = ""
    poll_text_parse_model: str = ""
    poll_text_parse_timeout_seconds: int = Field(default=20, ge=1, le=60)
    poll_text_parse_thinking: str = ""
    poll_text_parse_reasoning_effort: str = ""
    poll_text_parse_stream: bool = False
    poll_text_parse_response_format: str = "json_schema"
    demo_polls_enabled: bool = False

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        """把逗号分隔的来源字符串拆成列表。

        Args:
            value: 环境变量中的原始值。

        Returns:
            去空白后的来源列表，或其他类型的原值。
        """
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("anon_voter_hmac_key")
    @classmethod
    def check_hmac_key(cls, value: str) -> str:
        """检查匿名密钥长度。空值留给示例配置，非空则必须达到 32 字节。

        Args:
            value: 环境中的密钥字符串。

        Returns:
            通过检查的原字符串。

        Raises:
            ValueError: 密钥已填写但不足 32 字节。
        """
        if value == "":
            return value
        if len(value.encode("utf-8")) < 32:
            raise ValueError("ANON_VOTER_HMAC_KEY 至少需要 32 字节")
        return value

    @field_validator("identity_fingerprint_hmac_key")
    @classmethod
    def check_identity_fingerprint_hmac_key(cls, value: str) -> str:
        """检查选民身份指纹密钥。必填且至少 32 字节。

        Args:
            value: 环境中的密钥字符串。

        Returns:
            通过检查的原字符串。

        Raises:
            ValueError: 密钥为空或不足 32 字节。
        """
        if not value or len(value.encode("utf-8")) < 32:
            raise ValueError("IDENTITY_FINGERPRINT_HMAC_KEY 必填且至少需要 32 字节")
        return value

    @field_validator("poll_text_parse_thinking")
    @classmethod
    def check_thinking(cls, value: str) -> str:
        """检查思考开关。空值表示请求里不带这个字段。

        Args:
            value: 环境中的原始字符串。

        Returns:
            小写后的 enabled 或 disabled。空字符串保持为空。

        Raises:
            ValueError: 值不是允许的开关。
        """
        text = value.strip().lower()
        if text == "":
            return ""
        if text not in {"enabled", "disabled"}:
            raise ValueError("POLL_TEXT_PARSE_THINKING 只能是 enabled 或 disabled")
        return text

    @field_validator("poll_text_parse_reasoning_effort")
    @classmethod
    def check_reasoning_effort(cls, value: str) -> str:
        """检查思考强度。空值表示请求里不带这个字段。

        Args:
            value: 环境中的原始字符串。

        Returns:
            小写后的强度。空字符串保持为空。

        Raises:
            ValueError: 值不是模型服务接受的强度。
        """
        text = value.strip().lower()
        if text == "":
            return ""
        allowed = {"none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"}
        if text not in allowed:
            raise ValueError("POLL_TEXT_PARSE_REASONING_EFFORT 不是支持的强度")
        return text

    @field_validator("poll_text_parse_response_format")
    @classmethod
    def check_response_format(cls, value: str) -> str:
        """检查模型输出格式。

        Args:
            value: 环境中的原始字符串。

        Returns:
            json_schema 或 json_object。

        Raises:
            ValueError: 值不是这两种格式。
        """
        text = value.strip().lower()
        if text not in {"json_schema", "json_object"}:
            raise ValueError("POLL_TEXT_PARSE_RESPONSE_FORMAT 只能是 json_schema 或 json_object")
        return text

    @model_validator(mode="after")
    def validate_settings(self) -> "Settings":
        """拒绝开发库与测试库使用同一连接串，拒绝身份密钥与匿名密钥复用。

        Returns:
            当前配置对象。

        Raises:
            ValueError: 两个数据库连接串相同，或密钥复用。
        """
        if self.database_url == self.test_database_url:
            raise ValueError("TEST_DATABASE_URL 必须与 DATABASE_URL 不同")
        if (
            self.anon_voter_hmac_key
            and self.identity_fingerprint_hmac_key
            and self.identity_fingerprint_hmac_key == self.anon_voter_hmac_key
        ):
            raise ValueError("IDENTITY_FINGERPRINT_HMAC_KEY 不能与 ANON_VOTER_HMAC_KEY 相同")
        return self


def poll_text_parse_configured(settings: Settings) -> bool:
    """判断投票文字识别是否具备启动所需配置。

    缺少开关、密钥或模型名时只关闭该功能，不阻止投票服务启动。

    Args:
        settings: 当前进程配置。

    Returns:
        三项都具备时为 True。
    """
    return bool(
        settings.poll_text_parse_enabled
        and settings.openai_api_key.strip()
        and settings.poll_text_parse_model.strip()
    )


def get_settings() -> Settings:
    """从环境和仓库根目录 .env 读取配置。

    Returns:
        当前进程配置。
    """
    return Settings()
