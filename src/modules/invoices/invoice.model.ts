import { Schema, model, Document, Types } from 'mongoose';

export type InvoiceStatus = 'final' | 'void';
export type PaymentStatusInvoice = 'unpaid' | 'partial' | 'paid' | 'refunded';
export type SplitMode = 'none' | 'equal' | 'item' | 'custom';

export interface InvoiceLineItem {
  orderItemId?: Types.ObjectId;
  name: string;
  variantName?: string;
  hsnCode?: string;
  qty: number;
  unitPrice: number;
  modifierTotal: number;
  lineSubtotal: number;
  taxBreakup: Array<{ name: string; type: string; rate: number; amount: number }>;
  lineTotal: number;
}

export interface InvoiceSplit {
  _id: Types.ObjectId;
  label: string;
  amount: number;
  orderItemIds: Types.ObjectId[];
  paidAmount: number;
  status: 'unpaid' | 'partial' | 'paid';
}

export interface InvoiceDocument extends Document {
  _id: Types.ObjectId;
  invoiceNumber: string;
  orderId: Types.ObjectId;
  orderNumberSnapshot: string;

  issueDate: Date;
  billedAt: Date;
  cashierId?: Types.ObjectId;
  cashierName?: string;

  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerGstin?: string;
  tableNumber?: string;
  channel: 'dine_in' | 'window' | 'assisted';

  restaurantSnapshot: {
    name: string;
    gstin?: string;
    fssai?: string;
    address?: string;
    contactPhone?: string;
    contactEmail?: string;
    brandColor?: string;
    logoUrl?: string;
    headerLines: string[];
    footerLines: string[];
  };

  lineItems: InvoiceLineItem[];

  subtotal: number;
  modifierTotal: number;
  discount: number;
  serviceCharge: number;
  taxBreakup: Array<{ name: string; type: string; rate: number; amount: number }>;
  tax: number;
  roundOff: number;
  grand: number;
  amountInWords: string;

  amountPaid: number;
  amountDue: number;
  paymentStatus: PaymentStatusInvoice;

  splitMode: SplitMode;
  splits: InvoiceSplit[];

  status: InvoiceStatus;
  voidReason?: string;
  voidedAt?: Date;
  voidedById?: Types.ObjectId;

  pdfUrl?: string;
  pdfPublicId?: string;

  promotions?: {
    discount?: { id: string; name: string; amount: number };
    coupon?: { id: string; code: string; amount: number };
    loyalty?: { pointsRedeemed: number; amount: number };
  };
  loyaltyPointsEarned?: number;

  createdAt: Date;
  updatedAt: Date;
}

const TaxLineSchema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    rate: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false },
);

const LineItemSchema = new Schema<InvoiceLineItem>(
  {
    orderItemId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true },
    variantName: String,
    hsnCode: String,
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    modifierTotal: { type: Number, default: 0 },
    lineSubtotal: { type: Number, required: true },
    taxBreakup: { type: [TaxLineSchema], default: [] },
    lineTotal: { type: Number, required: true },
  },
  { _id: false },
);

const SplitSchema = new Schema<InvoiceSplit>(
  {
    label: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    orderItemIds: [{ type: Schema.Types.ObjectId }],
    paidAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
  },
  { _id: true },
);

const InvoiceSchema = new Schema<InvoiceDocument>(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumberSnapshot: { type: String, required: true },

    issueDate: { type: Date, default: () => new Date() },
    billedAt: { type: Date, default: () => new Date() },
    cashierId: { type: Schema.Types.ObjectId, ref: 'User' },
    cashierName: String,

    customerName: String,
    customerPhone: String,
    customerEmail: String,
    customerGstin: String,
    tableNumber: String,
    channel: { type: String, enum: ['dine_in', 'window', 'assisted'], required: true },

    restaurantSnapshot: {
      name: { type: String, required: true },
      gstin: String,
      fssai: String,
      address: String,
      contactPhone: String,
      contactEmail: String,
      brandColor: String,
      logoUrl: String,
      headerLines: { type: [String], default: [] },
      footerLines: { type: [String], default: [] },
    },

    lineItems: { type: [LineItemSchema], default: [] },

    subtotal: { type: Number, required: true },
    modifierTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    serviceCharge: { type: Number, default: 0 },
    taxBreakup: { type: [TaxLineSchema], default: [] },
    tax: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    grand: { type: Number, required: true },
    amountInWords: String,

    amountPaid: { type: Number, default: 0 },
    amountDue: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partial', 'paid', 'refunded'],
      default: 'unpaid',
      index: true,
    },

    splitMode: { type: String, enum: ['none', 'equal', 'item', 'custom'], default: 'none' },
    splits: { type: [SplitSchema], default: [] },

    status: { type: String, enum: ['final', 'void'], default: 'final', index: true },
    voidReason: String,
    voidedAt: Date,
    voidedById: { type: Schema.Types.ObjectId, ref: 'User' },

    pdfUrl: String,
    pdfPublicId: String,

    promotions: { type: Schema.Types.Mixed },
    loyaltyPointsEarned: { type: Number, default: 0 },
  },
  { timestamps: true },
);

InvoiceSchema.index({ issueDate: -1 });
InvoiceSchema.index({ paymentStatus: 1, issueDate: -1 });
InvoiceSchema.index({ channel: 1, issueDate: -1 });

export const InvoiceModel = model<InvoiceDocument>('Invoice', InvoiceSchema);
