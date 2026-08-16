import io

import boto3
from botocore.config import Config

from app.config import settings


class StorageService:
    def __init__(self):
        self._base_kwargs = {
            "aws_access_key_id": settings.S3_ACCESS_KEY,
            "aws_secret_access_key": settings.S3_SECRET_KEY,
            "region_name": settings.S3_REGION,
            "config": Config(signature_version="s3v4"),
        }
        kwargs = dict(self._base_kwargs)
        if settings.S3_ENDPOINT_URL:
            kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL

        self._client = boto3.client("s3", **kwargs)
        self._bucket = settings.S3_BUCKET_NAME

        # Default public client (S3_PUBLIC_URL env), used when a request doesn't
        # supply a specific public_host. Presigned URL signatures include the
        # Host header, so a per-host client is required to match whatever host
        # the browser actually used (localhost vs a LAN IP vs a real domain).
        if settings.S3_PUBLIC_URL and settings.S3_PUBLIC_URL != settings.S3_ENDPOINT_URL:
            public_kwargs = {**kwargs, "endpoint_url": settings.S3_PUBLIC_URL}
            self._public_client = boto3.client("s3", **public_kwargs)
        else:
            self._public_client = self._client

        self._public_clients_by_host: dict[str, "boto3.client"] = {}
        self._minio_port = self._extract_port(settings.S3_ENDPOINT_URL) or "9000"

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
        back to the static S3_PUBLIC_URL setting when omitted."""
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
        """Stable, cacheable public URL for a key (R2/CDN), for redirecting
        browsers to fetch bytes directly instead of proxying through the API."""
        base = settings.CDN_BASE_URL or settings.S3_PUBLIC_URL
        return f"{base.rstrip('/')}/{key}"


storage_service = StorageService()
