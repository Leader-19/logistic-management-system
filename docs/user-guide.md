# Fleetwise User Guide

This guide describes common workflows in the Fleetwise Logistics Management System. Pages and actions shown in your workspace depend on your role, permissions, and enabled modules. If an action is missing or returns a permission error, ask your workspace administrator to review your access.

## 1. Sign in and choose your workspace

1. Open the Fleetwise web application and sign in with your account.
2. If your account belongs to more than one workspace, choose the workspace you need to work in.
3. Check the workspace name before creating or changing records. Customers, shipments, invoices, and inventory belong to the selected workspace.
4. Use the navigation menu to open the module you need.

If you do not have an account, use **Register** to create a workspace if registration is open. The person who creates it becomes its initial owner. If your company already has a workspace, ask its administrator for an invitation or account.

## 2. Prepare a workspace

Workspace owners and administrators should complete the relevant setup before daily operations:

1. Review workspace and business settings, including currency and invoice defaults.
2. Add team members and make sure each person has only the access needed for their work.
3. Add customers and their addresses before booking shipments or preparing invoices for them.
4. Add operational records needed by the workspace, such as products, drivers, warehouses, or suppliers.
5. Review the relevant plan and user-seat allowance if subscription billing is enabled.

Some configuration options depend on modules and permissions. Platform plans and Stripe billing require platform configuration; see [SaaS subscription billing](saas-billing.md).

## 3. Create and manage shipments

Use the shipment or booking page to create a shipment. Enter the requested customer, sender and recipient details, addresses, package information, and service details. Check names, phone numbers, and destination information before saving. The backend validates shipment data and calculates any supported prices; do not use a browser-displayed amount as a substitute for an issued quote or invoice.

After saving:

1. Note the tracking number shown on the shipment.
2. Open the shipment record to review its details and status history.
3. Use search or filters to find it later.
4. Use only the status actions shown for its current state. An invalid transition is rejected so the shipment history remains consistent.

The tracking number can be shared with the recipient where public tracking is enabled. Public tracking is intended to show only approved shipment information.

## 4. Dispatch and scan a parcel at a hub

Open **Dispatch** to see active shipments and the hub scanning panel.

### Look up a parcel

1. Focus **Tracking barcode**.
2. Scan the parcel barcode, or type its tracking number.
3. If your scanner sends Enter after the barcode, the form submits automatically. Otherwise, select **Find parcel**.
4. Review the parcel details and current status displayed in the result.
5. Select an available next action, such as **Receive at hub** or **Load for transport**, when shown.
6. Optionally enter a **Hub / sorting location** before recording a hub action. That location is included with the event.

Use **Clear** to remove the lookup value and prepare for another scan. If no parcel is found, verify the tracking number and that the shipment is active in the selected workspace.

### Assign a driver

In the active shipment table, select a driver for a shipment that can be assigned, then choose **Assign**. The table may show assignment actions only for eligible shipment states. Confirm that the intended driver is selected before saving.

### Cancel selected shipments

1. Select checkboxes for eligible shipments on the current page.
2. Choose **Cancel selected** and confirm the action.
3. Review the success message for canceled and skipped counts.

Cancellation follows the shipment workflow and records history; it does not erase shipments. Some states cannot be canceled. Batch requests support up to 100 unique IDs, and records outside the selected tenant or in an incompatible state may be skipped. See [Bulk actions](bulk-actions.md).

## 5. Work with warehouse procurement

Where the Supply Chain module is enabled, users with the required permissions can manage suppliers and purchase orders.

1. Add or select an active supplier, warehouse, and products.
2. Create a purchase order with one or more product lines and quantities.
3. Review the supplier, destination warehouse, products, quantities, and costs.
4. Issue the draft order. Only issued orders can be received.
5. Record the quantity received. You can receive an order in multiple deliveries, but each quantity must be positive and cannot exceed the remaining amount.
6. Review the order status and updated warehouse stock after saving the receipt.

Receipts update order quantities, stock balances, and movement history together. Received stock history should not be removed to correct an error. See [Supply chain procurement](supply-chain.md).

## 6. Create and print invoices

### Create a manual invoice

1. Open **Invoices** and choose the manual invoice action.
2. Select an active customer in the current workspace.
3. Enter the due date, notes, and invoice lines. Each line needs a description, quantity, and unit price.
4. Review the displayed invoice details, then create the invoice.

The server calculates line totals, tax, and the invoice total using the workspace currency. If the invoice number is left blank, the system generates one. Created invoices are issued and their financial details are immutable; corrections require a separate adjustment or credit workflow.

Shipment invoices require an eligible delivered shipment. Invoice permissions determine which actions are available.

### Design an invoice template

1. Open **Design templates** from the Invoices page.
2. Edit the supported layout settings and review the sample preview.
3. Save the template. Saving changes creates a new version.
4. If you have settings permission, choose whether it should be the workspace default.

Template changes apply to future invoices. Existing issued invoices retain their saved invoice data. See [Invoice workflows](invoice-workflows.md).

### Print or save as PDF

1. Open the invoice and choose **Print** or the available print settings.
2. Select paper size, orientation, and margins if those options are shown.
3. In the browser's print dialog, choose a connected printer or **Save as PDF**.

The browser controls printer selection and PDF saving; Fleetwise does not silently choose a physical printer.

## 7. Manage team access and subscription

Workspace administrators can add or deactivate members and manage roles where those features are enabled. Grant only permissions required for each person's work. A user can be unable to see a page because of permissions, module availability, or plan limits.

If subscription billing is configured, open **Billing & plan** to view seat usage and available plans. A workspace administrator may start checkout or manage a subscription if the provider and platform plan are configured. See [SaaS subscription billing](saas-billing.md).

## 8. Read shipment history and resolve common problems

- **Page or action is missing:** confirm you are in the correct workspace and ask an administrator to review your role and module access.
- **400 Bad Request:** the server rejected the submitted data or requested operation. Open browser developer tools, select the failed request in **Network**, and review its response message. Correct the field or state described there.
- **403 Forbidden:** your account does not have permission for the action, or the request is outside its allowed scope.
- **404 Not Found:** confirm the record ID or tracking number and the selected workspace. A record from another tenant is intentionally unavailable.
- **409 Conflict:** the record may have changed since it was loaded, or the requested operation conflicts with its current state. Refresh the page and try again if the action is still valid.
- **500 Internal Server Error:** the server failed unexpectedly. Retry only if the action is safe to repeat; for a shipment or invoice action, first check whether the record already changed. Share the request ID and response message with support, but do not send passwords, session tokens, or secret keys.
- **Scan returns no parcel:** check the full tracking number, remove accidental spaces, confirm the selected workspace, and verify that the shipment is not delivered, canceled, or returned.
- **Invoice print layout looks wrong:** reopen print settings, check paper/orientation, and use the browser print preview before printing.

## 9. Safe operating practices

- Confirm the active workspace before creating, editing, or exporting records.
- Check shipment status and destination before recording a transition.
- Confirm batch selections before applying an action.
- Treat invoices, shipment events, stock movements, and audit history as retained business records.
- Avoid refreshing or repeating a payment or other high-impact action until you have checked whether it succeeded.
- Never share your password, session cookie, API token, or secret configuration values.

## Related documentation

- [Project scope](project-scope.md)
- [Project requirements](../projectRequirement.md)
- [Hub scanning and dispatch](hub-scanning.md)
- [Bulk actions](bulk-actions.md)
- [Invoice workflows](invoice-workflows.md)
- [Supply chain procurement](supply-chain.md)
- [SaaS subscription billing](saas-billing.md)
