import { Schema, model, Document, Types } from 'mongoose';

export type TaxType = 'cgst' | 'sgst' | 'igst' | 'service' | 'other';
export type ApplyOn = 'subtotal' | 'item';
export type RoundingRule = 'nearest_rupee' | 'nearest_50_paise' | 'none';
export type GatewayProvider = 'razorpay' | 'phonepe' | 'stripe';

export interface OpeningHour {
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  open: string; // "09:00"
  close: string; // "23:00"
  isClosed: boolean;
}

export interface RestaurantDocument extends Document {
  _id: Types.ObjectId;
  singleton: 'main';
  brand: {
    name: string;
    logoUrl?: string;
    logoPublicId?: string;
    brandColor?: string;
    contactPhone?: string;
    contactEmail?: string;
    address?: string;
    location?: {
      city?: string;
      state?: string;
      country: string;
      postalCode?: string;
      lat?: number;
      lng?: number;
    };
    openingHours: OpeningHour[];
  };
  tax: {
    gstin?: string;
    taxes: Array<{
      name: string;
      rate: number;
      type: TaxType;
      applyOn: ApplyOn;
    }>;
    serviceChargePercent: number;
    roundingRule: RoundingRule;
    taxInclusive: boolean;
  };
  currency: string;
  timeZone: string;
  languages: {
    primary: string;
    supported: string[];
  };
  receipt: {
    headerLines: string[];
    footerLines: string[];
    fssaiLicense?: string;
    returnPolicy?: string;
    showLogo: boolean;
    showGstin: boolean;
  };
  paymentMethods: {
    cash: boolean;
    upi: boolean;
    card: boolean;
    wallet: boolean;
    onlinePrepay: boolean;
  };
  operatingModes: {
    dineIn: boolean;
    takeaway: boolean;
    onlinePrepay: boolean;
  };
  gateway: {
    provider?: GatewayProvider;
  };
  createdAt: Date;
  updatedAt: Date;
}

const OpeningHourSchema = new Schema<OpeningHour>(
  {
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    open: { type: String, default: '09:00' },
    close: { type: String, default: '23:00' },
    isClosed: { type: Boolean, default: false },
  },
  { _id: false },
);

const RestaurantSchema = new Schema<RestaurantDocument>(
  {
    singleton: {
      type: String,
      enum: ['main'],
      default: 'main',
      required: true,
      unique: true,
      index: true,
    },
    brand: {
      name: { type: String, required: true, trim: true, default: 'SmartDine' },
      logoUrl: { type: String },
      logoPublicId: { type: String },
      brandColor: { type: String, default: '#FF5722' },
      contactPhone: { type: String, trim: true },
      contactEmail: { type: String, trim: true, lowercase: true },
      address: { type: String, trim: true },
      location: {
        city: String,
        state: String,
        country: { type: String, default: 'India' },
        postalCode: String,
        lat: Number,
        lng: Number,
      },
      openingHours: {
        type: [OpeningHourSchema],
        default: () =>
          Array.from({ length: 7 }, (_, i) => ({
            dayOfWeek: i,
            open: '09:00',
            close: '23:00',
            isClosed: false,
          })),
      },
    },
    tax: {
      gstin: { type: String, trim: true, uppercase: true },
      taxes: {
        type: [
          new Schema(
            {
              name: { type: String, required: true },
              rate: { type: Number, required: true, min: 0, max: 100 },
              type: { type: String, enum: ['cgst', 'sgst', 'igst', 'service', 'other'], required: true },
              applyOn: { type: String, enum: ['subtotal', 'item'], default: 'subtotal' },
            },
            { _id: false },
          ),
        ],
        default: [
          { name: 'CGST', rate: 2.5, type: 'cgst', applyOn: 'subtotal' },
          { name: 'SGST', rate: 2.5, type: 'sgst', applyOn: 'subtotal' },
        ],
      },
      serviceChargePercent: { type: Number, default: 0, min: 0, max: 100 },
      roundingRule: {
        type: String,
        enum: ['nearest_rupee', 'nearest_50_paise', 'none'],
        default: 'nearest_rupee',
      },
      taxInclusive: { type: Boolean, default: false },
    },
    currency: { type: String, default: 'INR', uppercase: true },
    timeZone: { type: String, default: 'Asia/Kolkata' },
    languages: {
      primary: { type: String, default: 'en' },
      supported: { type: [String], default: ['en'] },
    },
    receipt: {
      headerLines: { type: [String], default: [] },
      footerLines: { type: [String], default: ['Thank you! Visit again.'] },
      fssaiLicense: { type: String, trim: true },
      returnPolicy: { type: String },
      showLogo: { type: Boolean, default: true },
      showGstin: { type: Boolean, default: true },
    },
    paymentMethods: {
      cash: { type: Boolean, default: true },
      upi: { type: Boolean, default: true },
      card: { type: Boolean, default: true },
      wallet: { type: Boolean, default: false },
      onlinePrepay: { type: Boolean, default: false },
    },
    operatingModes: {
      dineIn: { type: Boolean, default: true },
      takeaway: { type: Boolean, default: true },
      onlinePrepay: { type: Boolean, default: false },
    },
    gateway: {
      provider: { type: String, enum: ['razorpay', 'phonepe', 'stripe'] },
    },
  },
  { timestamps: true, minimize: false },
);

export const RestaurantModel = model<RestaurantDocument>('Restaurant', RestaurantSchema);
