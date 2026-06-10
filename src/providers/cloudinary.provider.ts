import { v2 as cloudinary } from 'cloudinary';
import { config } from '@config/index';

let configured = false;

export function getCloudinary() {
  if (!config.cloudinary.enabled) return null;
  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

export async function uploadBuffer(
  buffer: Buffer,
  options: { folder: string; publicId?: string; resourceType?: 'image' | 'video' | 'raw' | 'auto' } = {
    folder: config.cloudinary.folder,
  },
): Promise<{ url: string; publicId: string }> {
  const c = getCloudinary();
  if (!c) throw new Error('Cloudinary not configured');
  return new Promise((resolve, reject) => {
    const stream = c.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.publicId,
        resource_type: options.resourceType ?? 'image',
        overwrite: true,
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'));
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

export async function deleteResource(publicId: string): Promise<void> {
  const c = getCloudinary();
  if (!c) return;
  await c.uploader.destroy(publicId);
}

export default getCloudinary;
