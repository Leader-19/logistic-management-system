const { pbkdf2, randomBytes } = require("node:crypto");
const { promisify } = require("node:util");
const { createInterface } = require("node:readline");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { PrismaClient, ShipmentStatus } = require("@prisma/client");

const prisma = new PrismaClient();
const deriveKey = promisify(pbkdf2);
const DEMO_TENANT_SLUG = "lms-demo-sample";
const PERMISSION_RESOURCES = [
  "tenants", "users", "members", "roles", "permissions", "branches", "customers", "shipments", "tracking", "invoices", "payments", "products", "warehouse", "fleet", "dispatch", "reports", "audit", "plans", "subscriptions", "settings",
];
const PERMISSION_ACTIONS = ["create", "read", "update", "delete", "manage", "export"];

function ask(prompt) {
  return new Promise((resolve) => {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    readline.question(prompt, (answer) => { readline.close(); resolve(answer.trim()); });
  });
}

function askSecret(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== "function") {
      reject(new Error("Run pnpm db:seed from an interactive terminal so demo passwords are not echoed."));
      return;
    }
    let value = "";
    process.stdout.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    const finish = (error) => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") return finish(new Error("Cancelled."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    input.on("data", onData);
  });
}

async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await deriveKey(password, salt, 310_000, 32, "sha256")).toString("hex");
  return `310000:${salt}:${hash}`;
}

function permissionsToSeed() {
  const rows = PERMISSION_RESOURCES.flatMap((resource) => PERMISSION_ACTIONS.map((action) => ({ resource, action, description: `${action} ${resource}` })));
  rows.push(
    { resource: "shipments", action: "assign", description: "Assign shipments to drivers/carriers" },
    { resource: "shipments", action: "cancel", description: "Cancel shipments" },
    { resource: "tracking", action: "create", description: "Create tracking events" },
    { resource: "delivery", action: "proof.create", description: "Submit proof of delivery" },
    { resource: "settlements", action: "approve", description: "Approve settlements" },
    { resource: "warehouse.stock", action: "adjust", description: "Receive or adjust warehouse stock" },
  );
  return rows;
}

async function getOrCreateUser(tx, email, fullName, password) {
  let user = await tx.user.findUnique({ where: { email }, include: { memberships: true } });
  if (user) {
    const alreadyInDemoTenant = user.memberships.some((membership) => membership.tenantId === DEMO_TENANT_ID);
    if (!alreadyInDemoTenant) throw new Error(`Reserved demo email ${email} is already used by an account outside the demo tenant.`);
    return user;
  }
  return tx.user.create({ data: { email, fullName, passwordHash: await passwordHash(password) }, include: { memberships: true } });
}

let DEMO_TENANT_ID;

async function ensureRole(tx, tenantId, name, description, permissionIds) {
  let role = await tx.role.findFirst({ where: { tenantId, name } });
  if (!role) role = await tx.role.create({ data: { tenantId, name, description, isSystem: true } });
  if (permissionIds.length) await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })), skipDuplicates: true });
  return role;
}

async function ensureShipment(tx, tenant, customer, driver, actorId, code, finalStatus, pathStatuses) {
  const trackingNumber = `DEMO-${code}`;
  const exists = await tx.shipment.findUnique({ where: { trackingNumber } });
  if (exists) {
    if (exists.tenantId !== tenant.id) throw new Error(`Sample tracking number ${trackingNumber} belongs to another tenant.`);
    return exists;
  }
  const now = Date.now();
  const createdAt = new Date(now - 5 * 24 * 60 * 60 * 1000);
  const shipment = await tx.shipment.create({ data: {
    tenantId: tenant.id,
    customerId: customer.id,
    trackingNumber,
    status: finalStatus,
    senderName: "Mekong Market Warehouse",
    senderPhone: "+855 12 000 101",
    senderAddress: "Russian Boulevard, Phnom Penh",
    recipientName: code === "DELIVERED-001" ? "Sokha Chan" : "Sample Recipient",
    recipientPhone: "+855 12 000 202",
    recipientAddress: "BKK 1, Phnom Penh, Cambodia",
    weightGrams: 1250,
    lengthCm: "24.00",
    widthCm: "18.00",
    heightCm: "12.00",
    chargeAmount: "5.00",
    currency: tenant.currency,
    serviceType: "STANDARD",
    assignedDriverId: driver.id,
    createdAt,
    updatedAt: new Date(now - 60 * 60 * 1000),
  } });
  const events = pathStatuses.map((status, index) => ({
    tenantId: tenant.id,
    shipmentId: shipment.id,
    sequence: index + 1,
    status,
    note: status === "AT_HUB" ? "Received at Phnom Penh sorting hub" : status === "IN_TRANSIT" ? "Loaded for regional transport" : status === "DELIVERED" ? "Sample delivery completed" : `Sample status: ${status.toLowerCase().replaceAll("_", " ")}`,
    location: status === "AT_HUB" ? "Phnom Penh Hub" : status === "DELIVERED" ? "BKK 1, Phnom Penh" : null,
    actorId,
    source: "demo_seed",
    occurredAt: new Date(createdAt.getTime() + (index + 1) * 8 * 60 * 60 * 1000),
  }));
  await tx.shipmentEvent.createMany({ data: events });

  if (finalStatus === ShipmentStatus.DELIVERED) {
    const deliveredAt = events[events.length - 1].occurredAt;
    await tx.proofOfDelivery.create({ data: { tenantId: tenant.id, shipmentId: shipment.id, recipientName: "Sokha Chan", note: "Sample proof of delivery", actorId, deliveredAt, recordedAt: deliveredAt } });
    await tx.invoice.create({ data: {
      tenantId: tenant.id,
      shipmentId: shipment.id,
      invoiceNumber: "DEMO-INV-0001",
      status: "ISSUED",
      subtotal: "5.00",
      taxRate: "10.0000",
      taxAmount: "0.5000",
      total: "5.5000",
      currency: tenant.currency,
      issuedAt: deliveredAt,
      createdAt: deliveredAt,
      lines: { create: [{ description: "Standard parcel delivery", quantity: "1.0000", unitPrice: "5.0000", lineTotal: "5.0000" }, { description: "VAT 10%", quantity: "1.0000", unitPrice: "0.5000", lineTotal: "0.5000" }] },
    } });
  }
  return shipment;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from the root .env file.");
  if (process.env.NODE_ENV === "production") throw new Error("Demo data seeding is disabled when NODE_ENV=production.");
  if (process.env.ALLOW_DEMO_SEED !== "true") throw new Error("Set ALLOW_DEMO_SEED=true in this PowerShell session before running this local demo seeder.");

  const ownerEmail = (process.env.DEMO_OWNER_EMAIL || "demo.owner@sample.invalid").trim().toLowerCase();
  const driverEmail = (process.env.DEMO_DRIVER_EMAIL || "demo.driver@sample.invalid").trim().toLowerCase();
  if (ownerEmail === driverEmail) throw new Error("Demo owner and driver must use different email addresses.");
  const ownerExists = await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } });
  const driverExists = await prisma.user.findUnique({ where: { email: driverEmail }, select: { id: true } });
  const ownerPassword = ownerExists ? "unused-existing-account" : await askSecret(`First-time demo owner password for ${ownerEmail} (12 to 128 characters, hidden): `);
  const driverPassword = driverExists ? "unused-existing-account" : await askSecret(`First-time demo driver password for ${driverEmail} (12 to 128 characters, hidden): `);
  if (!ownerExists && (ownerPassword.length < 12 || ownerPassword.length > 128)) throw new Error("Demo owner password must be 12 to 128 characters.");
  if (!driverExists && (driverPassword.length < 12 || driverPassword.length > 128)) throw new Error("Demo driver password must be 12 to 128 characters.");

  const seedPermissions = permissionsToSeed();
  await prisma.permission.createMany({ data: seedPermissions, skipDuplicates: true });
  const permissions = await prisma.permission.findMany({ select: { id: true, resource: true, action: true } });
  const allPermissionIds = permissions.map((permission) => permission.id);
  const driverPermissionIds = permissions.filter((permission) =>
    (permission.resource === "shipments" && permission.action === "read") ||
    (permission.resource === "tracking" && ["read", "create"].includes(permission.action)) ||
    (permission.resource === "delivery" && permission.action === "proof.create"),
  ).map((permission) => permission.id);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.upsert({
      where: { slug: DEMO_TENANT_SLUG },
      create: { name: "LMS Demo Logistics", slug: DEMO_TENANT_SLUG, currency: "USD", timezone: "Asia/Phnom_Penh" },
      update: {},
    });
    DEMO_TENANT_ID = tenant.id;
    const [owner, driver] = await Promise.all([
      getOrCreateUser(tx, ownerEmail, "Demo Workspace Owner", ownerPassword),
      getOrCreateUser(tx, driverEmail, "Demo Delivery Driver", driverPassword),
    ]);
    if (!owner.isActive || !driver.isActive) throw new Error("A reserved demo account is inactive; inspect it before seeding.");

    const [ownerMembership, driverMembership] = await Promise.all([
      tx.tenantMembership.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: owner.id } }, create: { tenantId: tenant.id, userId: owner.id, status: "ACTIVE" }, update: { status: "ACTIVE" } }),
      tx.tenantMembership.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: driver.id } }, create: { tenantId: tenant.id, userId: driver.id, status: "ACTIVE" }, update: { status: "ACTIVE" } }),
    ]);
    const [ownerRole, driverRole] = await Promise.all([
      ensureRole(tx, tenant.id, "Owner", "Full access to this local sample workspace", allPermissionIds),
      ensureRole(tx, tenant.id, "Driver", "Driver access for sample deliveries", driverPermissionIds),
    ]);
    await tx.membershipRole.createMany({ data: [
      { membershipId: ownerMembership.id, roleId: ownerRole.id },
      { membershipId: driverMembership.id, roleId: driverRole.id },
    ], skipDuplicates: true });

    const settingRows = [
      { tenantId: tenant.id, key: "shipment.flatRate", value: "5.00" },
      { tenantId: tenant.id, key: "invoice.vatRate", value: "10" },
    ];
    for (const setting of settingRows) await tx.tenantSetting.upsert({ where: { tenantId_key: { tenantId: tenant.id, key: setting.key } }, create: setting, update: {} });

    const branch = await tx.branch.upsert({ where: { tenantId_name: { tenantId: tenant.id, name: "Phnom Penh Hub" } }, create: { tenantId: tenant.id, name: "Phnom Penh Hub", code: "PPH-01", address: "Russian Boulevard, Phnom Penh", phone: "+855 12 000 001" }, update: {} });
    let customer = await tx.customer.findFirst({ where: { tenantId: tenant.id, email: "warehouse@mekong-market.example" } });
    if (!customer) customer = await tx.customer.create({ data: { tenantId: tenant.id, name: "Mekong Market", company: "Mekong Market Co.", email: "warehouse@mekong-market.example", phone: "+855 12 000 100", address: "Russian Boulevard", city: "Phnom Penh", country: "Cambodia" } });
    const category = await tx.productCategory.upsert({ where: { tenantId_name: { tenantId: tenant.id, name: "Packaging Supplies" } }, create: { tenantId: tenant.id, name: "Packaging Supplies" }, update: {} });
    const product = await tx.product.upsert({ where: { tenantId_sku: { tenantId: tenant.id, sku: "DEMO-BOX-001" } }, create: { tenantId: tenant.id, categoryId: category.id, sku: "DEMO-BOX-001", barcode: "999000000001", name: "Small shipping box", description: "Synthetic demo inventory item" }, update: {} });
    const warehouse = await tx.warehouse.upsert({ where: { tenantId_name: { tenantId: tenant.id, name: "Phnom Penh Main Warehouse" } }, create: { tenantId: tenant.id, name: "Phnom Penh Main Warehouse", address: branch.address }, update: {} });
    await tx.vehicle.upsert({ where: { tenantId_registration: { tenantId: tenant.id, registration: "DEMO-001" } }, create: { tenantId: tenant.id, registration: "DEMO-001", vehicleType: "Van", make: "Demo", model: "Cargo", capacityKg: "1200", notes: "Synthetic sample vehicle" }, update: {} });
    await tx.inventoryBalance.upsert({ where: { tenantId_warehouseId_productId: { tenantId: tenant.id, warehouseId: warehouse.id, productId: product.id } }, create: { tenantId: tenant.id, warehouseId: warehouse.id, productId: product.id, quantity: "120.000" }, update: {} });
    const seedMovement = await tx.stockMovement.findFirst({ where: { tenantId: tenant.id, reason: "DEMO_SEED: opening stock" }, select: { id: true } });
    if (!seedMovement) await tx.stockMovement.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, productId: product.id, quantityChange: "120.000", quantityAfter: "120.000", reason: "DEMO_SEED: opening stock", actorId: owner.id } });

    const sampleShipments = [
      { code: "BOOKED-001", status: ShipmentStatus.BOOKED, path: [ShipmentStatus.BOOKED] },
      { code: "TRANSIT-001", status: ShipmentStatus.IN_TRANSIT, path: [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB, ShipmentStatus.IN_TRANSIT] },
      { code: "DELIVERY-001", status: ShipmentStatus.OUT_FOR_DELIVERY, path: [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY] },
      { code: "DELIVERED-001", status: ShipmentStatus.DELIVERED, path: [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED] },
    ];
    for (const sample of sampleShipments) await ensureShipment(tx, tenant, customer, driver, owner.id, sample.code, sample.status, sample.path);
    const seedAudit = await tx.auditLog.findFirst({ where: { tenantId: tenant.id, action: "demo.seed.completed" }, select: { id: true } });
    if (!seedAudit) await tx.auditLog.create({ data: { tenantId: tenant.id, actorId: owner.id, action: "demo.seed.completed", targetType: "tenant", targetId: tenant.id, metadata: { source: "local demo seeder" } } });
    return { tenant, branch };
  });

  console.log(`Seeded sample data in workspace: ${result.tenant.name} (${result.tenant.slug}).`);
  console.log(`Owner login: ${ownerEmail}`);
  console.log(`Driver login: ${driverEmail}`);
  console.log("Passwords are the hidden passwords you entered (existing demo users were left unchanged).");
  console.log("Seed is repeatable: existing sample records are retained and not overwritten.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Demo data seeding failed.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
