import io

import boto3
from botocore.config import Config

from app.config import settings


class StorageService:
    def __init__(
        self,
        *,
        endpoint_url: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        bucket_name: str | None = None,
        region: str | None = None,
        public_url: str | None = None,
        cdn_base_url: str | None = None,
    ):
        # Every param defaults to the main (local) settings — a second
        # instance (see prod_storage_service below) passes PROD_* values so
        # it's fully independent, never touching local config at all.
        endpoint_url = settings.S3_ENDPOINT_URL if endpoint_url is None else endpoint_url
        access_key = access_key or settings.S3_ACCESS_KEY
        secret_key = secret_key or settings.S3_SECRET_KEY
        bucket_name = bucket_name or settings.S3_BUCKET_NAME
        region = region or settings.S3_REGION
        public_url = settings.S3_PUBLIC_URL if public_url is None else public_url
        self._cdn_base_url = settings.CDN_BASE_URL if cdn_base_url is None else cdn_base_url
        self._public_url = public_url

        self._base_kwargs = {
            "aws_access_key_id": access_key,
            "aws_secret_access_key": secret_key,
            "region_name": region,
            "config": Config(signature_version="s3v4"),
        }
        kwargs = dict(self._base_kwargs)
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        self._endpoint_url = endpoint_url

        self._client = boto3.client("s3", **kwargs)
        self._bucket = bucket_name

        # Default public client (public_url), used when a request doesn't
        # supply a specific public_host. Presigned URL signatures include the
        # Host header, so a per-host client is required to match whatever host
        # the browser actually used (localhost vs a LAN IP vs a real domain).
        if public_url and public_url != endpoint_url:
            public_kwargs = {**kwargs, "endpoint_url": public_url}
            self._public_client = boto3.client("s3", **public_kwargs)
        else:
            self._public_client = self._client

        self._public_clients_by_host: dict[str, "boto3.client"] = {}
        self._minio_port = self._extract_port(endpoint_url) or "9000"

    @staticmethod
    def _extract_port(url: str | None) -> str | None:
        if not url or ":" not in url.rsplit("/", 1)[-1]:
            return None
        return url.rsplit(":", 1)[-1].rstrip("/")

    def _client_for_host(self, host: str):
        """Boto3 client whose endpoint host matches the browser's request host,
        so the resulting presigned URL is directly reachable from that browser
        (e.g. the phone hitting the backend over the LAN IP)."""
        client = self._public_clients_by_host.get(host)
        if client is None:
            kwargs = {**self._base_kwargs, "endpoint_url": f"http://{host}:{self._minio_port}"}
            client = boto3.client("s3", **kwargs)
            self._public_clients_by_host[host] = client
        return client

    def upload(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        cache_control: str = "public, max-age=31536000, immutable",
    ):
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            CacheControl=cache_control,
        )

    def upload_file(self, key: str, file_path: str, content_type: str = "application/octet-stream"):
        with open(file_path, "rb") as f:
            self.upload(key, f.read(), content_type)

    def download(self, key: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket, Key=key)
        return response["Body"].read()

    def download_to_file(self, key: str, file_path: str):
        data = self.download(key)
        with open(file_path, "wb") as f:
            f.write(data)

    def presigned_url(self, key: str, expires: int = 3600, public_host: str | None = None) -> str:
        """Presigned URL for browser access. Pass `public_host` (the hostname
        the requesting browser used, e.g. from `request.url.hostname`) so the
        URL works whether the app is opened via localhost or a LAN IP; falls
        back to the static S3_PUBLIC_URL setting when omitted.

        When CDN_BASE_URL is set (R2/production), the `public_host` LAN
        matching is meaningless (there's no per-host MinIO port to hit) —
        serve the stable public CDN URL instead, which is also cacheable
        unlike a presigned URL that's unique on every call."""
        if self._cdn_base_url:
            return self.public_url(key)
        client = self._client_for_host(public_host) if public_host else self._public_client
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires,
        )

    def internal_presigned_url(self, key: str, expires: int = 3600) -> str:
        """Presigned URL using internal Docker hostname (for service-to-service calls)."""
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires,
        )

    def delete(self, key: str):
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def public_url(self, key: str) -> str:
        """Stable, cacheable public URL for a key, for redirecting browsers to
        fetch bytes directly instead of proxying through the API. CDN_BASE_URL
        (R2/production) is already bucket-scoped (e.g. a pub-*.r2.dev domain
        serves bucket contents at the root), so the key alone is appended. The
        S3_PUBLIC_URL fallback (local MinIO) is the raw endpoint host, not
        bucket-scoped, so the bucket name must be included in the path too —
        omitting it previously produced a broken URL (MinIO read the first
        path segment of the key as the bucket name and 403'd)."""
        if self._cdn_base_url:
            return f"{self._cdn_base_url.rstrip('/')}/{key}"
        base = self._public_url or self._endpoint_url
        return f"{base.rstrip('/')}/{self._bucket}/{key}"


storage_service = StorageService()

# Second, fully independent instance for production R2 (over the public
# internet — no Tailscale needed for S3, unlike Postgres/Redis). Only
# constructed when PROD_S3_ENDPOINT_URL is set; used solely by the manual
# render-queue actions below when acting on a production-sourced job.
prod_storage_service = (
    StorageService(
        endpoint_url=settings.PROD_S3_ENDPOINT_URL,
        access_key=settings.PROD_S3_ACCESS_KEY,
        secret_key=settings.PROD_S3_SECRET_KEY,
        bucket_name=settings.PROD_S3_BUCKET_NAME,
        region=settings.PROD_S3_REGION,
        public_url=settings.PROD_S3_PUBLIC_URL,
        cdn_base_url=settings.PROD_CDN_BASE_URL,
    )
    if settings.PROD_S3_ENDPOINT_URL
    else None
)
