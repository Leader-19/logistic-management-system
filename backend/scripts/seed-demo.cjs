const { pbkdf2, randomBytes } = require("node:crypto");
const { promisify } = require("node:util");
const { createInterface } = require("node:readline");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { PrismaClient, Prisma, ShipmentStatus } = require("@prisma/client");

const prisma = new PrismaClient();
const deriveKey = promisify(pbkdf2);
const DEMO_TENANT_SLUG = "lms-demo-sample";
const PERMISSION_RESOURCES = [
  "tenants", "users", "members", "roles", "permissions", "branches", "customers", "shipments", "tracking", "invoices", "payments", "products", "packaging.types", "warehouse", "fleet", "dispatch", "reports", "audit", "plans", "subscriptions", "settings", "suppliers", "purchasing",
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
    { resource: "packaging.types", action: "manage", description: "Manage package types" },
  );
  return rows;
}

async function getOrCreateUser(tx, email, fullName, password, resetExisting = false) {
  let user = await tx.user.findUnique({ where: { email }, include: { memberships: true } });
  if (user) {
    const alreadyInDemoTenant = user.memberships.some((membership) => membership.tenantId === DEMO_TENANT_ID);
    if (!alreadyInDemoTenant) throw new Error(`Reserved demo email ${email} is already used by an account outside the demo tenant.`);
    if (resetExisting) user = await tx.user.update({ where: { id: user.id }, data: { passwordHash: await passwordHash(password) }, include: { memberships: true } });
    return user;
  }
  return tx.user.create({ data: { email, fullName, passwordHash: await passwordHash(password) }, include: { memberships: true } });
}

async function ensureDemoPurchaseOrder(tx, input) {
  const { tenantId, supplierId, warehouseId, orderNumber, status, currency, notes, orderedAt, receivedAt, createdBy, lines } = input;
  const order = await tx.purchaseOrder.upsert({
    where: { tenantId_orderNumber: { tenantId, orderNumber } },
    create: { tenantId, supplierId, warehouseId, orderNumber, status, currency, notes, orderedAt, receivedAt, createdBy },
    update: {},
  });
  for (const line of lines) {
    const existing = await tx.purchaseOrderLine.findFirst({ where: { tenantId, purchaseOrderId: order.id, productId: line.productId }, select: { id: true } });
    if (!existing) await tx.purchaseOrderLine.create({ data: { tenantId, purchaseOrderId: order.id, ...line } });
  }
  return order;
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
      customerId: customer.id,
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

// Add a stable, synthetic dataset that makes the main tenant admin lists useful
// for trying pagination, search, and status filters. Every row has a deterministic
// key so rerunning the local demo seed never multiplies records or stock.
async function seedDemoVolume(tx, { tenant, owner, driver, warehouse }) {
  const count = Number(process.env.DEMO_VOLUME_COUNT ?? 250);
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new Error("DEMO_VOLUME_COUNT must be a whole number between 1 and 500.");
  }
  const branchesData = Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    return { tenantId: tenant.id, name: `Demo Branch ${number}`, code: `DEMO-BR-${number}`, address: `Sample service area ${number}, Phnom Penh`, phone: `+855 12 100 ${number}` };
  });
  const customersData = Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    return { tenantId: tenant.id, name: `Demo Customer ${number}`, company: `Sample Company ${number}`, email: `demo.customer.${number}@example.test`, phone: `+855 12 200 ${number}`, address: `Sample Street ${number}`, city: index % 2 ? "Kandal" : "Phnom Penh", country: "Cambodia", notes: "Synthetic demo record" };
  });
  const categoriesData = Array.from({ length: count }, (_, index) => ({ tenantId: tenant.id, name: `Demo Category ${String(index + 1).padStart(3, "0")}` }));
  const suppliersData = Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    return { tenantId: tenant.id, name: `Demo Supplier ${number}`, email: `demo.supplier.${number}@example.test`, phone: `+855 12 300 ${number}`, address: `Sample supplier address ${number}, Cambodia`, notes: "Synthetic demo supplier" };
  });
  const vehiclesData = Array.from({ length: count }, (_, index) => ({ tenantId: tenant.id, registration: `DEMO-V-${String(index + 1).padStart(3, "0")}`, vehicleType: ["Van", "Motorbike", "Truck"][index % 3], make: "Demo Fleet", model: `Model ${index + 1}`, capacityKg: String(250 + (index % 10) * 100), status: index % 12 === 0 ? "MAINTENANCE" : "ACTIVE", notes: "Synthetic demo vehicle" }));
  const packageTypesData = Array.from({ length: count }, (_, index) => ({
    tenantId: tenant.id, code: `DEMO-PKG-${String(index + 1).padStart(3, "0")}`, name: `Demo Package ${String(index + 1).padStart(3, "0")}`,
    lengthCm: String(10 + index % 50), widthCm: String(10 + index % 30), heightCm: String(5 + index % 25), tareWeightGrams: 50 + index, maxLoadGrams: 1000 + index * 100, stackable: index % 4 !== 0,
  }));
  await Promise.all([
    tx.branch.createMany({ data: branchesData, skipDuplicates: true }),
    tx.customer.createMany({ data: customersData, skipDuplicates: true }),
    tx.productCategory.createMany({ data: categoriesData, skipDuplicates: true }),
    tx.supplier.createMany({ data: suppliersData, skipDuplicates: true }),
    tx.vehicle.createMany({ data: vehiclesData, skipDuplicates: true }),
    tx.packageType.createMany({ data: packageTypesData, skipDuplicates: true }),
  ]);

  const customers = await tx.customer.findMany({ where: { tenantId: tenant.id, email: { startsWith: "demo.customer." } }, orderBy: { email: "asc" } });
  const categories = await tx.productCategory.findMany({ where: { tenantId: tenant.id, name: { startsWith: "Demo Category " } }, orderBy: { name: "asc" } });
  const productsData = categories.map((category, index) => {
    const number = String(index + 1).padStart(3, "0");
    return { tenantId: tenant.id, categoryId: category.id, sku: `DEMO-SKU-${number}`, barcode: `9990001${number.padStart(5, "0")}`, name: `Demo Stock Item ${number}`, description: "Synthetic item for inventory and purchasing demos" };
  });
  await tx.product.createMany({ data: productsData, skipDuplicates: true });
  const products = await tx.product.findMany({ where: { tenantId: tenant.id, sku: { startsWith: "DEMO-SKU-" } }, orderBy: { sku: "asc" } });

  // Each seeded product gets one stable opening balance and append-only movement.
  // Do not increment the balance on reruns.
  for (const [index, item] of products.entries()) {
    const number = String(index + 1).padStart(3, "0");
    const quantity = new Prisma.Decimal(25 + index);
    await tx.inventoryBalance.upsert({
      where: { tenantId_warehouseId_productId: { tenantId: tenant.id, warehouseId: warehouse.id, productId: item.id } },
      create: { tenantId: tenant.id, warehouseId: warehouse.id, productId: item.id, quantity }, update: {},
    });
    const reason = `DEMO_SEED: bulk opening stock ${number}`;
    const exists = await tx.stockMovement.findFirst({ where: { tenantId: tenant.id, reason }, select: { id: true } });
    if (!exists) await tx.stockMovement.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, productId: item.id, quantityChange: quantity, quantityAfter: quantity, reason, actorId: owner.id } });
  }

  // One hundred draft or ordered purchase orders, each with a line, to populate
  // supply-chain lists without implying that stock has already been received.
  const suppliers = await tx.supplier.findMany({ where: { tenantId: tenant.id, name: { startsWith: "Demo Supplier " } }, orderBy: { name: "asc" } });
  const purchaseOrdersData = Array.from({ length: count }, (_, index) => ({
    tenantId: tenant.id, supplierId: suppliers[index % suppliers.length].id, warehouseId: warehouse.id,
    orderNumber: `DEMO-PO-BULK-${String(index + 1).padStart(3, "0")}`, status: index % 3 === 0 ? "DRAFT" : "ORDERED", currency: tenant.currency,
    notes: "Synthetic demo purchase order", createdBy: owner.id,
    ...(index % 3 === 0 ? {} : { orderedAt: new Date(Date.now() - (index + 1) * 3600_000) }),
  }));
  await tx.purchaseOrder.createMany({ data: purchaseOrdersData, skipDuplicates: true });
  const purchaseOrders = await tx.purchaseOrder.findMany({ where: { tenantId: tenant.id, orderNumber: { startsWith: "DEMO-PO-BULK-" } }, orderBy: { orderNumber: "asc" } });
  await tx.purchaseOrderLine.createMany({ data: purchaseOrders.map((order, index) => ({ tenantId: tenant.id, purchaseOrderId: order.id, productId: products[index % products.length].id, quantity: String(5 + (index % 45)), unitCost: (1 + (index % 20) / 10).toFixed(4) })), skipDuplicates: true });

  // A hundred shipments span the supported workflow states and carry ordered
  // event history. Events are only created for newly inserted shipments.
  const paths = [
    [ShipmentStatus.BOOKED],
    [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED],
    [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED],
    [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB],
    [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB, ShipmentStatus.IN_TRANSIT],
    [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY],
    [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED],
    [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERY_FAILED],
    [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERY_FAILED, ShipmentStatus.RETURNED],
    [ShipmentStatus.BOOKED, ShipmentStatus.CANCELLED],
  ];
  const shipmentEvents = [];
  const deliveredShipments = [];
  for (let index = 0; index < count; index += 1) {
    const number = String(index + 1).padStart(3, "0");
    const trackingNumber = `DEMO-BULK-${number}`;
    const existing = await tx.shipment.findUnique({ where: { trackingNumber }, select: { id: true, tenantId: true } });
    if (existing) {
      if (existing.tenantId !== tenant.id) throw new Error(`Sample tracking number ${trackingNumber} belongs to another tenant.`);
      continue;
    }
    const pathStatuses = paths[index % paths.length];
    const createdAt = new Date(Date.now() - (count - index) * 86_400_000);
    const shipment = await tx.shipment.create({ data: {
      tenantId: tenant.id, customerId: customers[index % customers.length].id, trackingNumber, status: pathStatuses[pathStatuses.length - 1],
      senderName: `Demo Sender ${number}`, senderPhone: `+855 12 400 ${number}`, senderAddress: `Sample dispatch address ${number}, Phnom Penh`,
      recipientName: `Demo Recipient ${number}`, recipientPhone: `+855 12 500 ${number}`, recipientAddress: `Sample delivery address ${number}, Cambodia`,
      weightGrams: 500 + index * 10, lengthCm: String(10 + index % 30), widthCm: String(10 + index % 20), heightCm: String(5 + index % 15),
      chargeAmount: (3 + (index % 25) * 0.5).toFixed(2), currency: tenant.currency, serviceType: index % 2 ? "STANDARD" : "EXPRESS",
      assignedDriverId: driver.id, notes: "Synthetic shipment for demo filters", createdAt, updatedAt: createdAt,
    } });
    pathStatuses.forEach((status, eventIndex) => shipmentEvents.push({
      tenantId: tenant.id, shipmentId: shipment.id, sequence: eventIndex + 1, status,
      note: `Demo workflow event: ${String(status).toLowerCase().replaceAll("_", " ")}`,
      location: status === ShipmentStatus.AT_HUB ? "Phnom Penh Demo Hub" : status === ShipmentStatus.DELIVERED ? "Sample delivery location" : null,
      actorId: owner.id, source: "demo_seed", occurredAt: new Date(createdAt.getTime() + (eventIndex + 1) * 3600_000),
    }));
    if (pathStatuses[pathStatuses.length - 1] === ShipmentStatus.DELIVERED) deliveredShipments.push({ shipment, customer: customers[index % customers.length], deliveredAt: new Date(createdAt.getTime() + pathStatuses.length * 3600_000) });
  }
  if (shipmentEvents.length) await tx.shipmentEvent.createMany({ data: shipmentEvents });
  for (const { shipment, deliveredAt } of deliveredShipments) {
    await tx.proofOfDelivery.create({ data: { tenantId: tenant.id, shipmentId: shipment.id, recipientName: shipment.recipientName, note: "Synthetic demo proof of delivery", actorId: owner.id, deliveredAt, recordedAt: deliveredAt } });
  }

  // One hundred standalone invoices exercise customizable invoice fields and
  // customer associations without creating duplicate financial records.
  const existingInvoices = await tx.invoice.findMany({ where: { tenantId: tenant.id, invoiceNumber: { startsWith: "DEMO-MANUAL-INV-" } }, select: { invoiceNumber: true } });
  const invoiceSet = new Set(existingInvoices.map((invoice) => invoice.invoiceNumber));
  const invoicesData = [];
  for (let index = 0; index < count; index += 1) {
    const number = String(index + 1).padStart(3, "0");
    if (invoiceSet.has(`DEMO-MANUAL-INV-${number}`)) continue;
    const subtotal = new Prisma.Decimal(10 + index);
    const tax = subtotal.mul("0.10");
    const issuedAt = new Date(Date.now() - index * 86_400_000);
    invoicesData.push({
      tenantId: tenant.id, customerId: customers[index % customers.length].id, shipmentId: null, invoiceNumber: `DEMO-MANUAL-INV-${number}`,
      status: ["ISSUED", "PAID", "OVERDUE"][index % 3], subtotal, taxRate: "10.0000", taxAmount: tax, total: subtotal.plus(tax), currency: tenant.currency,
      dueAt: new Date(issuedAt.getTime() + (index % 2 ? 30 : -5) * 86_400_000), notes: "Synthetic standalone invoice",
      headerNote: index % 2 ? "Thank you for choosing our delivery service." : null,
      paymentTerms: "Payment due within 30 days", footerNote: "Demo document; no payment is due.", issuedAt, createdAt: issuedAt,
    });
  }
  if (invoicesData.length) {
    await tx.invoice.createMany({ data: invoicesData, skipDuplicates: true });
    const invoices = await tx.invoice.findMany({ where: { tenantId: tenant.id, invoiceNumber: { startsWith: "DEMO-MANUAL-INV-" } }, select: { id: true, invoiceNumber: true, subtotal: true } });
    await tx.invoiceLine.createMany({ data: invoices.map((invoice) => ({ tenantId: tenant.id, invoiceId: invoice.id, description: `Demo courier service ${invoice.invoiceNumber.slice(-3)}`, quantity: "1.0000", unitPrice: invoice.subtotal, lineTotal: invoice.subtotal })), skipDuplicates: true });
  }

  const existingNotices = await tx.notification.findMany({ where: { tenantId: tenant.id, userId: owner.id, title: { startsWith: "Demo activity " } }, select: { title: true } });
  const noticeTitles = new Set(existingNotices.map((notice) => notice.title));
  const notices = Array.from({ length: count }, (_, index) => ({
    tenantId: tenant.id, userId: owner.id, title: `Demo activity ${String(index + 1).padStart(3, "0")}`,
    body: `Sample workspace update ${index + 1} for trying notification search and read filters.`, href: index % 2 ? "/shipments" : "/invoices",
    readAt: index % 4 === 0 ? new Date(Date.now() - index * 60_000) : null,
  })).filter((notice) => !noticeTitles.has(notice.title));
  if (notices.length) await tx.notification.createMany({ data: notices });

  const existingAudit = await tx.auditLog.findMany({ where: { tenantId: tenant.id, action: "demo.bulk.sample" }, select: { targetId: true } });
  const auditTargets = new Set(existingAudit.map((row) => row.targetId));
  const auditRows = Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    return { tenantId: tenant.id, actorId: owner.id, action: "demo.bulk.sample", targetType: "demo_record", targetId: `demo-bulk-audit-${number}`, metadata: { sample: true, sequence: index + 1 }, createdAt: new Date(Date.now() - index * 3_600_000) };
  }).filter((row) => !auditTargets.has(row.targetId));
  if (auditRows.length) await tx.auditLog.createMany({ data: auditRows });

  return { branches: count, customers: customers.length, categories: categories.length, products: products.length, suppliers: suppliers.length, vehicles: count, packageTypes: count, purchaseOrders: purchaseOrders.length, shipments: count, invoices: count, notifications: count, auditEvents: count };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from the root .env file.");
  if (process.env.NODE_ENV === "production") throw new Error("Demo data seeding is disabled when NODE_ENV=production.");
  if (process.env.ALLOW_DEMO_SEED !== "true") throw new Error("Set ALLOW_DEMO_SEED=true in this PowerShell session before running this local demo seeder.");

  const ownerEmail = (process.env.DEMO_OWNER_EMAIL || "demo.owner@sample.invalid").trim().toLowerCase();
  const driverEmail = (process.env.DEMO_DRIVER_EMAIL || "demo.driver@sample.invalid").trim().toLowerCase();
  const resetOwnerPassword = process.env.DEMO_RESET_OWNER_PASSWORD === "true";
  if (ownerEmail === driverEmail) throw new Error("Demo owner and driver must use different email addresses.");
  const ownerExists = await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } });
  const driverExists = await prisma.user.findUnique({ where: { email: driverEmail }, select: { id: true } });
  const ownerPassword = ownerExists && !resetOwnerPassword ? "unused-existing-account" : await askSecret(`${resetOwnerPassword ? "New" : "First-time"} demo owner password for ${ownerEmail} (12 to 128 characters, hidden): `);
  const driverPassword = driverExists ? "unused-existing-account" : await askSecret(`First-time demo driver password for ${driverEmail} (12 to 128 characters, hidden): `);
  if ((!ownerExists || resetOwnerPassword) && (ownerPassword.length < 12 || ownerPassword.length > 128)) throw new Error("Demo owner password must be 12 to 128 characters.");
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
      getOrCreateUser(tx, ownerEmail, "Demo Workspace Owner", ownerPassword, resetOwnerPassword),
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
    const supplier = await tx.supplier.upsert({ where: { tenantId_name: { tenantId: tenant.id, name: "Mekong Packaging Supply" } }, create: { tenantId: tenant.id, name: "Mekong Packaging Supply", email: "sales@mekong-packaging.example", phone: "+855 12 555 010", address: "Phnom Penh, Cambodia", notes: "Synthetic demo supplier" }, update: {} });
    const secondarySupplier = await tx.supplier.upsert({ where: { tenantId_name: { tenantId: tenant.id, name: "Cambodia Office Goods" } }, create: { tenantId: tenant.id, name: "Cambodia Office Goods", email: "orders@office-goods.example", phone: "+855 12 555 020", address: "Kandal, Cambodia", notes: "Synthetic demo supplier" }, update: {} });
    await tx.vehicle.upsert({ where: { tenantId_registration: { tenantId: tenant.id, registration: "DEMO-001" } }, create: { tenantId: tenant.id, registration: "DEMO-001", vehicleType: "Van", make: "Demo", model: "Cargo", capacityKg: "1200", notes: "Synthetic sample vehicle" }, update: {} });
    await tx.inventoryBalance.upsert({ where: { tenantId_warehouseId_productId: { tenantId: tenant.id, warehouseId: warehouse.id, productId: product.id } }, create: { tenantId: tenant.id, warehouseId: warehouse.id, productId: product.id, quantity: "120.000" }, update: {} });
    const seedMovement = await tx.stockMovement.findFirst({ where: { tenantId: tenant.id, reason: "DEMO_SEED: opening stock" }, select: { id: true } });
    if (!seedMovement) await tx.stockMovement.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, productId: product.id, quantityChange: "120.000", quantityAfter: "120.000", reason: "DEMO_SEED: opening stock", actorId: owner.id } });
    await ensureDemoPurchaseOrder(tx, { tenantId: tenant.id, supplierId: supplier.id, warehouseId: warehouse.id, orderNumber: "DEMO-PO-OPEN-001", status: "ORDERED", currency: tenant.currency, notes: "Demo order available for partial or full receiving", orderedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), createdBy: owner.id, lines: [{ productId: product.id, quantity: "40.000", unitCost: "1.2500" }] });
    await ensureDemoPurchaseOrder(tx, { tenantId: tenant.id, supplierId: secondarySupplier.id, warehouseId: warehouse.id, orderNumber: "DEMO-PO-DRAFT-001", status: "DRAFT", currency: tenant.currency, notes: "Demo draft purchase order", createdBy: owner.id, lines: [{ productId: product.id, quantity: "15.000", unitCost: "0.8500" }] });
    await ensureDemoPurchaseOrder(tx, { tenantId: tenant.id, supplierId: supplier.id, warehouseId: warehouse.id, orderNumber: "DEMO-PO-RECEIVED-001", status: "RECEIVED", currency: tenant.currency, notes: "Demo purchase order already received", orderedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), createdBy: owner.id, lines: [{ productId: product.id, quantity: "20.000", receivedQuantity: "20.000", unitCost: "1.1000" }] });
    const receivedDemoPo = await tx.purchaseOrder.findUnique({ where: { tenantId_orderNumber: { tenantId: tenant.id, orderNumber: "DEMO-PO-RECEIVED-001" } }, include: { lines: true } });
    const demoReceiptNumber = "DEMO-GRN-RECEIVED-001";
    const seededReceipt = await tx.purchaseReceipt.findFirst({ where: { tenantId: tenant.id, receiptNumber: demoReceiptNumber }, select: { id: true } });
    if (!seededReceipt && receivedDemoPo?.lines[0]) {
      const receipt = await tx.purchaseReceipt.create({ data: { tenantId: tenant.id, purchaseOrderId: receivedDemoPo.id, warehouseId: warehouse.id, receiptNumber: demoReceiptNumber, receivedBy: owner.id, notes: "Synthetic demo receiving record", receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } });
      await tx.purchaseReceiptLine.create({ data: { tenantId: tenant.id, receiptId: receipt.id, purchaseOrderLineId: receivedDemoPo.lines[0].id, productId: product.id, quantity: "20.000" } });
      const receivedBalance = await tx.inventoryBalance.upsert({ where: { tenantId_warehouseId_productId: { tenantId: tenant.id, warehouseId: warehouse.id, productId: product.id } }, create: { tenantId: tenant.id, warehouseId: warehouse.id, productId: product.id, quantity: "20.000" }, update: { quantity: { increment: new Prisma.Decimal("20.000") } } });
      await tx.stockMovement.create({ data: { tenantId: tenant.id, warehouseId: warehouse.id, productId: product.id, quantityChange: "20.000", quantityAfter: receivedBalance.quantity, reason: `DEMO_SEED: purchase receipt ${demoReceiptNumber}`, actorId: owner.id, recordedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } });
    }

    const sampleShipments = [
      { code: "BOOKED-001", status: ShipmentStatus.BOOKED, path: [ShipmentStatus.BOOKED] },
      { code: "TRANSIT-001", status: ShipmentStatus.IN_TRANSIT, path: [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB, ShipmentStatus.IN_TRANSIT] },
      { code: "DELIVERY-001", status: ShipmentStatus.OUT_FOR_DELIVERY, path: [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY] },
      { code: "DELIVERED-001", status: ShipmentStatus.DELIVERED, path: [ShipmentStatus.BOOKED, ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.COLLECTED, ShipmentStatus.AT_HUB, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED] },
    ];
    for (const sample of sampleShipments) await ensureShipment(tx, tenant, customer, driver, owner.id, sample.code, sample.status, sample.path);
    const volume = await seedDemoVolume(tx, { tenant, owner, driver, warehouse });
    const seedAudit = await tx.auditLog.findFirst({ where: { tenantId: tenant.id, action: "demo.seed.completed" }, select: { id: true } });
    if (!seedAudit) await tx.auditLog.create({ data: { tenantId: tenant.id, actorId: owner.id, action: "demo.seed.completed", targetType: "tenant", targetId: tenant.id, metadata: { source: "local demo seeder" } } });
    return { tenant, branch, volume };
  }, { maxWait: 10_000, timeout: 120_000 });

  console.log(`Seeded sample data in workspace: ${result.tenant.name} (${result.tenant.slug}).`);
  console.log(`Owner login: ${ownerEmail}`);
  console.log(`Driver login: ${driverEmail}`);
  console.log(`Added repeatable synthetic demo volume (${process.env.DEMO_VOLUME_COUNT ?? 250} records per supported list feature):`);
  console.log(JSON.stringify(result.volume, null, 2));
  console.log("Passwords are the hidden passwords you entered (existing demo users were left unchanged).");
  console.log("Seed is repeatable: existing sample records are retained and not overwritten.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Demo data seeding failed.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
