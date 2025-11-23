import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { logger } from '@rt/utils';

const region = process.env.AWS_REGION || 'eu-west-3';

export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({ region });
    this.bucket = process.env.S3_BUCKET_NAME || 'rt-technologie-documents';
  }

  async uploadFile(key: string, body: Buffer, contentType?: string) {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );

      return {
        url: `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`,
        key,
      };
    } catch (error) {
      logger.error('S3 upload error', { error, key });
      throw error;
    }
  }

  async getFile(key: string) {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      return response.Body;
    } catch (error) {
      logger.error('S3 get error', { error, key });
      throw error;
    }
  }
}

export class SESService {
  private client: SESClient;
  private from: string;

  constructor() {
    this.client = new SESClient({ region });
    this.from = process.env.SMTP_FROM || 'noreply@rt-technologie.com';
  }

  async sendEmail(to: string[], subject: string, body: string) {
    try {
      await this.client.send(
        new SendEmailCommand({
          Source: this.from,
          Destination: { ToAddresses: to },
          Message: {
            Subject: { Data: subject },
            Body: {
              Html: { Data: body },
            },
          },
        })
      );

      logger.info('Email sent', { to, subject });
    } catch (error) {
      logger.error('SES send error', { error, to });
      throw error;
    }
  }
}

export const s3Service = new S3Service();
export const sesService = new SESService();
