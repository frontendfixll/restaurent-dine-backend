import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm 24h format');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use #RRGGBB');
const email = z.string().email();
const gstin = z
  .string()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN');

export const openingHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  open: time,
  close: time,
  isClosed: z.boolean(),
});

const brandSchema = z
  .object({
    name: z.string().min(1).max(120),
    brandColor: hexColor,
    contactPhone: z.string().min(7).max(20),
    contactEmail: email,
    address: z.string().max(300),
    location: z
      .object({
        city: z.string().max(80),
        state: z.string().max(80),
        country: z.string().max(80),
        postalCode: z.string().max(20),
        lat: z.number(),
        lng: z.number(),
      })
      .partial(),
    openingHours: z.array(openingHourSchema).length(7),
  })
  .partial();

const taxSchema = z
  .object({
    gstin,
    taxes: z.array(
      z.object({
        name: z.string().min(1).max(40),
        rate: z.number().min(0).max(100),
        type: z.enum(['cgst', 'sgst', 'igst', 'service', 'other']),
        applyOn: z.enum(['subtotal', 'item']),
      }),
    ),
    serviceChargePercent: z.number().min(0).max(100),
    roundingRule: z.enum(['nearest_rupee', 'nearest_50_paise', 'none']),
    taxInclusive: z.boolean(),
  })
  .partial();

const receiptSchema = z
  .object({
    headerLines: z.array(z.string().max(120)).max(10),
    footerLines: z.array(z.string().max(120)).max(10),
    fssaiLicense: z.string().max(40),
    returnPolicy: z.string().max(500),
    showLogo: z.boolean(),
    showGstin: z.boolean(),
  })
  .partial();

const paymentMethodsSchema = z
  .object({
    cash: z.boolean(),
    upi: z.boolean(),
    card: z.boolean(),
    wallet: z.boolean(),
    onlinePrepay: z.boolean(),
  })
  .partial();

const operatingModesSchema = z
  .object({
    dineIn: z.boolean(),
    takeaway: z.boolean(),
    onlinePrepay: z.boolean(),
  })
  .partial();

const languagesSchema = z
  .object({
    primary: z.string().min(2).max(8),
    supported: z.array(z.string().min(2).max(8)).max(10),
  })
  .partial();

const gatewaySchema = z
  .object({
    provider: z.enum(['razorpay', 'phonepe', 'stripe']),
  })
  .partial();

export const updateRestaurantSchema = z
  .object({
    brand: brandSchema,
    tax: taxSchema,
    receipt: receiptSchema,
    paymentMethods: paymentMethodsSchema,
    operatingModes: operatingModesSchema,
    currency: z.string().length(3).toUpperCase(),
    timeZone: z.string().min(3).max(60),
    languages: languagesSchema,
    gateway: gatewaySchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
