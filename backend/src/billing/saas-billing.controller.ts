import { Body, Controller, Get, Headers, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn, IsUUID } from "class-validator";
import { AuthGuard, PermissionGuard, Public, RequirePermissions, TenantGuard } from "../common/guards";
import { AuthenticatedRequest } from "../common/interfaces";
import { SaasBillingService } from "./saas-billing.service";

class CheckoutDto {
  @IsUUID() planId!: string;
  @IsIn(["monthly", "yearly"]) billingCycle!: "monthly" | "yearly";
}

@ApiTags("SaaS billing")
@ApiBearerAuth()
@Controller("saas-billing")
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class SaasBillingController {
  constructor(private readonly billing: SaasBillingService) { }

  @Get("current")
  @RequirePermissions("subscriptions.read")
  @ApiOperation({ summary: "Get current subscription and tenant seat usage" })
  current(@Req() request: AuthenticatedRequest) {
    const grants = request.membership.membershipRoles.flatMap(({ role }) => role.rolePermissions.map(({ permission }) => `${permission.resource}.${permission.action}`));
    const canManageBilling = grants.includes("*.*") || grants.includes("subscriptions.*") || grants.includes("subscriptions.manage") || grants.includes("subscriptions.update");
    return this.billing.current(request.tenantId).then(result => ({ ...result, canManageBilling }));
  }

  @Post("checkout")
  @RequirePermissions("subscriptions.update")
  @ApiOperation({ summary: "Start Stripe Checkout for a higher seat subscription plan" })
  checkout(@Req() request: AuthenticatedRequest, @Body() body: CheckoutDto) {
    return this.billing.createCheckout(request.tenantId, request.user.sub, body.planId, body.billingCycle);
  }

  @Post("portal")
  @RequirePermissions("subscriptions.update")
  @ApiOperation({ summary: "Open Stripe customer portal to manage the existing subscription" })
  portal(@Req() request: AuthenticatedRequest) {
    return this.billing.createPortal(request.tenantId);
  }
}

@Controller("webhooks/stripe")
export class StripeWebhookController {
  constructor(private readonly billing: SaasBillingService) { }

  @Post()
  @Public()
  receive(@Req() request: AuthenticatedRequest & { rawBody?: Buffer }, @Headers("stripe-signature") signature?: string) {
    return this.billing.handleStripeWebhook(request.rawBody, signature);
  }
}
