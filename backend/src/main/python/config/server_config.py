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

    @model_validator(mode="after")
    def database_urls_differ(self) -> "Settings":
        """拒绝开发库与测试库使用同一连接串。

        Returns:
            当前配置对象。

        Raises:
            ValueError: 两个数据库连接串相同。
        """
        if self.database_url == self.test_database_url:
            raise ValueError("TEST_DATABASE_URL 必须与 DATABASE_URL 不同")
        return self


def get_settings() -> Settings:
    """从环境和仓库根目录 .env 读取配置。

    Returns:
        当前进程配置。
    """
    return Settings()
