import { Schema, model, Document, Types } from 'mongoose';

export type OrderChannel = 'dine_in' | 'window' | 'assisted';
export type OrderStatus =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'settled'
  | 'cancelled';
export type OrderItemStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';
export type GuestRequestType = 'call_waiter' | 'water' | 'bill' | 'other';

export interface OrderItemModifier {
  groupId: Types.ObjectId;
  groupName: string;
  modifierId: Types.ObjectId;
  modifierName: string;
  priceDelta: number;
}

export interface OrderItem {
  _id: Types.ObjectId;
  itemId?: Types.ObjectId;
  comboId?: Types.ObjectId;
  variantId?: Types.ObjectId;
  name: string;
  variantName?: string;
  qty: number;
  basePrice: number;
  modifiers: OrderItemModifier[];
  notes?: string;
  station?: string;
  lineTotal: number;
  status: OrderItemStatus;
  acceptedAt?: Date;
  preparingAt?: Date;
  readyAt?: Date;
  servedAt?: Date;
  voidReason?: string;
  voidedById?: Types.ObjectId;
}

export interface OrderTimelineEntry {
  _id: Types.ObjectId;
  status: OrderStatus | 'modified' | 'item_voided' | 'item_added';
  at: Date;
  byUserId?: Types.ObjectId;
  byName?: string;
  note?: string;
}

export interface GuestRequest {
  _id: Types.ObjectId;
  type: GuestRequestType;
  message?: string;
  at: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedById?: Types.ObjectId;
}

export interface OrderTotals {
  subtotal: number;
  modifierTotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  taxBreakup: Array<{ name: string; type: string; rate: number; amount: number }>;
  roundOff: number;
  grand: number;
}

export interface OrderDocument extends Document {
  _id: Types.ObjectId;
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;

  tableId?: Types.ObjectId;
  tableSessionId?: Types.ObjectId;

  windowToken?: string;
  guestPhone?: string;
  guestName?: string;
  pickupAt?: Date;
  pickedUpAt?: Date;

  qrCodeId?: Types.ObjectId;
  customerId?: Types.ObjectId;

  waiterId?: Types.ObjectId;
  acceptedById?: Types.ObjectId;

  items: OrderItem[];
  totals: OrderTotals;
  estimatedPrepMinutes: number;

  paymentStatus: PaymentStatus;
  couponCode?: string;

  timeline: OrderTimelineEntry[];
  guestRequests: GuestRequest[];
  guestNotes?: string;
  staffNotes?: string;

  createdAt: Date;
  updatedAt: Date;
}

const OrderItemModifierSchema = new Schema<OrderItemModifier>(
  {
    groupId: { type: Schema.Types.ObjectId, required: true },
    groupName: { type: String, required: true },
    modifierId: { type: Schema.Types.ObjectId, required: true },
    modifierName: { type: String, required: true },
    priceDelta: { type: Number, default: 0 },
  },
  { _id: false },
);

const OrderItemSchema = new Schema<OrderItem>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'Item' },
    comboId: { type: Schema.Types.ObjectId, ref: 'Combo' },
    variantId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true },
    variantName: String,
    qty: { type: Number, required: true, min: 1 },
    basePrice: { type: Number, required: true, min: 0 },
    modifiers: { type: [OrderItemModifierSchema], default: [] },
    notes: String,
    station: { type: String, index: true },
    lineTotal: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'preparing', 'ready', 'served', 'cancelled'],
      default: 'pending',
    },
    acceptedAt: Date,
    preparingAt: Date,
    readyAt: Date,
    servedAt: Date,
    voidReason: String,
    voidedById: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true },
);

const TimelineSchema = new Schema<OrderTimelineEntry>(
  {
    status: { type: String, required: true },
    at: { type: Date, default: () => new Date() },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    note: String,
  },
  { _id: true },
);

const GuestRequestSchema = new Schema<GuestRequest>(
  {
    type: { type: String, enum: ['call_waiter', 'water', 'bill', 'other'], required: true },
    message: String,
    at: { type: Date, default: () => new Date() },
    resolved: { type: Boolean, default: false },
    resolvedAt: Date,
    resolvedById: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true },
);

const TotalsSchema = new Schema<OrderTotals>(
  {
    subtotal: { type: Number, default: 0 },
    modifierTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    serviceCharge: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    taxBreakup: {
      type: [
        new Schema(
          {
            name: String,
            type: String,
            rate: Number,
            amount: Number,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    roundOff: { type: Number, default: 0 },
    grand: { type: Number, default: 0 },
  },
  { _id: false },
);

const OrderSchema = new Schema<OrderDocument>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    channel: { type: String, enum: ['dine_in', 'window', 'assisted'], required: true, index: true },
    status: {
      type: String,
      enum: ['placed', 'accepted', 'preparing', 'ready', 'served', 'settled', 'cancelled'],
      default: 'placed',
      index: true,
    },

    tableId: { type: Schema.Types.ObjectId, ref: 'Table', index: true },
    tableSessionId: { type: Schema.Types.ObjectId, ref: 'TableSession', index: true },

    windowToken: { type: String, index: true },
    guestPhone: { type: String, index: true },
    guestName: String,
    pickupAt: Date,
    pickedUpAt: Date,

    qrCodeId: { type: Schema.Types.ObjectId, ref: 'QrCode' },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },

    waiterId: { type: Schema.Types.ObjectId, ref: 'User' },
    acceptedById: { type: Schema.Types.ObjectId, ref: 'User' },

    items: { type: [OrderItemSchema], default: [] },
    totals: { type: TotalsSchema, default: () => ({}) },
    estimatedPrepMinutes: { type: Number, default: 0 },

    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partial', 'paid', 'refunded'],
      default: 'unpaid',
      index: true,
    },
    couponCode: String,

    timeline: { type: [TimelineSchema], default: [] },
    guestRequests: { type: [GuestRequestSchema], default: [] },
    guestNotes: String,
    staffNotes: String,
  },
  { timestamps: true },
);

OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ channel: 1, status: 1, createdAt: -1 });
OrderSchema.index({ tableId: 1, status: 1 });

export const OrderModel = model<OrderDocument>('Order', OrderSchema);
