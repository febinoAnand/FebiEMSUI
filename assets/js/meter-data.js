/* Energy Dashboard — demo meter registry (generated from the meter tree on meters.html).
   Main meters carry their own (actual) reading; each sub-meter reports through its parent's device.
   phase: 3 = three-phase (4-wire, 415 V L-L / 230 V L-N), 1 = single-phase (2-wire, 230 V). */
window.ED_METERS = [
 {
  "id": "MTR-1001",
  "phase": 3,
  "name": "Main Incomer",
  "model": "Schneider PM5560",
  "location": "Main LT Panel",
  "device": "GW-01",
  "deviceName": "Main LT Panel Gateway",
  "icon": "i-cpu",
  "color": "--cyan",
  "power": 67.1,
  "energy": 8712,
  "load": 72,
  "status": "Online",
  "subs": [
   {
    "id": "SM-1001-01",
    "phase": 3,
    "name": "Feeder A · Production Line 1",
    "ct": "CT 400/5",
    "power": 24.8,
    "energy": 3120,
    "load": 78,
    "status": "Online"
   },
   {
    "id": "SM-1001-02",
    "phase": 3,
    "name": "Feeder B · Production Line 2",
    "ct": "CT 400/5",
    "power": 21.6,
    "energy": 2840,
    "load": 70,
    "status": "Online"
   },
   {
    "id": "SM-1001-03",
    "phase": 3,
    "name": "Feeder C · Tool Room",
    "ct": "CT 200/5",
    "power": 11.4,
    "energy": 1560,
    "load": 57,
    "status": "Online"
   },
   {
    "id": "SM-1001-04",
    "phase": 3,
    "name": "Feeder D · Welding Bay",
    "ct": "CT 200/5",
    "power": 7.4,
    "energy": 930,
    "load": 41,
    "status": "Idle"
   }
  ],
  "kind": "consumer"
 },
 {
  "id": "MTR-1002",
  "phase": 3,
  "name": "HVAC",
  "model": "Secure Elite 440",
  "location": "Utility Block",
  "device": "GW-02",
  "deviceName": "Utility Block Data Logger",
  "icon": "i-thermo",
  "color": "--cyan",
  "power": 22.6,
  "energy": 2236,
  "load": 91,
  "status": "Online",
  "subs": [
   {
    "id": "SM-1002-01",
    "phase": 3,
    "name": "Chiller-1",
    "ct": "Direct 63 A",
    "power": 8.6,
    "energy": 860,
    "load": 86,
    "status": "Online"
   },
   {
    "id": "SM-1002-02",
    "phase": 3,
    "name": "Chiller-2",
    "ct": "Direct 63 A",
    "power": 9.5,
    "energy": 905,
    "load": 95,
    "status": "Online"
   },
   {
    "id": "SM-1002-03",
    "phase": 3,
    "name": "AHU · Level 1–3",
    "ct": "CT 100/5",
    "power": 3.9,
    "energy": 415,
    "load": 52,
    "status": "Online"
   }
  ],
  "kind": "consumer"
 },
 {
  "id": "MTR-1003",
  "phase": 3,
  "name": "Office",
  "model": "L&T WL4405",
  "location": "Admin Building",
  "device": "GW-03",
  "deviceName": "Admin Block Gateway",
  "icon": "i-building",
  "color": "--amber",
  "power": 12.3,
  "energy": 1004,
  "load": 28,
  "status": "Idle",
  "subs": [
   {
    "id": "SM-1003-01",
    "phase": 3,
    "name": "Ground floor DB",
    "ct": "Direct 32 A",
    "power": 3.1,
    "energy": 260,
    "load": 31,
    "status": "Online"
   },
   {
    "id": "SM-1003-02",
    "phase": 3,
    "name": "First floor DB",
    "ct": "Direct 32 A",
    "power": 2.8,
    "energy": 240,
    "load": 28,
    "status": "Idle"
   },
   {
    "id": "SM-1003-03",
    "phase": 3,
    "name": "Second floor DB",
    "ct": "Direct 32 A",
    "power": 2.4,
    "energy": 205,
    "load": 24,
    "status": "Idle"
   },
   {
    "id": "SM-1003-04",
    "phase": 1,
    "name": "Conference wing",
    "ct": "Direct 16 A",
    "power": 1.9,
    "energy": 140,
    "load": 38,
    "status": "Online"
   },
   {
    "id": "SM-1003-05",
    "phase": 3,
    "name": "Office UPS",
    "ct": "Direct 32 A",
    "power": 1.8,
    "energy": 135,
    "load": 20,
    "status": "Online"
   }
  ],
  "kind": "consumer"
 },
 {
  "id": "MTR-1004",
  "phase": 3,
  "name": "Data Centre",
  "model": "Schneider PM2220",
  "location": "Server Room · L2",
  "device": "GW-04",
  "deviceName": "Server Room Gateway",
  "icon": "i-wifi",
  "color": "--violet",
  "power": 12.4,
  "energy": 3108,
  "load": 64,
  "status": "Online",
  "subs": [
   {
    "id": "SM-1004-01",
    "phase": 3,
    "name": "UPS-A feeder",
    "ct": "CT 100/5",
    "power": 6.2,
    "energy": 1480,
    "load": 62,
    "status": "Online"
   },
   {
    "id": "SM-1004-02",
    "phase": 3,
    "name": "UPS-B feeder",
    "ct": "CT 100/5",
    "power": 0,
    "energy": 1110,
    "load": 0,
    "status": "Offline"
   },
   {
    "id": "SM-1004-03",
    "phase": 3,
    "name": "Precision AC",
    "ct": "Direct 32 A",
    "power": 4.1,
    "energy": 330,
    "load": 68,
    "status": "Online"
   },
   {
    "id": "SM-1004-04",
    "phase": 1,
    "name": "Rack lighting",
    "ct": "Direct 10 A",
    "power": 0.3,
    "energy": 100,
    "load": 22,
    "status": "Online"
   }
  ],
  "kind": "consumer"
 },
 {
  "id": "MTR-1005",
  "phase": 3,
  "name": "Lighting",
  "model": "Elmeasure LG+ 1129",
  "location": "Plant-wide",
  "device": "GW-01",
  "deviceName": "Main LT Panel Gateway",
  "icon": "i-sun",
  "color": "--amber",
  "power": 14.1,
  "energy": 1442,
  "load": 55,
  "status": "Online",
  "subs": [
   {
    "id": "SM-1005-01",
    "phase": 3,
    "name": "Shop floor high-bays",
    "ct": "CT 60/5",
    "power": 6.4,
    "energy": 640,
    "load": 64,
    "status": "Online"
   },
   {
    "id": "SM-1005-02",
    "phase": 1,
    "name": "Street lights",
    "ct": "Direct 32 A",
    "power": 2.1,
    "energy": 180,
    "load": 42,
    "status": "Online"
   },
   {
    "id": "SM-1005-03",
    "phase": 3,
    "name": "Warehouse",
    "ct": "Direct 32 A",
    "power": 2.6,
    "energy": 260,
    "load": 52,
    "status": "Online"
   },
   {
    "id": "SM-1005-04",
    "phase": 1,
    "name": "Admin corridors",
    "ct": "Direct 16 A",
    "power": 1.2,
    "energy": 130,
    "load": 40,
    "status": "Online"
   },
   {
    "id": "SM-1005-05",
    "phase": 1,
    "name": "Security & gate",
    "ct": "Direct 10 A",
    "power": 0.7,
    "energy": 90,
    "load": 35,
    "status": "Online"
   },
   {
    "id": "SM-1005-06",
    "phase": 1,
    "name": "Emergency lighting",
    "ct": "Direct 10 A",
    "power": 0.8,
    "energy": 110,
    "load": 26,
    "status": "Idle"
   }
  ],
  "kind": "consumer"
 },
 {
  "id": "MTR-1006",
  "phase": 3,
  "name": "Compressor House",
  "model": "Schneider PM5560",
  "location": "Utility Block",
  "device": "GW-02",
  "deviceName": "Utility Block Data Logger",
  "icon": "i-plug",
  "color": "--green",
  "power": 0,
  "energy": 4190,
  "load": 0,
  "status": "Offline",
  "subs": [
   {
    "id": "SM-1006-01",
    "phase": 3,
    "name": "Screw compressor 1",
    "ct": "CT 200/5",
    "power": 0,
    "energy": 2210,
    "load": 0,
    "status": "Offline"
   },
   {
    "id": "SM-1006-02",
    "phase": 3,
    "name": "Screw compressor 2",
    "ct": "CT 200/5",
    "power": 0,
    "energy": 1640,
    "load": 0,
    "status": "Offline"
   },
   {
    "id": "SM-1006-03",
    "phase": 3,
    "name": "Air dryer",
    "ct": "Direct 32 A",
    "power": 0,
    "energy": 262,
    "load": 0,
    "status": "Offline"
   }
  ],
  "kind": "consumer"
 },
 {
  "id": "MTR-1007",
  "phase": 3,
  "name": "Rooftop Solar",
  "model": "Fronius Smart Meter",
  "location": "Roof · Block A",
  "device": "GW-05",
  "deviceName": "Rooftop Solar Edge Device",
  "icon": "i-sun",
  "color": "--blue",
  "power": -18.2,
  "energy": 1262,
  "load": 62,
  "status": "Generating",
  "subs": [
   {
    "id": "SM-1007-01",
    "phase": 3,
    "name": "Inverter 1 · 25 kWp",
    "ct": "Direct 63 A",
    "power": -10.2,
    "energy": 704,
    "load": 68,
    "status": "Generating"
   },
   {
    "id": "SM-1007-02",
    "phase": 3,
    "name": "Inverter 2 · 20 kWp",
    "ct": "Direct 63 A",
    "power": -8.4,
    "energy": 580,
    "load": 56,
    "status": "Generating"
   }
  ],
  "kind": "generator"
 },
 {
  "id": "MTR-1008",
  "phase": 3,
  "name": "DG Set 1",
  "model": "Deepsea DSE7320",
  "location": "DG Yard",
  "device": "GW-06",
  "deviceName": "DG & EV Yard Gateway",
  "icon": "i-battery",
  "color": "--rose",
  "power": 0,
  "energy": 216,
  "load": 0,
  "status": "Standby",
  "subs": [
   {
    "id": "SM-1008-01",
    "phase": 3,
    "name": "DG output · 250 kVA",
    "ct": "CT 400/5",
    "power": 0,
    "energy": 212,
    "load": 0,
    "status": "Standby"
   }
  ],
  "kind": "generator"
 },
 {
  "id": "MTR-1009",
  "phase": 3,
  "name": "Water Pumps",
  "model": "Elmeasure LG+ 5310",
  "location": "Pump House",
  "device": "GW-02",
  "deviceName": "Utility Block Data Logger",
  "icon": "i-activity",
  "color": "--cyan",
  "power": 8.8,
  "energy": 1089,
  "load": 47,
  "status": "Online",
  "subs": [
   {
    "id": "SM-1009-01",
    "phase": 3,
    "name": "Borewell pump",
    "ct": "Direct 32 A",
    "power": 3.2,
    "energy": 410,
    "load": 58,
    "status": "Online"
   },
   {
    "id": "SM-1009-02",
    "phase": 3,
    "name": "Transfer pump",
    "ct": "Direct 32 A",
    "power": 2.4,
    "energy": 300,
    "load": 48,
    "status": "Online"
   },
   {
    "id": "SM-1009-03",
    "phase": 3,
    "name": "Fire hydrant jockey",
    "ct": "Direct 16 A",
    "power": 0.8,
    "energy": 96,
    "load": 20,
    "status": "Idle"
   },
   {
    "id": "SM-1009-04",
    "phase": 3,
    "name": "STP blowers",
    "ct": "Direct 32 A",
    "power": 2.2,
    "energy": 260,
    "load": 44,
    "status": "Online"
   }
  ],
  "kind": "consumer"
 },
 {
  "id": "MTR-1010",
  "phase": 3,
  "name": "Canteen",
  "model": "L&T WL4405",
  "location": "Amenities Block",
  "device": "GW-03",
  "deviceName": "Admin Block Gateway",
  "icon": "i-building",
  "color": "--violet",
  "power": 4.3,
  "energy": 553,
  "load": 35,
  "status": "Online",
  "subs": [
   {
    "id": "SM-1010-01",
    "phase": 3,
    "name": "Kitchen equipment",
    "ct": "Direct 32 A",
    "power": 2.6,
    "energy": 330,
    "load": 43,
    "status": "Online"
   },
   {
    "id": "SM-1010-02",
    "phase": 3,
    "name": "Cold storage",
    "ct": "Direct 16 A",
    "power": 1.1,
    "energy": 150,
    "load": 55,
    "status": "Online"
   },
   {
    "id": "SM-1010-03",
    "phase": 1,
    "name": "Dining hall",
    "ct": "Direct 16 A",
    "power": 0.5,
    "energy": 60,
    "load": 12,
    "status": "Idle"
   }
  ],
  "kind": "consumer"
 },
 {
  "id": "MTR-1011",
  "phase": 3,
  "name": "EV Charging",
  "model": "Secure Elite 440",
  "location": "Parking · P1",
  "device": "GW-06",
  "deviceName": "DG & EV Yard Gateway",
  "icon": "i-plug",
  "color": "--green",
  "power": 7.6,
  "energy": 397,
  "load": 49,
  "status": "Online",
  "subs": [
   {
    "id": "SM-1011-01",
    "phase": 1,
    "name": "Charger 1 · 7.4 kW AC",
    "ct": "Direct 32 A",
    "power": 7.4,
    "energy": 240,
    "load": 100,
    "status": "Online"
   },
   {
    "id": "SM-1011-02",
    "phase": 1,
    "name": "Charger 2 · 7.4 kW AC",
    "ct": "Direct 32 A",
    "power": 0,
    "energy": 148,
    "load": 0,
    "status": "Idle"
   }
  ],
  "kind": "consumer"
 },
 {
  "id": "MTR-1012",
  "phase": 3,
  "name": "Paint Shop",
  "model": "Schneider PM5560",
  "location": "Block C",
  "device": "GW-01",
  "deviceName": "Main LT Panel Gateway",
  "icon": "i-cpu",
  "color": "--rose",
  "power": 0,
  "energy": 2968,
  "load": 0,
  "status": "Maintenance",
  "subs": [
   {
    "id": "SM-1012-01",
    "phase": 3,
    "name": "Spray booth",
    "ct": "CT 200/5",
    "power": 0,
    "energy": 1420,
    "load": 0,
    "status": "Maintenance"
   },
   {
    "id": "SM-1012-02",
    "phase": 3,
    "name": "Curing oven",
    "ct": "CT 200/5",
    "power": 0,
    "energy": 1210,
    "load": 0,
    "status": "Maintenance"
   },
   {
    "id": "SM-1012-03",
    "phase": 3,
    "name": "Exhaust fans",
    "ct": "Direct 32 A",
    "power": 0,
    "energy": 275,
    "load": 0,
    "status": "Maintenance"
   }
  ],
  "kind": "consumer"
 }
];
