/* ==========================================================================
   Energy Dashboard — hardware catalogue (real products)
   Specifications of the gateways and energy meters this deployment uses, as
   published by their manufacturers. Device and meter records point to a
   catalogue entry by model; pages and forms read the hardware facts from here
   (interfaces, protocols, accuracy class, register map) so they match the
   real product. Register addresses follow the manufacturer's register list
   (1-based, function code 03, Float32 big-endian unless stated) — always check
   them against the meter's own Modbus register list before commissioning.
   ========================================================================== */
(function () {
  var DEVICE_MODELS = {
    "Moxa MGate MB3170": {
      maker: "Moxa", kind: "Modbus TCP ↔ RTU gateway",
      ethernet: "2 × 10/100 Mbps RJ45", serial: "1 × RS-232 / RS-422 / RS-485 (DB9 male)",
      protocols: ["Modbus TCP", "Modbus RTU", "Modbus ASCII"], uplinks: ["Modbus TCP (polled)"],
      defaults: { ip: "192.168.127.254", port: 502 }, power: "12–48 VDC",
      note: "Polled by the platform over Modbus TCP; forwards each request to the RS-485 meters by slave ID.",
    },
    "Schneider Link150": {
      maker: "Schneider Electric", kind: "Ethernet ↔ serial Modbus gateway",
      ethernet: "2 × 10/100 Mbps RJ45", serial: "1 × RS-485 (2- or 4-wire) / RS-232",
      protocols: ["Modbus TCP", "Modbus RTU"], uplinks: ["Modbus TCP (polled)"],
      defaults: { port: 502 }, power: "24 VDC or PoE",
      note: "Transparent Modbus TCP to RTU gateway configured from its web pages.",
    },
    "Schneider Com'X 510": {
      maker: "Schneider Electric", kind: "Energy server · data logger",
      ethernet: "2 × 10/100 Mbps RJ45", serial: "1 × RS-485 Modbus (master)",
      io: "6 digital inputs (pulse) · 2 analog inputs",
      protocols: ["Modbus RTU", "Modbus TCP"], uplinks: ["HTTPS (push)"],
      defaults: { port: 443 }, power: "24 VDC or 100–230 VAC",
      note: "Logs meter data locally and publishes it to the platform over HTTPS.",
    },
    "Siemens SIMATIC IOT2050": {
      maker: "Siemens", kind: "Industrial edge device (Node-RED)",
      ethernet: "2 × Gigabit Ethernet RJ45 (Advanced)", serial: "1 × RS-232 / RS-422 / RS-485 (COM)",
      protocols: ["Modbus RTU", "Modbus TCP"], uplinks: ["MQTT (push)"],
      defaults: { port: 8883 }, power: "12–24 VDC",
      note: "Node-RED flow reads the RS-485 meters and publishes readings to the MQTT broker.",
    },
    "Teltonika TRB245": {
      maker: "Teltonika", kind: "Industrial 4G LTE gateway",
      ethernet: "1 × 10/100 Mbps RJ45", serial: "1 × RS-232 · 1 × RS-485", cellular: "4G LTE Cat 4",
      io: "Digital inputs / outputs",
      protocols: ["Modbus RTU", "Modbus TCP"], uplinks: ["MQTT (push)"],
      defaults: { port: 8883 }, power: "9–50 VDC",
      note: "RutOS Modbus master reads the meter and sends data to the MQTT broker over 4G.",
    },
    "Milesight UG65": {
      maker: "Milesight", kind: "LoRaWAN gateway",
      ethernet: "1 × 10/100 Mbps RJ45", wireless: "Wi-Fi · LoRaWAN 8-channel (IN865)", cellular: "4G LTE (optional)",
      protocols: ["LoRaWAN"], uplinks: ["MQTT (push)"],
      defaults: { port: 8883 }, power: "PoE or 12 VDC",
      note: "Built-in network server decodes LoRaWAN node uplinks and publishes them over MQTT.",
      fieldNode: "Milesight UC501 LoRaWAN controller (RS-485 Modbus master) at each meter",
    },
  };

  // Schneider PowerLogic PM5000 / PM2000 basic register list (shared addresses)
  var PM_MAP = [
    ["Current L1", 3000, "Float32", "A"], ["Current L2", 3002, "Float32", "A"], ["Current L3", 3004, "Float32", "A"], ["Current avg", 3010, "Float32", "A"],
    ["Voltage L1-L2", 3020, "Float32", "V"], ["Voltage L2-L3", 3022, "Float32", "V"], ["Voltage L3-L1", 3024, "Float32", "V"],
    ["Voltage L1-N", 3028, "Float32", "V"], ["Voltage L2-N", 3030, "Float32", "V"], ["Voltage L3-N", 3032, "Float32", "V"], ["Voltage L-N avg", 3036, "Float32", "V"],
    ["Active power total", 3060, "Float32", "kW"], ["Reactive power total", 3068, "Float32", "kVAr"], ["Apparent power total", 3076, "Float32", "kVA"],
    ["Power factor total", 3084, "Float32 (4Q FP)", ""], ["Frequency", 3110, "Float32", "Hz"],
    ["Active energy delivered (import)", 2700, "Float32", "kWh"], ["Active energy received (export)", 2702, "Float32", "kWh"],
  ];
  var PM_THD = [["THD current L1", 21300, "Float32", "%"], ["THD voltage L1-N", 21330, "Float32", "%"]];
  var IEM_MAP = [
    ["Current L1", 3000, "Float32", "A"], ["Voltage L1-N", 3028, "Float32", "V"], ["Active power total", 3060, "Float32", "kW"],
    ["Power factor total", 3084, "Float32", ""], ["Frequency", 3110, "Float32", "Hz"], ["Total active energy import", 3204, "Int64", "Wh"],
  ];

  var METER_MODELS = {
    "Schneider PM5560": {
      maker: "Schneider Electric", kind: "Power quality meter (PowerLogic PM5000)", mclass: "pq",
      accuracy: "Class 0.2S (IEC 62053-22)", comms: "2 × Ethernet (Modbus TCP) · 1 × RS-485 (Modbus RTU)",
      wiring: ["3P4W", "3P3W", "1P2W"], inputs: "CT 1 A / 5 A secondary · PT supported", extras: "Harmonics to the 63rd · 4 DI · 2 DO",
      map: "Schneider PM5xxx", registers: PM_MAP.concat(PM_THD),
    },
    "Schneider PM2220": {
      maker: "Schneider Electric", kind: "Multifunction meter (PowerLogic PM2000)", mclass: "pq",
      accuracy: "Class 1 (IEC 62053-21)", comms: "1 × RS-485 (Modbus RTU)",
      wiring: ["3P4W", "3P3W", "1P2W"], inputs: "CT 1 A / 5 A secondary", extras: "THD per phase",
      map: "Schneider PM2xxx", registers: PM_MAP.concat(PM_THD),
    },
    "Schneider EM6400NG": {
      maker: "Schneider Electric", kind: "Multifunction meter (EasyLogic)", mclass: "multi",
      accuracy: "Class 1 / Class 0.5S (by variant)", comms: "1 × RS-485 (Modbus RTU)",
      wiring: ["3P4W", "3P3W", "1P2W"], inputs: "CT 1 A / 5 A secondary",
      map: "Schneider EM6400NG", registers: null,
    },
    "Schneider iEM3255": {
      maker: "Schneider Electric", kind: "DIN-rail energy meter (Acti9 iEM3000)", mclass: "basic",
      accuracy: "Class 0.5S (IEC 62053-22)", comms: "1 × RS-485 (Modbus RTU)",
      wiring: ["3P4W", "3P3W", "1P2W"], inputs: "CT 1 A / 5 A secondary",
      map: "Schneider iEM3xxx", registers: IEM_MAP,
    },
    "Secure Elite 440": {
      maker: "Secure Meters", kind: "Multifunction meter", mclass: "multi",
      accuracy: "Class 0.5S", comms: "1 × RS-485 (Modbus RTU)",
      wiring: ["3P4W", "3P3W"], inputs: "CT 1 A / 5 A secondary",
      map: "Secure Elite 4xx", registers: null,
    },
    "Fronius Smart Meter TS 65A-3": {
      maker: "Fronius", kind: "Three-phase bidirectional meter (direct, 65 A)", mclass: "multi",
      accuracy: "Class 1 (IEC 62053-21)", comms: "1 × RS-485 (Modbus RTU) to the Fronius inverter",
      wiring: ["3P4W"], inputs: "Direct connected up to 65 A",
      map: "SunSpec meter model (via inverter)", registers: null,
    },
    "Deep Sea DSE7320 MKII": {
      maker: "Deep Sea Electronics", kind: "Auto mains failure (AMF) genset controller", mclass: "dg",
      accuracy: "Controller-grade metering", comms: "1 × RS-232 · 1 × RS-485 (Modbus RTU, GenComm) · USB (config)",
      wiring: ["3P4W"], inputs: "Generator and mains sensing · CT inputs",
      map: "DSE GenComm", registers: null,
    },
  };

  window.ED_HW = { devices: DEVICE_MODELS, meters: METER_MODELS };
})();
