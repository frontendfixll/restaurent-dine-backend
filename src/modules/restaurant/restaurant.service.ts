import { RestaurantModel, RestaurantDocument } from './restaurant.model';
import { writeAuditLog } from '@modules/audit/audit.service';
import { deepMerge } from '@utils/deepMerge';
import { uploadBuffer, deleteResource } from '@providers/cloudinary.provider';
import { config } from '@config/index';
import { AppError } from '@utils/AppError';

export async function getOrCreateRestaurant(): Promise<RestaurantDocument> {
  let restaurant = await RestaurantModel.findOne({ singleton: 'main' });
  if (!restaurant) restaurant = await RestaurantModel.create({ singleton: 'main' });
  return restaurant;
}

export async function getRestaurant() {
  const r = await getOrCreateRestaurant();
  return r.toObject();
}

export async function updateRestaurant(
  partial: Record<string, unknown>,
  actorId?: string,
  actorEmail?: string,
  actorRole?: string,
) {
  const restaurant = await getOrCreateRestaurant();
  const before = restaurant.toObject();

  // Strip protected fields
  delete partial.singleton;
  delete partial._id;
  delete (partial as { id?: unknown }).id;
  delete partial.createdAt;
  delete partial.updatedAt;
  if (partial.brand && typeof partial.brand === 'object') {
    delete (partial.brand as Record<string, unknown>).logoUrl;
    delete (partial.brand as Record<string, unknown>).logoPublicId;
  }

  const merged = deepMerge(before as Record<string, unknown>, partial);
  restaurant.set(merged);
  await restaurant.save();

  await writeAuditLog({
    actorId,
    actorEmail,
    actorRole,
    action: 'restaurant.update',
    entity: 'Restaurant',
    entityId: String(restaurant._id),
    before,
    after: restaurant.toObject(),
  });

  return restaurant.toObject();
}

export async function uploadLogo(
  buffer: Buffer,
  filename: string,
  actorId?: string,
  actorEmail?: string,
  actorRole?: string,
) {
  if (!config.cloudinary.enabled) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Cloudinary not configured');
  }
  const restaurant = await getOrCreateRestaurant();
  const previousPublicId = restaurant.brand.logoPublicId;

  const { url, publicId } = await uploadBuffer(buffer, {
    folder: `${config.cloudinary.folder}/restaurant`,
    publicId: `logo-${Date.now()}`,
  });

  restaurant.brand.logoUrl = url;
  restaurant.brand.logoPublicId = publicId;
  await restaurant.save();

  if (previousPublicId && previousPublicId !== publicId) {
    deleteResource(previousPublicId).catch(() => undefined);
  }

  await writeAuditLog({
    actorId,
    actorEmail,
    actorRole,
    action: 'restaurant.logo.upload',
    entity: 'Restaurant',
    entityId: String(restaurant._id),
    metadata: { filename, publicId },
  });

  return { logoUrl: url, logoPublicId: publicId };
}
