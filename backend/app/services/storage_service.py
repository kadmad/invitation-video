import io

import boto3
from botocore.config import Config

from app.config import settings


class StorageService:
    def __init__(self):
        kwargs = {
            "aws_access_key_id": settings.S3_ACCESS_KEY,
            "aws_secret_access_key": settings.S3_SECRET_KEY,
            "region_name": settings.S3_REGION,
            "config": Config(signature_version="s3v4"),
        }
        if settings.S3_ENDPOINT_URL:
            kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL

        self._client = boto3.client("s3", **kwargs)
        self._bucket = settings.S3_BUCKET_NAME

        # Separate client using public URL for browser-facing presigned URLs
        # (signature must match the host the browser will use)
        if settings.S3_PUBLIC_URL and settings.S3_PUBLIC_URL != settings.S3_ENDPOINT_URL:
            public_kwargs = {**kwargs, "endpoint_url": settings.S3_PUBLIC_URL}
            self._public_client = boto3.client("s3", **public_kwargs)
        else:
            self._public_client = self._client

    def upload(self, key: str, data: bytes, content_type: str = "application/octet-stream"):
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
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

    def presigned_url(self, key: str, expires: int = 3600) -> str:
        """Presigned URL using public endpoint (for browser access)."""
        return self._public_client.generate_presigned_url(
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


storage_service = StorageService()
