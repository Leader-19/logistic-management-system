import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class SaasBillingService {
  constructor(private readonly prisma: PrismaService) { }

  async current(tenantId: string) {
    const [subscription, seatsInUse] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { tenantId }, include: { plan: { include: { features: true } } } }),
      this.prisma.tenantMembership.count({ where: { tenantId, status: { in: ["ACTIVE", "INVITED"] } } }),
    ]);
    const active = subscription && (subscription.status === SubscriptionStatus.ACTIVE || subscription.status === SubscriptionStatus.TRIALING);
    const seatLimit = active ? this.maxUsers(subscription.plan.features) : this.defaultSeatLimit();
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true }, include: { features: true }, orderBy: { sortOrder: "asc" },
    });
    return {
      subscription: subscription ? {
        id: subscription.id, status: subscription.status, billingCycle: subscription.billingCycle,
        currentPeriodStart: subscription.currentPeriodStart, currentPeriodEnd: subscription.currentPeriodEnd,
        plan: { id: subscription.plan.id, name: subscription.plan.name, monthlyPrice: subscription.plan.monthlyPrice.toString(), yearlyPrice: subscription.plan.yearlyPrice.toString() },
      } : null,
      seatsInUse,
      seatLimit,
      currency: (process.env.STRIPE_CURRENCY ?? "USD").toUpperCase(),
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      plans: plans.map(plan => ({ id: plan.id, name: plan.name, description: plan.description, monthlyPrice: plan.monthlyPrice.toString(), yearlyPrice: plan.yearlyPrice.toString(), maxUsers: this.maxUsers(plan.features) })),
    };
  }

  async createCheckout(tenantId: string, actorId: string, planId: string, billingCycle: "monthly" | "yearly") {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret || !process.env.STRIPE_WEBHOOK_SECRET) throw new ServiceUnavailableException("Online billing is not configured. Contact your platform administrator.");
    const [tenant, plan, seatCount, current] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, email: true, currency: true } }),
      this.prisma.plan.findFirst({ where: { id: planId, isActive: true }, include: { features: true } }),
      this.prisma.tenantMembership.count({ where: { tenantId, status: { in: ["ACTIVE", "INVITED"] } } }),
      this.prisma.subscription.findUnique({ where: { tenantId }, include: { plan: { include: { features: true } } } }),
    ]);
    if (!tenant || !plan) throw new BadRequestException("Choose an available subscription plan");
    if (current && current.status !== SubscriptionStatus.CANCELLED && current.status !== SubscriptionStatus.EXPIRED) {
      throw new ConflictException("A subscription already exists. Use Manage subscription to update it without creating a duplicate subscription.");
    }
    const newSeatLimit = this.maxUsers(plan.features);
    if (newSeatLimit < seatCount) throw new BadRequestException("The selected plan does not cover the users already in this workspace");
    const currentSeatLimit = current && (current.status === SubscriptionStatus.ACTIVE || current.status === SubscriptionStatus.TRIALING) ? this.maxUsers(current.plan.features) : this.defaultSeatLimit();
    if (newSeatLimit <= currentSeatLimit) throw new BadRequestException("Choose a plan with more user seats");

    const amount = (billingCycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice).mul(100).toDecimalPlaces(0).toNumber();
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BadRequestException("This plan has no online price configured for the selected billing cycle");
    const currency = (process.env.STRIPE_CURRENCY ?? tenant.currency ?? "USD").toLowerCase();
    const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
    const form = new URLSearchParams({
      mode: "subscription",
      customer_email: tenant.email ?? "",
      client_reference_id: tenant.id,
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][recurring][interval]": billingCycle === "monthly" ? "month" : "year",
      "line_items[0][price_data][product_data][name]": `${plan.name} workspace subscription`,
      "metadata[tenantId]": tenant.id,
      "metadata[planId]": plan.id,
      "metadata[billingCycle]": billingCycle,
      "subscription_data[metadata][tenantId]": tenant.id,
      "subscription_data[metadata][planId]": plan.id,
      "subscription_data[metadata][billingCycle]": billingCycle,
    });
    form.delete("customer_email");
    if (tenant.email) form.set("customer_email", tenant.email);
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form,
    });
    const session = await response.json() as { url?: string; error?: { message?: string } };
    if (!response.ok || !session.url) throw new ServiceUnavailableException(session.error?.message ?? "Stripe could not start checkout");
    await this.prisma.auditLog.create({ data: { tenantId, actorId, action: "subscription.checkout.started", targetType: "plan", targetId: plan.id, metadata: { billingCycle } } });
    return { checkoutUrl: session.url };
  }

  async createPortal(tenantId: string) {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new ServiceUnavailableException("Online billing is not configured. Contact your platform administrator.");
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { stripeCustomerId: true } });
    if (!subscription?.stripeCustomerId) throw new NotFoundException("No Stripe billing profile is linked to this workspace yet");
    const form = new URLSearchParams({ customer: subscription.stripeCustomerId, return_url: `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/billing` });
    const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form,
    });
    const session = await response.json() as { url?: string; error?: { message?: string } };
    if (!response.ok || !session.url) throw new ServiceUnavailableException(session.error?.message ?? "Stripe could not open subscription management");
    return { portalUrl: session.url };
  }

  async handleStripeWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !rawBody || !signature) throw new BadRequestException("Invalid Stripe webhook signature");
    const timestamp = signature.match(/(?:^|,)t=(\d+)/)?.[1];
    const signatures = [...signature.matchAll(/(?:^|,)v1=([a-f0-9]+)/g)].map(match => match[1]);
    if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new BadRequestException("Expired Stripe webhook signature");
    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest();
    const valid = signatures.some(value => {
      const received = Buffer.from(value, "hex");
      return received.length === expected.length && timingSafeEqual(received, expected);
    });
    if (!valid) throw new BadRequestException("Invalid Stripe webhook signature");

    let event: { id?: string; type?: string; data?: { object?: StripeSubscription } };
    try { event = JSON.parse(rawBody.toString("utf8")) as typeof event; }
    catch { throw new BadRequestException("Invalid Stripe event payload"); }
    if (!event.id || !event.type) throw new BadRequestException("Invalid Stripe event");
    try {
      await this.prisma.$transaction(async tx => {
        await tx.billingWebhookEvent.create({ data: { provider: "stripe", eventId: event.id!, eventType: event.type! } });
        if (!["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type!)) return;
        const payload = event.data?.object;
        const tenantId = payload?.metadata?.tenantId;
        const planId = payload?.metadata?.planId;
        if (!tenantId || !planId || !payload?.id || !payload.customer) return;
        const plan = await tx.plan.findUnique({ where: { id: planId }, select: { id: true } });
        const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
        if (!plan || !tenant) return;
        const current = await tx.subscription.findUnique({ where: { tenantId }, select: { status: true, stripeSubscriptionId: true } });
        const replacingEndedSubscription = current && (current.status === SubscriptionStatus.CANCELLED || current.status === SubscriptionStatus.EXPIRED) && event.type === "customer.subscription.created";
        if (current?.stripeSubscriptionId && current.stripeSubscriptionId !== payload.id && !replacingEndedSubscription) return;
        const status = event.type === "customer.subscription.deleted" ? SubscriptionStatus.CANCELLED : this.mapStripeStatus(payload.status);
        const billingCycle = payload.metadata?.billingCycle === "yearly" ? "yearly" : "monthly";
        const start = payload.current_period_start ? new Date(payload.current_period_start * 1000) : new Date();
        const fallbackDays = billingCycle === "yearly" ? 365 : 30;
        const end = payload.current_period_end ? new Date(payload.current_period_end * 1000) : new Date(start.getTime() + fallbackDays * 86400000);
        await tx.subscription.upsert({
          where: { tenantId },
          create: { tenantId, planId, status, billingCycle, currentPeriodStart: start, currentPeriodEnd: end, stripeCustomerId: String(payload.customer), stripeSubscriptionId: payload.id },
          update: { planId, status, billingCycle, currentPeriodStart: start, currentPeriodEnd: end, stripeCustomerId: String(payload.customer), stripeSubscriptionId: payload.id, cancelledAt: status === SubscriptionStatus.CANCELLED ? new Date() : null },
        });
        await tx.auditLog.create({ data: { tenantId, action: "subscription.updated", targetType: "subscription", targetId: payload.id, metadata: { status } } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { received: true, duplicate: true };
      throw error;
    }
    return { received: true };
  }

  private defaultSeatLimit() {
    const configured = Number(process.env.DEFAULT_INCLUDED_USERS ?? 10);
    return Number.isSafeInteger(configured) && configured > 0 ? configured : 10;
  }

  private maxUsers(features: Array<{ feature: string; value: string }>) {
    const raw = features.find(feature => feature.feature === "max_users")?.value;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : this.defaultSeatLimit();
  }

  private mapStripeStatus(status?: string): SubscriptionStatus {
    if (status === "active") return SubscriptionStatus.ACTIVE;
    if (status === "trialing") return SubscriptionStatus.TRIALING;
    if (status === "past_due" || status === "incomplete") return SubscriptionStatus.PAST_DUE;
    if (status === "canceled") return SubscriptionStatus.CANCELLED;
    if (status === "unpaid" || status === "paused") return SubscriptionStatus.SUSPENDED;
    return SubscriptionStatus.EXPIRED;
  }
}

type StripeSubscription = {
  id?: string; customer?: string; status?: string; current_period_start?: number; current_period_end?: number;
  metadata?: { tenantId?: string; planId?: string; billingCycle?: string };
};
