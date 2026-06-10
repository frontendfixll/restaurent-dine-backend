import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '@config/index';
import { logger } from '@utils/logger';

let client: Razorpay | null = null;

function getClient(): Razorpay | null {
  if (!config.razorpay.enabled) return null;
  if (!client) {
    client = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return client;
}

export interface CreateOrderInput {
  amount: number; // in INR (we convert to paise)
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  mocked: boolean;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  upiQrUrl?: string;
  upiDeeplink?: string;
}

/**
 * Create a Razorpay order. Returns mock data when Razorpay is not configured,
 * so the billing flow can be tested end-to-end without real credentials.
 */
export async function createOrder(input: CreateOrderInput): Promise<RazorpayOrderResult> {
  const c = getClient();
  const amountPaise = Math.round(input.amount * 100);
  if (!c) {
    const mockId = `order_mock_${Date.now()}`;
    logger.warn({ amount: input.amount, receipt: input.receipt }, '[RAZORPAY:MOCK] Returning mock order');
    return {
      mocked: true,
      orderId: mockId,
      amount: amountPaise,
      currency: 'INR',
      status: 'created',
      upiDeeplink: `upi://pay?pa=mock@smartdine&pn=SmartDine&am=${input.amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(input.receipt)}`,
    };
  }
  const order = await c.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: input.receipt,
    notes: input.notes,
  });
  return {
    mocked: false,
    orderId: order.id,
    amount: typeof order.amount === 'string' ? Number(order.amount) : order.amount,
    currency: order.currency,
    status: order.status,
  };
}

export interface WebhookPayload {
  rawBody: Buffer | string;
  signature: string;
}

/**
 * Verify a Razorpay webhook HMAC signature.
 * Pass the raw request body — not the parsed JSON.
 */
export function verifyWebhookSignature({ rawBody, signature }: WebhookPayload): boolean {
  if (!config.razorpay.webhookSecret) return false;
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(body)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Verify the signature returned after a successful checkout (client-side).
 * Used if we ever do the embedded checkout flow.
 */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!config.razorpay.keySecret) return false;
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
