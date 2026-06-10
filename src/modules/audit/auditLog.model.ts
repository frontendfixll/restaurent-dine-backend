import { Schema, model, Document, Types } from 'mongoose';

export interface AuditLogDocument extends Document {
  _id: Types.ObjectId;
  actorId?: Types.ObjectId;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  ip?: string;
  requestId?: string;
  at: Date;
}

const AuditLogSchema = new Schema<AuditLogDocument>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorEmail: { type: String },
    actorRole: { type: String },
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: String, index: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String },
    requestId: { type: String },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

AuditLogSchema.index({ entity: 1, entityId: 1, at: -1 });
AuditLogSchema.index({ actorId: 1, at: -1 });

export const AuditLogModel = model<AuditLogDocument>('AuditLog', AuditLogSchema);
