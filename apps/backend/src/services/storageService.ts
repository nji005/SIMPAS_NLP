import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { logger } from '../lib/logger';

export interface StorageUploadResult {
  filename: string;
  url: string;
  storageType: 'minio' | 'local';
}

class StorageService {
  private s3Client: S3Client | null = null;
  private bucketName: string = 'sipmas-uploads';
  private isConfigured: boolean = false;
  private bucketChecked: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKey = process.env.S3_ACCESS_KEY;
    const secretKey = process.env.S3_SECRET_KEY;
    this.bucketName = process.env.S3_BUCKET || 'sipmas-uploads';

    if (endpoint && accessKey && secretKey) {
      try {
        this.s3Client = new S3Client({
          endpoint,
          region: process.env.S3_REGION || 'us-east-1',
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
          },
          forcePathStyle: true, // Required for MinIO
        });
        this.isConfigured = true;
        logger.info({ endpoint, bucket: this.bucketName }, 'MinIO Object Storage initialized in backend');
      } catch (err) {
        logger.warn({ err }, 'Failed to initialize MinIO client, fallback to local storage');
        this.isConfigured = false;
      }
    } else {
      logger.info('MinIO credentials not provided. Using local disk storage (/public/uploads)');
      this.isConfigured = false;
    }
  }

  public isMinioEnabled(): boolean {
    return this.isConfigured && this.s3Client !== null;
  }

  private async ensureBucketExists(): Promise<void> {
    if (!this.s3Client || this.bucketChecked) return;

    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
      this.bucketChecked = true;
    } catch (headError: any) {
      if (headError.name === 'NotFound' || headError.$metadata?.httpStatusCode === 404) {
        try {
          await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucketName }));
          this.bucketChecked = true;
          logger.info({ bucket: this.bucketName }, 'Created MinIO bucket successfully');
        } catch (createError) {
          logger.warn({ err: createError }, 'Failed to auto-create MinIO bucket');
        }
      } else {
        // Permission or other error, mark checked to avoid endless retry
        this.bucketChecked = true;
      }
    }
  }

  /**
   * Upload file to MinIO if enabled, with automatic fallback to local disk storage.
   */
  public async upload(file: Express.Multer.File): Promise<StorageUploadResult> {
    const filename = file.filename;
    const localUrl = `/uploads/${filename}`;

    if (!this.isMinioEnabled() || !this.s3Client) {
      return {
        filename,
        url: localUrl,
        storageType: 'local',
      };
    }

    try {
      await this.ensureBucketExists();

      const fileStream = fs.createReadStream(file.path);
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: filename,
          Body: fileStream,
          ContentType: file.mimetype,
        })
      );

      logger.info({ filename, bucket: this.bucketName }, 'Foto laporan berhasil diunggah ke MinIO');

      return {
        filename,
        url: localUrl,
        storageType: 'minio',
      };
    } catch (error) {
      logger.warn(
        { err: error, filename },
        'Gagal mengunggah foto ke MinIO. Menggunakan penyimpanan file lokal sebagai fallback.'
      );
      return {
        filename,
        url: localUrl,
        storageType: 'local',
      };
    }
  }

  /**
   * Delete file from MinIO and local disk (best-effort)
   */
  public async delete(filename: string): Promise<void> {
    const localFilePath = path.join(process.cwd(), 'public/uploads', filename);
    if (fs.existsSync(localFilePath)) {
      try {
        await fs.promises.unlink(localFilePath);
      } catch (err) {
        logger.warn({ err, filename }, 'Gagal menghapus file lokal');
      }
    }

    if (this.isMinioEnabled() && this.s3Client) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: filename,
          })
        );
      } catch (err) {
        logger.warn({ err, filename }, 'Gagal menghapus file dari MinIO');
      }
    }
  }

  /**
   * Get file stream from MinIO if available
   */
  public async getObjectStream(filename: string): Promise<{ stream: Readable; contentType?: string } | null> {
    if (!this.isMinioEnabled() || !this.s3Client) {
      return null;
    }

    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: filename,
        })
      );

      if (response.Body && response.Body instanceof Readable) {
        return {
          stream: response.Body,
          contentType: response.ContentType,
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}

export const storageService = new StorageService();
