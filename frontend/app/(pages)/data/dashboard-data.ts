export type ShipmentTone = "blue" | "green" | "amber";

export type ShipmentRow = {
  id: string;
  recipient: string;
  destination: string;
  status: string;
  tone: ShipmentTone;
  eta: string;
};

export const shipments: ShipmentRow[] = [
  { id: "LS-10482", recipient: "Maya Chen", destination: "Bangkok, TH", status: "In transit", tone: "blue", eta: "Today, 14:30" },
  { id: "LS-10481", recipient: "Oliver Grant", destination: "Chiang Mai, TH", status: "Out for delivery", tone: "green", eta: "Today, 11:45" },
  { id: "LS-10480", recipient: "Narin Sutham", destination: "Phuket, TH", status: "Pickup scheduled", tone: "amber", eta: "Oct 17, 09:00" },
  { id: "LS-10479", recipient: "Sofia Reyes", destination: "Pattaya, TH", status: "Delivered", tone: "green", eta: "Oct 16, 08:12" },
];

export const summaryStats = [
  { label: "Shipments today", value: "1,284", delta: "+12.8%", icon: "↗", trend: "M0 23 C15 22 15 9 30 14 S50 25 64 13 83 17 95 9 120 11 140 2" },
  { label: "In transit", value: "846", delta: "Across 12 routes", icon: "◉", trend: "M0 20 C15 14 22 20 35 9 S57 14 72 10 90 19 105 8 127 9 140 5" },
  { label: "Out for delivery", value: "216", delta: "98.2% on schedule", icon: "⌖", trend: "M0 21 C18 21 19 9 35 14 S52 23 67 12 86 16 101 8 121 12 140 3" },
  { label: "Needs attention", value: "18", delta: "6 require action", icon: "!", trend: "M0 24 C14 15 21 20 36 13 S58 20 72 10 91 16 107 9 126 11 140 4" },
];
