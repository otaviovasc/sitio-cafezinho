import { Readable } from 'node:stream';
import { google } from 'googleapis';
import type { FileStorageProvider, UploadInput } from './file-storage.js';

export class GoogleDriveStorageProvider implements FileStorageProvider {
  readonly kind = 'GOOGLE_DRIVE' as const;
  private readonly drive;

  constructor(clientId: string, clientSecret: string, refreshToken: string, private readonly folderId: string) {
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async upload(input: UploadInput) {
    const response = await this.drive.files.create({
      requestBody: { name: input.filename, parents: [this.folderId] },
      media: { mimeType: input.mimeType, body: Readable.from(input.buffer) },
      fields: 'id,parents',
    });
    if (!response.data.id) throw new Error('O Google Drive não retornou o ID do arquivo.');
    return { fileId: response.data.id, folderId: this.folderId };
  }

  async open(fileId: string) {
    const response = await this.drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    return response.data as NodeJS.ReadableStream;
  }

  async delete(fileId: string) { await this.drive.files.delete({ fileId }); }
}
